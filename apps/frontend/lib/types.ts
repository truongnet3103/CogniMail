export type EmailAddress = {
  name?: string;
  address: string;
};

export type Email = {
  id: string;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  date: string;
  textBody?: string;
  hasAttachment: boolean;
  isAi?: boolean;
  sourceGroupKey?: string;
  hasAiResult?: boolean;
  aiLinkedId?: string;
  mailbox?: string;
  createdAt: string;
  updatedAt: string;
};

export type EmailFilter = {
  dateFrom?: string;
  dateTo?: string;
  status?: "all" | "read" | "unread";
  sender?: string;
  tags?: string[];
  mailbox?: string;
  limit?: number;
  cursor?: string;
};

export type DisplayEmailFilter = {
  dateFrom?: string;
  dateTo?: string;
  senders: string[];
  groups: string[];
  directOnly?: boolean;
};

export type PaginationInfo = {
  limit: number;
  nextCursor?: string;
  hasMore: boolean;
};

export type ImapConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password?: string;
  mailbox?: string;
};

export type AiHeader = {
  key: string;
  value: string;
};

export type AiPreset = {
  id: string;
  label: string;
  prompt: string;
  recommended?: boolean;
  note?: string;
};

export type AiConfig = {
  provider?: "openai" | "anthropic" | "google" | "groq" | "openrouter" | "custom";
  model?: string;
  endpointUrl: string;
  apiKey?: string;
  method?: "POST" | "PUT";
  authHeaderName?: string;
  staticHeaders?: AiHeader[];
  presets: AiPreset[];
  promptGroups?: Record<string, AiPreset[]>;
  recommendedPrompt?: string;
  soulPrompt?: string;
  customPrompt?: string;
  tagMapping: Record<string, string[]>;
  saveTasksToFirestore?: boolean;
  senderDirectory?: string[];
  openaiOAuth?: {
    enabled: boolean;
    clientId?: string;
    authorizeUrl?: string;
    tokenUrl?: string;
    redirectUri?: string;
    scope?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    accountEmail?: string;
    updatedAt: string;
  };
};

export type UserConfig = {
  imap: ImapConfig;
  ai: AiConfig;
  defaultFilters?: EmailFilter;
  updatedAt: string;
};

export type BillingProfile = {
  plan: "free" | "pro";
  status: "active" | "inactive";
  creditBalance: number;
  currency: string;
  updatedAt: string;
};

export type BillingLedgerItem = {
  id: string;
  type: "topup" | "usage" | "refund";
  amount: number;
  balanceAfter: number;
  note?: string;
  createdAt: string;
};

export type AiTokenUsage = {
  provider: string;
  model?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimated?: boolean;
};

export type AiPayload = {
  emails: Email[];
  selectedIds: string[];
  metadata: {
    tags: string[];
    dateRange: string;
  };
  prompt: string;
};

export type Task = {
  id: string;
  title: string;
  actionType?: string;
  description?: string;
  owner?: string;
  dueDate?: string;
  dueTime?: string;
  dueTimezone?: string;
  dueExplicit?: boolean;
  dueEvidence?: string;
  deadlineNote?: string;
  emailId?: string;
  tags?: string[];
  evidence?: string;
  assessment?: string;
  confidence?: number;
  priority?: "high" | "medium" | "low";
  importanceLevel?: "critical" | "high" | "medium" | "low";
  score?: number;
  completed?: boolean;
  completedAt?: string;
  sourceGroupKey?: string;
  mergedCount?: number;
  createdAt: string;
};

export type LocalAgentHealth = {
  ok: boolean;
  version?: string;
  configured: boolean;
  authenticated: boolean;
  syncing: boolean;
  intervalMinutes: number;
  fetchLimit: number;
  userEmail?: string | null;
  stage?: string | null;
  lastRunAt?: string | null;
  lastResult?: { fetched?: number; saved?: number } | null;
  lastError?: string | null;
};

export type EmailsResponse = {
  rawEmails: Email[];
  pagination: PaginationInfo;
};





