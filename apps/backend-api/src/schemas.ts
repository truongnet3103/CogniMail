import { z } from "zod";

export const emailFilterSchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  status: z.enum(["all", "read", "unread"]).optional(),
  sender: z.string().optional(),
  tags: z.array(z.string()).optional(),
  mailbox: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined)),
  cursor: z.string().optional(),
});

export const configSchema = z.object({
  imap: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1),
    secure: z.boolean(),
    username: z.string().min(1),
    password: z.string().optional(),
    mailbox: z.string().optional(),
  }),
  ai: z.object({
    provider: z.enum(["openai", "anthropic", "google", "groq", "openrouter", "custom"]).optional(),
    model: z.string().optional(),
    endpointUrl: z.union([z.string().url(), z.literal(""), z.undefined()]).optional(),
    apiKey: z.string().optional(),
    method: z.enum(["POST", "PUT"]).optional(),
    authHeaderName: z.string().optional(),
    staticHeaders: z.array(z.object({ key: z.string(), value: z.string() })).optional().default([]),
    presets: z.array(z.object({ id: z.string(), label: z.string(), prompt: z.string() })).default([]),
    promptGroups: z.record(z.array(z.object({ id: z.string(), label: z.string(), prompt: z.string() }))).optional().default({}),
    recommendedPrompt: z.string().optional(),
    soulPrompt: z.string().optional(),
    customPrompt: z.string().optional(),
    tagMapping: z.record(z.array(z.string())).default({}),
    saveTasksToFirestore: z.boolean().optional(),
    senderDirectory: z.array(z.string()).optional().default([]),
    openaiOAuth: z
      .object({
        enabled: z.boolean(),
        accessToken: z.string().optional(),
        refreshToken: z.string().optional(),
        expiresAt: z.string().optional(),
        accountEmail: z.string().optional(),
        updatedAt: z.string(),
      })
      .optional(),
  }),
  defaultFilters: z
    .object({
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      status: z.enum(["all", "read", "unread"]).optional(),
      sender: z.string().optional(),
      tags: z.array(z.string()).optional(),
      mailbox: z.string().optional(),
      limit: z.number().optional(),
      cursor: z.string().optional(),
    })
    .optional(),
  updatedAt: z.string(),
});

export const imapTestSchema = z.object({
  imap: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1),
    secure: z.boolean(),
    username: z.string().min(1),
    password: z.string().min(1),
    mailbox: z.string().optional(),
  }),
});



