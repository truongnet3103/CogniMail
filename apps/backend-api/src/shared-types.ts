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

export type LastFetchMeta = {
  fetchedAt: string;
  requestFilter: EmailFilter;
  pagination: PaginationInfo;
  count: number;
};



