import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { Email, EmailFilter, ImapConfig } from "../shared-types";
import { extractPrimaryText, flattenText, isAutomatedMail } from "./emailCleaning";

const normalizeAddress = (value?: { name?: string; address?: string } | null) => ({
  name: value?.name,
  address: value?.address ?? "unknown@example.com",
});

const normalizeDocId = (value: string) => value.replace(/[<>/\\?#\[\]]/g, "_");
const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const buildClient = (imapConfig: ImapConfig) =>
  new ImapFlow({
    host: imapConfig.host,
    port: imapConfig.port,
    secure: imapConfig.secure,
    connectionTimeout: Number(process.env.IMAP_CONNECTION_TIMEOUT_MS ?? 120000),
    greetingTimeout: Number(process.env.IMAP_GREETING_TIMEOUT_MS ?? 30000),
    socketTimeout: Number(process.env.IMAP_SOCKET_TIMEOUT_MS ?? 180000),
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

type FetchImapOptions = {
  shouldCancel?: () => boolean;
  onClient?: (client: ImapFlow | null) => void;
};

export const fetchImapEmails = async (
  imapConfig: ImapConfig,
  filter: EmailFilter,
  options?: FetchImapOptions,
): Promise<Email[]> => {
  if (process.env.MOCK_IMAP === "true") {
    return [];
  }

  const client = buildClient(imapConfig);
  options?.onClient?.(client);

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
      const scanCount = Math.min(uidList.length, Math.max(requestedLimit * 3, 10));
      const candidateUids = uidList.slice(-scanCount).reverse();
      const emailsById = new Map<string, Email>();
      const dateFromMs = filter.dateFrom ? new Date(filter.dateFrom).getTime() : Number.NEGATIVE_INFINITY;
      const dateToMs = filter.dateTo ? new Date(filter.dateTo).getTime() : Number.POSITIVE_INFINITY;
      const perMessageTimeoutMs = Number(process.env.IMAP_MESSAGE_TIMEOUT_MS ?? 15000);

      for (const uid of candidateUids) {
        if (options?.shouldCancel?.()) {
          throw new Error("Fetch cancelled by user");
        }
        let message:
          | {
              uid?: number;
              source?: Buffer;
              internalDate?: Date | string;
            }
          | false
          | null = null;
        try {
          message = await withTimeout(
            client.fetchOne(uid, {
              uid: true,
              envelope: true,
              bodyStructure: true,
              source: true,
              internalDate: true,
            }),
            perMessageTimeoutMs,
          );
        } catch {
          continue;
        }

        if (!message || !message.source) {
          continue;
        }

        let parsed: Awaited<ReturnType<typeof simpleParser>>;
        try {
          parsed = await withTimeout(simpleParser(message.source), perMessageTimeoutMs);
        } catch {
          continue;
        }
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
    options?.onClient?.(null);
    await client.logout();
  }
};



