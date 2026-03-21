import express from "express";
import cors from "cors";
import { getAuth } from "./firebase";
import { authMiddleware } from "./middleware/auth";
import { getConfigRoute, postConfigRoute, testImapConnectionRoute } from "./routes/config";
import { getEmailsRoute } from "./routes/emails";
import { firestoreConfigRepo } from "./repos/configRepo";
import { firestoreEmailRepo } from "./repos/emailRepo";
import { fetchImapEmails, testImapConnection } from "./services/imap";
import { attachEmailMetadata } from "./services/parser";
import type { ConfigRepo, EmailRepo, EmailService, ParserService, VerifyIdToken } from "./types";

export type AppDeps = {
  configRepo: ConfigRepo;
  emailRepo: EmailRepo;
  emailService: EmailService;
  parserService: ParserService;
  verifyIdToken: VerifyIdToken;
};

export const createDefaultDeps = (): AppDeps => ({
  configRepo: firestoreConfigRepo,
  emailRepo: firestoreEmailRepo,
  emailService: {
    fetchEmails: fetchImapEmails,
    testConnection: testImapConnection,
  },
  parserService: {
    attachMetadata: attachEmailMetadata,
  },
  verifyIdToken: async (token) => getAuth().verifyIdToken(token),
});

export const createApp = (deps: AppDeps) => {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(authMiddleware(deps.verifyIdToken));

  app.get("/config", getConfigRoute(deps.configRepo));
  app.post("/config", postConfigRoute(deps.configRepo));
  app.post("/config/test-imap", testImapConnectionRoute(deps.emailService));
  app.get("/emails", getEmailsRoute(deps.configRepo, deps.emailRepo, deps.emailService, deps.parserService));

  return app;
};
