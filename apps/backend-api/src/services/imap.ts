import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { Email, EmailFilter, ImapConfig } from "../shared-types";
import { extractPrimaryText, flattenText, isAutomatedMail } from "./emailCleaning";

const normalizeAddress = (value?: { name?: string; address?: string } | null) => ({
  name: value?.name,
  address: value?.address ?? "unknown@example.com",
});

const normalizeDocId = (value: string) => value.replace(/[<>/\\?#\[\]]/g, "_");
const buildClient = (imapConfig: ImapConfig) =>
  new ImapFlow({
    host: imapConfig.host,
    port: imapConfig.port,
    secure: imapConfig.secure,
    auth: {
      user: imapConfig.username,
      pass: imapConfig.password,
    },
    logger: false,
  });

export const testImapConnection = async (imapConfig: ImapConfig): Promise<void> => {
  const client = buildClient(imapConfig);
  await client.connect();
  try {
    const lock = await client.getMailboxLock(imapConfig.mailbox ?? "INBOX");
    lock.release();
  } finally {
    await client.logout();
  }
};

export const fetchImapEmails = async (imapConfig: ImapConfig, filter: EmailFilter): Promise<Email[]> => {
  if (process.env.MOCK_IMAP === "true") {
    return [];
  }

  const client = buildClient(imapConfig);

  await client.connect();
  try {
    const lock = await client.getMailboxLock(imapConfig.mailbox ?? filter.mailbox ?? "INBOX");
    try {
      const query: Record<string, unknown> = {};
      if (filter.dateFrom) {
        query.since = new Date(filter.dateFrom);
      }
      if (filter.dateTo) {
        query.before = new Date(filter.dateTo);
      }
      if (filter.sender && !filter.sender.includes(",")) {
        query.from = filter.sender;
      }
      if (filter.status === "read") {
        query.seen = true;
      }
      if (filter.status === "unread") {
        query.seen = false;
      }

      const uids = await client.search(query);
      const uidList = Array.isArray(uids) ? uids : [];
      const requestedLimit = Math.min(100, Math.max(1, filter.limit ?? 50));
      const scanCount = Math.min(uidList.length, Math.max(requestedLimit * 8, 200));
      const candidateUids = uidList.slice(-scanCount).reverse();
      const emailsById = new Map<string, Email>();
      const dateFromMs = filter.dateFrom ? new Date(filter.dateFrom).getTime() : Number.NEGATIVE_INFINITY;
      const dateToMs = filter.dateTo ? new Date(filter.dateTo).getTime() : Number.POSITIVE_INFINITY;

      for (const uid of candidateUids) {
        const message = await client.fetchOne(uid, {
          uid: true,
          envelope: true,
          bodyStructure: true,
          source: true,
          internalDate: true,
        });

        if (!message || !message.source) {
          continue;
        }

        const parsed = await simpleParser(message.source);
        const now = new Date().toISOString();
        const fromList = Array.isArray((parsed.from as { value?: unknown[] } | undefined)?.value)
          ? ((parsed.from as { value?: unknown[] }).value as { name?: string; address?: string }[])
          : [];
        const toList = Array.isArray((parsed.to as { value?: unknown[] } | undefined)?.value)
          ? ((parsed.to as { value?: unknown[] }).value as { name?: string; address?: string }[])
          : [];
        const ccList = Array.isArray((parsed.cc as { value?: unknown[] } | undefined)?.value)
          ? ((parsed.cc as { value?: unknown[] }).value as { name?: string; address?: string }[])
          : [];
        const parsedDate =
          parsed.date instanceof Date
            ? parsed.date
            : parsed.date
              ? new Date(parsed.date)
              : message.internalDate instanceof Date
                ? message.internalDate
                : new Date();
        const messageId = parsed.messageId ?? `uid-${uid}`;
        const safeId = normalizeDocId(messageId);
        const subject = parsed.subject ?? "(No Subject)";
        const fromAddress = normalizeAddress(fromList[0]).address;
        const rawText = parsed.text ?? "";
        const textBody = extractPrimaryText(rawText);
        const snippet = flattenText(textBody).slice(0, 220);
        const parsedDateMs = parsedDate.getTime();

        if (Number.isNaN(parsedDateMs) || parsedDateMs < dateFromMs || parsedDateMs > dateToMs) {
          continue;
        }

        if (isAutomatedMail(fromAddress, subject)) {
          continue;
        }
        if (!snippet) {
          continue;
        }

        emailsById.set(safeId, {
          id: safeId,
          subject,
          from: { ...normalizeAddress(fromList[0]), address: fromAddress },
          to: toList.map(normalizeAddress),
          cc: ccList.map(normalizeAddress),
          date: parsedDate.toISOString(),
          textBody: textBody ? textBody.slice(0, 25000) : undefined,
          hasAttachment: (parsed.attachments?.length ?? 0) > 0,
          mailbox: imapConfig.mailbox ?? filter.mailbox ?? "INBOX",
          createdAt: now,
          updatedAt: now,
        });

        if (emailsById.size >= requestedLimit && !filter.sender) {
          // We already have enough valid newest emails.
          break;
        }
      }

      let result = [...emailsById.values()];
      if (filter.sender) {
        const terms = filter.sender
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean);
        if (terms.length > 0) {
          result = result.filter((email) => {
            const fromAddress = email.from.address.toLowerCase();
            return terms.some((term) => fromAddress.includes(term));
          });
        }
      }

      result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return result.slice(0, requestedLimit);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
};

