import type { RequestHandler } from "express";
import type { EmailFilter, LastFetchMeta, PaginationInfo } from "../shared-types";
import { emailFilterSchema } from "../schemas";
import type { ConfigRepo, EmailRepo, EmailService, ParserService } from "../types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const hasAnyGroupMatch = (
  fromAddress: string,
  participantAddresses: string[],
  selectedGroups: string[],
  tagMapping: Record<string, string[]>,
) => {
  if (selectedGroups.length === 0) return true;
  const fromLower = fromAddress.toLowerCase();
  const participantsLower = participantAddresses.map((item) => item.toLowerCase());

  return selectedGroups.some((groupName) => {
    const mapped = (tagMapping[groupName] ?? []).map((value) => value.toLowerCase());
    if (mapped.length === 0) return false;
    return mapped.some(
      (value) =>
        fromLower.includes(value) ||
        participantsLower.some((participant) => participant.includes(value)),
    );
  });
};

const toFilter = (query: Record<string, string | string[] | undefined>): EmailFilter => {
  const tagsParam = query.tags;
  const tags = typeof tagsParam === "string" ? tagsParam.split(",").filter(Boolean) : undefined;

  const parsed = emailFilterSchema.parse({
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    status: query.status,
    sender: query.sender,
    tags,
    mailbox: query.mailbox,
    limit: query.limit,
    cursor: query.cursor,
  });

  return {
    dateFrom: parsed.dateFrom,
    dateTo: parsed.dateTo,
    status: parsed.status,
    sender: parsed.sender,
    tags: parsed.tags,
    mailbox: parsed.mailbox,
    limit: parsed.limit,
    cursor: parsed.cursor,
  };
};

export const getEmailsRoute = (
  configRepo: ConfigRepo,
  emailRepo: EmailRepo,
  emailService: EmailService,
  parserService: ParserService,
): RequestHandler => {
  return async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const config = await configRepo.getConfig({ userId });
    if (!config) {
      res.status(400).json({ error: "Missing IMAP config" });
      return;
    }

    const filter = toFilter(req.query as Record<string, string | string[] | undefined>);
    const limit = Math.min(filter.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const fetched = await emailService.fetchEmails(config.imap, {
      ...filter,
      limit,
    });

    const withMetadata = parserService.attachMetadata(fetched);
    const filteredByGroup =
      filter.tags && filter.tags.length > 0
        ? withMetadata.filter((email) => {
            const participants = [
              ...(email.to ?? []).map((item) => item.address),
              ...(email.cc ?? []).map((item) => item.address),
            ];
            return hasAnyGroupMatch(
              email.from.address,
              participants,
              filter.tags ?? [],
              config.ai.tagMapping ?? {},
            );
          })
        : withMetadata;
    const cursorTime = filter.cursor ? new Date(filter.cursor).getTime() : undefined;

    const filteredByCursor = cursorTime
      ? filteredByGroup.filter((email) => new Date(email.date).getTime() < cursorTime)
      : filteredByGroup;

    const limited = filteredByCursor.slice(0, limit);
    const nextItem = filteredByCursor.at(limit);

    const pagination: PaginationInfo = {
      limit,
      nextCursor: nextItem?.date,
      hasMore: Boolean(nextItem),
    };

    await emailRepo.saveEmails({ userId }, limited);

    const lastFetchMeta: LastFetchMeta = {
      fetchedAt: new Date().toISOString(),
      requestFilter: {
        ...filter,
        limit,
      },
      pagination,
      count: limited.length,
    };

    await emailRepo.saveLastFetchMeta({ userId }, lastFetchMeta);

    res.json({
      rawEmails: limited,
      pagination,
    });
  };
};

