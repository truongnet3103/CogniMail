import type { Email, EmailFilter, LastFetchMeta, UserConfig } from "./shared-types";

export type RequestUser = {
  userId: string;
};

export type AppContext = {
  userId: string;
};

export type ConfigRepo = {
  getConfig: (ctx: AppContext) => Promise<UserConfig | null>;
  saveConfig: (ctx: AppContext, config: UserConfig) => Promise<void>;
};

export type EmailRepo = {
  saveEmails: (ctx: AppContext, emails: Email[]) => Promise<void>;
  getRecentEmails: (ctx: AppContext, limit: number) => Promise<Email[]>;
  saveLastFetchMeta: (ctx: AppContext, meta: LastFetchMeta) => Promise<void>;
};

export type TaskRepo = {
  saveTasks: (ctx: AppContext, tasks: { id: string; [key: string]: unknown }[]) => Promise<void>;
};

export type VerifyIdToken = (token: string) => Promise<{ uid: string }>;

export type EmailService = {
  fetchEmails: (imapConfig: UserConfig["imap"], filter: EmailFilter) => Promise<Email[]>;
  testConnection: (imapConfig: UserConfig["imap"]) => Promise<void>;
};

export type ParserService = {
  attachMetadata: (emails: Email[]) => Email[];
};
