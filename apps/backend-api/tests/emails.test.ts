import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { AppDeps } from "../src/app";
import { createApp } from "../src/app";
import type { Email, UserConfig } from "../src/shared-types";

const baseConfig: UserConfig = {
  imap: {
    host: "imap.example.com",
    port: 993,
    secure: true,
    username: "user@example.com",
    password: "secret",
    mailbox: "INBOX",
  },
  ai: {
    endpointUrl: "https://example.com/ai",
    presets: [],
    tagMapping: {},
  },
  updatedAt: new Date().toISOString(),
};

const email: Email = {
  id: "1",
  subject: "Hello",
  from: { address: "from@example.com" },
  to: [{ address: "to@example.com" }],
  date: "2025-01-02T00:00:00.000Z",
  textBody: "snippet",
  hasAttachment: false,
  createdAt: "2025-01-02T00:00:00.000Z",
  updatedAt: "2025-01-02T00:00:00.000Z",
};

describe("GET /emails", () => {
  it("returns parsed raw list and persists pagination metadata", async () => {
    const saveEmails = vi.fn();
    const saveLastFetchMeta = vi.fn();

    const deps: AppDeps = {
      verifyIdToken: vi.fn(async () => ({ uid: "u-1" })),
      configRepo: {
        getConfig: vi.fn(async () => baseConfig),
        saveConfig: vi.fn(),
      },
      emailRepo: {
        saveEmails,
        getRecentEmails: vi.fn(),
        saveLastFetchMeta,
      },
      emailService: {
        fetchEmails: vi.fn(async () => [email]),
      },
      parserService: {
        attachMetadata: vi.fn((emails) => emails),
      },
    };

    const app = createApp(deps);
    const response = await request(app)
      .get("/emails?limit=10")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body.rawEmails).toHaveLength(1);
    expect(response.body.rawEmails[0].id).toBe("1");
    expect(response.body.pagination.limit).toBe(10);
    expect(saveEmails).toHaveBeenCalledOnce();
    expect(saveLastFetchMeta).toHaveBeenCalledOnce();
    expect(saveLastFetchMeta.mock.calls[0][1]).toMatchObject({
      count: 1,
      pagination: {
        limit: 10,
        hasMore: false,
      },
    });
  });
});

