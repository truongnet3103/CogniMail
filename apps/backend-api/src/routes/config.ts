import type { RequestHandler } from "express";
import { configSchema, imapTestSchema } from "../schemas";
import type { ConfigRepo, EmailService } from "../types";
import type { UserConfig } from "../shared-types";

export const getConfigRoute = (configRepo: ConfigRepo): RequestHandler => {
  return async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const config = await configRepo.getConfig({ userId });
    res.json({ config });
  };
};

export const postConfigRoute = (configRepo: ConfigRepo): RequestHandler => {
  return async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = configSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid config payload", detail: parsed.error.flatten() });
      return;
    }

    await configRepo.saveConfig({ userId }, parsed.data as UserConfig);
    res.status(200).json({ ok: true });
  };
};

export const testImapConnectionRoute = (emailService: EmailService): RequestHandler => {
  return async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = imapTestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid IMAP test payload", detail: parsed.error.flatten() });
      return;
    }

    try {
      await emailService.testConnection(parsed.data.imap as UserConfig["imap"]);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ ok: false, error: (error as Error).message });
    }
  };
};

