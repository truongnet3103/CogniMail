"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import type { BillingProfile, DisplayEmailFilter, Email, EmailFilter, LocalAgentHealth, Task, UserConfig } from "@/lib/types";
import { firebaseAuth } from "@/lib/firebase";
import {
  fetchEmailsFromBackend,
  testImapConfigFromBackend,
} from "@/lib/api";
import {
  consumeBillingCreditByUsage,
  deleteEmails,
  deleteTask,
  loadConfig,
  loadBillingProfile,
  loadRecentEmails,
  saveConfig,
  loadTasks,
  saveAiSummaryEmail,
  saveTasks,
  setBillingPlan,
  topupBillingCreditManual,
  updateEmailTextBody,
  updateTaskStatus,
} from "@/lib/firestore";
import { AppLayout } from "@/components/AppLayout";
import { EmailPage } from "@/components/EmailPage";
import { SettingsPage } from "@/components/SettingsPage";
import { CalendarView } from "@/components/CalendarView";
import { DonatePage } from "@/components/DonatePage";
import { SidebarFetchPanel } from "@/components/SidebarFetchPanel";
import { Logo } from "@/components/Logo";
import { normalizeSubject } from "@/lib/email-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const recommendedPromptText = `
1) Trả lời bằng tiếng Việt.
2) Trích xuất task dạng JSON + evidence, task có deadline thì thêm tag "deadline".
3) Mỗi task phải trả đúng sourceEmailId để frontend gắn task vào đúng email.
4) Đọc toàn bộ nội dung tôi gửi, không được lười.
`.trim();
const soulPromptText =
  "Bạn là trợ lý điều phối công việc email cho tôi. Mục tiêu: tự đọc ngữ cảnh, tự quyết định việc nào thực sự cần làm, xuất task rõ ràng để tôi hành động ngay. Ưu tiên việc có deadline, việc ảnh hưởng giao hàng/chất lượng/khách hàng.";

const recommendedPreset = {
  id: "daily-assistant-recommended",
  label: "Trợ lý công việc hôm nay (Khuyến nghị)",
  recommended: true,
  note: "Ưu tiên dùng để không bỏ sót việc quan trọng.",
  prompt: recommendedPromptText,
};

const openaiOAuthDefaults = {
  clientId: process.env.NEXT_PUBLIC_OPENAI_OAUTH_CLIENT_ID ?? "app_EMoamEEZ73f0CkXaXp7hrann",
  authorizeUrl: "https://auth.openai.com/oauth/authorize",
  tokenUrl: "https://auth.openai.com/oauth/token",
  scope: "openid profile email offline_access",
};

const introFeatures = [
  {
    title: "Xử lý AI theo yêu cầu",
    description: "Bạn chủ động chạy AI khi cần, không quét nền và không phản hồi tự động.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
        <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
      </svg>
    ),
  },
  {
    title: "Đồng bộ IMAP an toàn",
    description: "Kết nối email công việc qua IMAP và lưu dữ liệu trong Firebase riêng.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
        <path d="M12 2 4 5v6c0 5 3.4 9.4 8 10.8 4.6-1.4 8-5.8 8-10.8V5l-8-3Zm0 2.1 6 2.2V11c0 4.1-2.6 7.8-6 9-3.4-1.2-6-4.9-6-9V6.3l6-2.2Z" />
      </svg>
    ),
  },
  {
    title: "Tách task & deadline",
    description: "Biến hội thoại email thành công việc và deadline có thể theo dõi ngay.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
        <path d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2Zm11 8H6v10h12V10Zm-1-4H7v2h10V6Z" />
      </svg>
    ),
  },
];

const getLocalDayBounds = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
  return { start, end };
};

const emptyConfig: UserConfig = {
  imap: {
    host: process.env.NEXT_PUBLIC_IMAP_DEFAULT_HOST ?? "",
    port: Number.parseInt(process.env.NEXT_PUBLIC_IMAP_DEFAULT_PORT ?? "993", 10),
    secure: true,
    username: "",
    password: "",
    mailbox: "INBOX",
  },
  ai: {
    provider: "openai",
    model: "gpt-5.4-mini",
    endpointUrl: "",
    apiKey: "",
    presets: [recommendedPreset],
    promptGroups: { "Khuyen nghi": [recommendedPreset] },
    recommendedPrompt: recommendedPromptText,
    soulPrompt: soulPromptText,
    customPrompt: "",
    tagMapping: {},
    senderDirectory: [],
    saveTasksToFirestore: true,
    openaiOAuth: {
      enabled: false,
      clientId: openaiOAuthDefaults.clientId,
      authorizeUrl: openaiOAuthDefaults.authorizeUrl,
      tokenUrl: openaiOAuthDefaults.tokenUrl,
      scope: openaiOAuthDefaults.scope,
      updatedAt: new Date().toISOString(),
    },
  },
  defaultFilters: {
    limit: 20,
    status: "all",
  },
  updatedAt: new Date().toISOString(),
};

const getToken = async () => {
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new Error("Chưa đăng nhập");
  }
  return user.getIdToken();
};

const normalizeTaskText = (value?: string) =>
  (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const titleFingerprint = (title?: string) =>
  normalizeTaskText(title)
    .split(" ")
    .filter((token) => token.length >= 3)
    .slice(0, 8)
    .join(" ");

const tokenSimilarity = (a?: string, b?: string) => {
  const ta = new Set(titleFingerprint(a).split(" ").filter(Boolean));
  const tb = new Set(titleFingerprint(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const token of ta) {
    if (tb.has(token)) overlap += 1;
  }
  return overlap / Math.max(ta.size, tb.size);
};

const sameTaskIntent = (a: Task, b: Task) => {
  const aScope = a.emailId ?? a.sourceGroupKey ?? "";
  const bScope = b.emailId ?? b.sourceGroupKey ?? "";
  if (!aScope || !bScope || aScope !== bScope) return false;
  if ((a.actionType ?? "other") !== (b.actionType ?? "other")) return false;
  if ((a.dueDate ?? "") && (b.dueDate ?? "") && a.dueDate !== b.dueDate) return false;
  if ((a.evidence ?? "").trim() && (b.evidence ?? "").trim() && normalizeTaskText(a.evidence) === normalizeTaskText(b.evidence)) {
    return true;
  }
  const similarity = tokenSimilarity(a.title, b.title);
  if (a.dueDate || b.dueDate) return similarity >= 0.55;
  return similarity >= 0.7;
};

const coalesceTask = (left: Task, right: Task): Task => {
  const combinedTags = [...new Set([...(left.tags ?? []), ...(right.tags ?? [])])];
  const keepDue = left.dueDate ? left : right.dueDate ? right : left;
  const newestCreated =
    new Date(left.createdAt).getTime() >= new Date(right.createdAt).getTime() ? left.createdAt : right.createdAt;
  return {
    ...left,
    ...right,
    id: left.id,
    title: left.title.length >= right.title.length ? left.title : right.title,
    description: right.description ?? left.description,
    dueDate: keepDue.dueDate,
    dueTime: keepDue.dueTime ?? right.dueTime ?? left.dueTime,
    dueExplicit: keepDue.dueExplicit ?? right.dueExplicit ?? left.dueExplicit,
    dueEvidence: keepDue.dueEvidence ?? right.dueEvidence ?? left.dueEvidence,
    tags: combinedTags,
    evidence: left.evidence ?? right.evidence,
    completed: left.completed ?? right.completed ?? false,
    completedAt: left.completedAt ?? right.completedAt,
    createdAt: newestCreated,
    mergedCount: (left.mergedCount ?? 1) + (right.mergedCount ?? 1),
  };
};

const sortTasks = (tasks: Task[], emails: Email[]) => {
  const emailDateById = new Map(emails.map((email) => [email.id, new Date(email.date).getTime()]));
  const priorityRank = (task: Task) => {
    if (task.priority === "high") return 0;
    if (task.priority === "medium") return 1;
    if (task.priority === "low") return 2;
    return 3;
  };
  const taskTime = (task: Task) => {
    const fromEmail = task.emailId ? emailDateById.get(task.emailId) : undefined;
    if (typeof fromEmail === "number" && Number.isFinite(fromEmail)) return fromEmail;
    const created = new Date(task.createdAt).getTime();
    if (Number.isFinite(created)) return created;
    if (task.dueDate) {
      const due = new Date(task.dueDate).getTime();
      if (Number.isFinite(due)) return due;
    }
    return 0;
  };
  return [...tasks].sort((a, b) => {
    const p = priorityRank(a) - priorityRank(b);
    if (p !== 0) return p;
    const t = taskTime(a) - taskTime(b);
    if (t !== 0) return t;
    return a.title.localeCompare(b.title, "vi");
  });
};

const mergeIncomingTasks = (current: Task[], incoming: Task[], emails: Email[]) => {
  const byId = new Map<string, Task>();
  for (const task of current) byId.set(task.id, task);
  for (const task of incoming) {
    const existing = byId.get(task.id);
    if (existing) {
      byId.set(
        task.id,
        coalesceTask(existing, {
          ...task,
          completed: existing.completed ?? task.completed ?? false,
          completedAt: existing.completedAt ?? task.completedAt,
        }),
      );
      continue;
    }
    byId.set(task.id, task);
  }

  const deduped: Task[] = [];
  for (const task of byId.values()) {
    const matchIndex = deduped.findIndex((item) => sameTaskIntent(item, task));
    if (matchIndex >= 0) {
      deduped[matchIndex] = coalesceTask(deduped[matchIndex], task);
    } else {
      deduped.push(task);
    }
  }

  return sortTasks(deduped, emails);
};

const normalizeConfigWithRecommended = (config: UserConfig | null): UserConfig => {
  const input = config ?? emptyConfig;

  return {
    ...input,
    ai: {
      ...input.ai,
      presets: [recommendedPreset],
      promptGroups: { "Khuyen nghi": [recommendedPreset] },
      recommendedPrompt: recommendedPromptText,
      soulPrompt: input.ai.soulPrompt ?? soulPromptText,
      senderDirectory: input.ai.senderDirectory ?? [],
      openaiOAuth: input.ai.openaiOAuth ?? {
        ...{
          enabled: false,
          clientId: openaiOAuthDefaults.clientId,
          authorizeUrl: openaiOAuthDefaults.authorizeUrl,
          tokenUrl: openaiOAuthDefaults.tokenUrl,
          scope: openaiOAuthDefaults.scope,
          updatedAt: new Date().toISOString(),
        },
        ...(input.ai.openaiOAuth ?? {}),
      },
    },
  };
};

export default function HomePage() {
  const [authLoading, setAuthLoading] = useState(true);
  const [showIntro, setShowIntro] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeView, setActiveView] = useState<"emails" | "settings" | "calendar" | "donate">("emails");
  const [emails, setEmails] = useState<Email[]>([]);
  const [config, setConfig] = useState<UserConfig>(emptyConfig);
  const [billingProfile, setBillingProfile] = useState<BillingProfile>({
    plan: "free",
    status: "active",
    creditBalance: 0,
    currency: "USD",
    updatedAt: new Date().toISOString(),
  });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [focusEmailId, setFocusEmailId] = useState<string | undefined>(undefined);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(false);
  const [localAgentStatus, setLocalAgentStatus] = useState<string>("");
  const [localAgentHealth, setLocalAgentHealth] = useState<LocalAgentHealth | null>(null);
  const [localAgentBusy, setLocalAgentBusy] = useState(false);
  const lastAgentRunRef = useRef<string | null>(null);
  const [fetchFilter, setFetchFilter] = useState<EmailFilter>({
    limit: emptyConfig.defaultFilters?.limit ?? 20,
    status: emptyConfig.defaultFilters?.status ?? "all",
    dateFrom: getLocalDayBounds().start,
    dateTo: getLocalDayBounds().end,
  });
  const [displayFilter, setDisplayFilter] = useState<DisplayEmailFilter>({
    dateFrom: getLocalDayBounds().start,
    dateTo: getLocalDayBounds().end,
    senders: [],
    groups: [],
    directOnly: false,
  });
  const senderSuggestions = useMemo(() => {
    const fromEmails = emails.map((item) => item.from.address).filter(Boolean);
    const fromConfig = config.ai.senderDirectory ?? [];
    return [...new Set([...fromConfig, ...fromEmails].map((item) => item.trim().toLowerCase()).filter(Boolean))].sort();
  }, [emails, config.ai.senderDirectory]);
  const senderGroups = useMemo(
    () => Object.keys(config.ai.tagMapping ?? {}).sort(),
    [config.ai.tagMapping],
  );
  const directEmailIds = useMemo(() => {
    const userEmail = user?.email?.trim().toLowerCase();
    if (!userEmail) return [];
    return emails
      .filter((emailItem) => emailItem.to.some((toItem) => toItem.address.trim().toLowerCase() === userEmail))
      .map((emailItem) => emailItem.id);
  }, [emails, user?.email]);

  const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const localAgentBases = ["http://127.0.0.1:41731"] as const;

  const callLocalAgent = async (path: string, init?: RequestInit, timeoutMs = 20000) => {
    let lastErr: Error | null = null;
    for (const base of localAgentBases) {
      try {
        const controller = new AbortController();
        const timeout = timeoutMs > 0 ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
        const response = await fetch(`${base}${path}`, { ...(init ?? {}), signal: controller.signal });
        if (timeout) window.clearTimeout(timeout);
        const rawText = await response.text();
        let json: unknown = null;
        if (rawText) {
          try {
            json = JSON.parse(rawText);
          } catch {
            json = null;
          }
        }
        return { response, json, text: rawText, base };
      } catch (error) {
        const err = error as Error;
        if (err.name === "AbortError") {
          lastErr = new Error(`Timeout khi gọi ${base}${path}`);
        } else {
          lastErr = err;
        }
      }
    }
    throw lastErr ?? new Error("Không thể gọi local agent");
  };

  const getAgentStatus = async (timeoutMs = 25000) => {
    const status = await callLocalAgent("/status", { method: "GET" }, timeoutMs);
    if (status.response.ok) {
      return status;
    }
    const legacy = await callLocalAgent("/health", { method: "GET" }, timeoutMs);
    return legacy;
  };

  const waitForAgentCycle = async (beforeRunAt: string | null | undefined, timeoutMs = 840000) => {
    const startedAt = Date.now();
    let lastMessage = "Worker đang xử lý, vui lòng chờ...";
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const { response, json, text } = await getAgentStatus(10000);
        if (response.ok) {
          if (!json) {
            throw new Error(text || "Agent trả về dữ liệu không hợp lệ");
          }
          const health = json as LocalAgentHealth;
          setLocalAgentHealth(health);
          setLocalAgentStatus(getHealthStatusText(health));
          if (health.lastError) {
            throw new Error(health.lastError);
          }
          if (health.lastRunAt && health.lastRunAt !== beforeRunAt) {
            return health;
          }
          if (health.syncing || health.stage === "fetching-imap" || health.stage === "saving-firestore") {
            lastMessage = "Worker đang lấy email...";
          } else {
            lastMessage = "Worker đã nhận lệnh, đang chờ chu kỳ xử lý...";
          }
        } else {
          throw new Error(text || `HTTP ${response.status}`);
        }
      } catch (error) {
        lastMessage = `Đang chờ worker phản hồi... (${(error as Error).message})`;
      }
      setLocalAgentStatus(lastMessage);
      await delay(2500);
    }
    throw new Error("Worker xử lý quá lâu (14 phút), vui lòng mở mục 'Xem log' trên tray để kiểm tra.");
  };

  const getHealthStatusText = (json: LocalAgentHealth) => {
    if (json.stage === "dns-retry" && json.lastError) {
      return `Agent đang tự thử lại DNS IMAP: ${json.lastError}`;
    }
    if (json.lastError) {
      return `Agent có lỗi: ${json.lastError}`;
    }
    if (json.lastRunAt) {
      const fetched = json.lastResult?.fetched ?? 0;
      const saved = json.lastResult?.saved ?? 0;
      return `Agent OK. Lần gần nhất: ${new Date(json.lastRunAt).toLocaleString()} | fetched=${fetched}, saved=${saved}${json.syncing ? " | đang chạy..." : ""}`;
    }
    if (!json.configured) {
      return "Agent đã chạy nhưng chưa cấu hình tài khoản. Hãy bấm Lấy Email.";
    }
    if (json.authenticated) {
      return `Agent đã kết nối${json.syncing ? " và đang chạy..." : ", sẵn sàng đồng bộ"}.`;
    }
    return "Agent đang chạy nhưng chưa xác thực.";
  };

  const fetchLocalAgentHealth = async (showBusy = false) => {
    if (showBusy) setLocalAgentBusy(true);
    const maxAttempts = showBusy ? 4 : 2;
    let lastAgentError: Error | null = null;
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          let pingError: Error | null = null;
          let pingOk = false;
          try {
          const ping = await callLocalAgent("/ping", { method: "GET" }, 15000);
            pingOk = ping.response.ok;
            if (!pingOk && ping.text) {
              pingError = new Error(ping.text);
            }
          } catch (error) {
            pingError = error as Error;
          }

          const { response, json, text } = await getAgentStatus(25000);
          if (!response.ok) {
            if (pingError) {
              throw pingError;
            }
            throw new Error(text || `Agent lỗi HTTP ${response.status}`);
          }
          if (!json) {
            throw new Error(text || "Agent trả về dữ liệu không hợp lệ");
          }
          const health = json as LocalAgentHealth;
          setLocalAgentHealth(health);
          setLocalAgentStatus(getHealthStatusText(health));

          if (health.lastRunAt && health.lastRunAt !== lastAgentRunRef.current && user) {
            lastAgentRunRef.current = health.lastRunAt;
            const refreshed = await loadRecentEmails(user.uid, 50);
            setEmails(refreshed);
          }
          return;
        } catch (agentError) {
          lastAgentError = agentError as Error;
          if (attempt < maxAttempts) {
            await delay(700 * attempt);
            continue;
          }
          throw agentError;
        }
      }
    } catch (agentError) {
      setLocalAgentHealth(null);
      const lastKnownStage = localAgentHealth?.stage ?? "";
      const isBusyStage =
        lastKnownStage === "loading-config" ||
        lastKnownStage === "fetching-imap" ||
        lastKnownStage === "saving-firestore" ||
        localAgentHealth?.syncing === true;

      if (isBusyStage) {
        setLocalAgentStatus("Worker đang bận xử lý, trạng thái sẽ cập nhật lại sau.");
      } else {
        setLocalAgentStatus(
          `Không kết nối được agent local. Nếu vừa bật worker, chờ vài giây rồi bấm kiểm tra lại (${(lastAgentError ?? (agentError as Error)).message})`,
        );
      }
    } finally {
      if (showBusy) setLocalAgentBusy(false);
    }
  };

  const checkLocalAgent = async () => {
    await fetchLocalAgentHealth(true);
  };

  const connectOpenAIOAuth = async () => {
    setLocalAgentBusy(true);
    try {
      const savedRedirectUri = config.ai.openaiOAuth?.redirectUri?.trim();
      const isLocalCallbackRedirect =
        !!savedRedirectUri &&
        /:\/\/(?:localhost|127\.0\.0\.1):\d+(?:\/auth\/callback)?(?:$|[?#])/i.test(savedRedirectUri);

      const oauthConfig: NonNullable<UserConfig["ai"]["openaiOAuth"]> = {
        enabled: config.ai.openaiOAuth?.enabled ?? false,
        clientId: config.ai.openaiOAuth?.clientId,
        authorizeUrl: config.ai.openaiOAuth?.authorizeUrl,
        tokenUrl: config.ai.openaiOAuth?.tokenUrl,
        redirectUri: isLocalCallbackRedirect ? undefined : savedRedirectUri,
        scope: config.ai.openaiOAuth?.scope,
        accessToken: config.ai.openaiOAuth?.accessToken,
        refreshToken: config.ai.openaiOAuth?.refreshToken,
        expiresAt: config.ai.openaiOAuth?.expiresAt,
        accountEmail: config.ai.openaiOAuth?.accountEmail,
        updatedAt: config.ai.openaiOAuth?.updatedAt ?? new Date().toISOString(),
      };
      const started = await callLocalAgent(
        "/oauth/openai/start",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: oauthConfig.clientId || openaiOAuthDefaults.clientId,
            authorizeUrl: oauthConfig.authorizeUrl || openaiOAuthDefaults.authorizeUrl,
            tokenUrl: oauthConfig.tokenUrl || openaiOAuthDefaults.tokenUrl,
            scope: oauthConfig.scope || openaiOAuthDefaults.scope,
            ...(oauthConfig.redirectUri?.trim() ? { redirectUri: oauthConfig.redirectUri.trim() } : {}),
          }),
        },
        20000,
      );
      if (!started.response.ok || !started.json) {
        throw new Error(started.text || `Worker lỗi HTTP ${started.response.status}`);
      }
      const startPayload = started.json as {
        ok?: boolean;
        requestId?: string;
        authUrl?: string;
        redirectUri?: string;
        message?: string;
      };
      if (!startPayload.ok || !startPayload.requestId || !startPayload.authUrl) {
        throw new Error(startPayload.message || "Không khởi tạo được phiên OAuth.");
      }

      setLocalAgentStatus("Đang mở trang đăng nhập ChatGPT...");
      const popup = window.open(startPayload.authUrl, "cognimail-openai-oauth-local", "width=560,height=760");
      if (!popup) {
        throw new Error("Trình duyệt chặn popup. Hãy cho phép popup rồi thử lại.");
      }

      const requestId = startPayload.requestId;
      const startedAt = Date.now();
      while (Date.now() - startedAt < 240000) {
        await delay(1200);
        const result = await callLocalAgent(
          `/oauth/openai/result?requestId=${encodeURIComponent(requestId)}`,
          { method: "GET" },
          15000,
        );
        if (!result.response.ok || !result.json) {
          throw new Error(result.text || `Worker lỗi HTTP ${result.response.status}`);
        }
        const statusPayload = result.json as {
          ok?: boolean;
          status?: "pending" | "authorized" | "exchanged" | "error";
          error?: string;
          errorDescription?: string;
        };
        if (!statusPayload.ok) {
          throw new Error(statusPayload.errorDescription || statusPayload.error || "OAuth local thất bại.");
        }
        if (statusPayload.status === "error") {
          throw new Error(statusPayload.errorDescription || statusPayload.error || "OAuth local thất bại.");
        }
        if (statusPayload.status === "authorized" || statusPayload.status === "exchanged") {
          break;
        }
        if (popup.closed) {
          throw new Error("Bạn đã đóng cửa sổ đăng nhập trước khi hoàn tất.");
        }
      }

      const exchanged = await callLocalAgent(
        "/oauth/openai/exchange",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId }),
        },
        25000,
      );
      if (!exchanged.response.ok || !exchanged.json) {
        throw new Error(exchanged.text || `Worker lỗi HTTP ${exchanged.response.status}`);
      }
      const tokenPayload = exchanged.json as {
        ok?: boolean;
        accessToken?: string;
        refreshToken?: string;
        expiresAt?: string;
        accountEmail?: string;
        message?: string;
      };
      if (!tokenPayload.ok || !tokenPayload.accessToken) {
        throw new Error(tokenPayload.message || "Không đổi được token OAuth.");
      }
      setLocalAgentStatus("OAuth ChatGPT qua worker thành công.");
      return {
        accessToken: tokenPayload.accessToken,
        refreshToken: tokenPayload.refreshToken,
        expiresAt: tokenPayload.expiresAt,
        accountEmail: tokenPayload.accountEmail,
        redirectUri: startPayload.redirectUri,
      };
    } finally {
      setLocalAgentBusy(false);
    }
  };

  const configureLocalAgent = async (input: { email: string; password: string; intervalMinutes: number; limit: number }) => {
    setLocalAgentBusy(true);
    try {
      const { response, json, text } = await callLocalAgent("/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          fetchNow: false,
        }),
      }, 15000);
      if (!json) {
        throw new Error(text || `Agent lỗi HTTP ${response.status}`);
      }
      const payload = json as {
        ok?: boolean;
        message?: string;
        stage?: string;
        previousRunAt?: string | null;
        lastRunAt?: string | null;
        lastResult?: { fetched?: number; saved?: number } | null;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message ?? text ?? `Agent lỗi HTTP ${response.status}`);
      }
      setLocalAgentStatus("Đã lưu cấu hình. Đang gửi lệnh lấy email...");
      const fetchKick = await callLocalAgent(
        "/fetch",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queueIfBusy: true }) },
        15000,
      );
      if (!fetchKick.response.ok) {
        throw new Error(fetchKick.text || `Agent lỗi HTTP ${fetchKick.response.status}`);
      }
      const fetchPayload = fetchKick.json as { ok?: boolean; queued?: boolean; message?: string } | null;
      if (fetchPayload?.queued) {
        setLocalAgentStatus("Worker đang bận, đã xếp hàng lần fetch tiếp theo theo cấu hình mới.");
      } else {
        setLocalAgentStatus("Worker đã nhận lệnh. Đang lấy email...");
      }
      const done = await waitForAgentCycle(payload.previousRunAt ?? lastAgentRunRef.current, 840000);
      const fetched = done.lastResult?.fetched ?? 0;
      const saved = done.lastResult?.saved ?? 0;
      setLocalAgentStatus(`Lấy email xong: fetched=${fetched}, saved=${saved}`);
      lastAgentRunRef.current = done.lastRunAt ?? null;
      if (user) {
        const refreshed = await loadRecentEmails(user.uid, 50);
        setEmails(refreshed);
      }
    } catch (agentError) {
      const message = (agentError as Error).message;
      if (message.toLowerCase().includes("timeout khi gọi") || message.toLowerCase().includes("aborted")) {
        try {
          setLocalAgentStatus("Lệnh đã gửi, worker có thể đang bận. Đang theo dõi tiến trình...");
          const done = await waitForAgentCycle(lastAgentRunRef.current, 840000);
          const fetched = done.lastResult?.fetched ?? 0;
          const saved = done.lastResult?.saved ?? 0;
          setLocalAgentStatus(`Lấy email xong: fetched=${fetched}, saved=${saved}`);
          lastAgentRunRef.current = done.lastRunAt ?? null;
          if (user) {
            const refreshed = await loadRecentEmails(user.uid, 50);
            setEmails(refreshed);
          }
          return;
        } catch (fallbackError) {
          setLocalAgentStatus(`Cấu hình agent thất bại: ${(fallbackError as Error).message}`);
          return;
        }
      }
      setLocalAgentStatus(`Cấu hình agent thất bại: ${message}`);
    } finally {
      setLocalAgentBusy(false);
    }
  };

  const cancelLocalAgentFetch = async () => {
    setLocalAgentBusy(true);
    try {
      const { response, text } = await callLocalAgent("/cancel", { method: "POST" }, 15000);
      if (!response.ok) {
        throw new Error(text || `Agent lỗi HTTP ${response.status}`);
      }
      setLocalAgentStatus("Đã gửi lệnh dừng phiên fetch hiện tại.");
      await fetchLocalAgentHealth(false);
    } catch (error) {
      setLocalAgentStatus(`Dừng phiên fetch thất bại: ${(error as Error).message}`);
    } finally {
      setLocalAgentBusy(false);
    }
  };

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setEmails([]);
        setTasks([]);
        setAuthLoading(false);
        return;
      }

      const [storedEmails, storedConfig, storedTasks, storedBilling] = await Promise.all([
        loadRecentEmails(nextUser.uid, 50),
        loadConfig(nextUser.uid),
        loadTasks(nextUser.uid),
        loadBillingProfile(nextUser.uid),
      ]);

      const normalizedConfig = normalizeConfigWithRecommended(storedConfig);
      setEmails(storedEmails);
      setConfig(normalizedConfig);
      setTasks(mergeIncomingTasks([], storedTasks, storedEmails));
      setBillingProfile(storedBilling);
      setFetchFilter({
        limit: normalizedConfig.defaultFilters?.limit ?? 20,
        status: normalizedConfig.defaultFilters?.status ?? "all",
        dateFrom: normalizedConfig.defaultFilters?.dateFrom ?? getLocalDayBounds().start,
        dateTo: normalizedConfig.defaultFilters?.dateTo ?? getLocalDayBounds().end,
        sender: normalizedConfig.defaultFilters?.sender,
        tags: normalizedConfig.defaultFilters?.tags,
      });
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setLocalAgentHealth(null);
      setLocalAgentStatus("");
      return;
    }
    setLocalAgentStatus("Chưa kiểm tra agent. Bấm 'Kiểm tra Agent' để xác nhận kết nối.");
  }, [user]);

  if (authLoading) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 p-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.18),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_50%_80%,rgba(148,163,184,0.24),transparent_45%)]" />
        <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-2xl backdrop-blur">
          <Logo size="lg" />
          <div className="mt-6 space-y-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-indigo-500 to-sky-500" />
            </div>
            <p className="text-sm text-slate-600">Đang khởi tạo không gian làm việc CogniMail...</p>
            <p className="text-xs text-slate-500">Đồng bộ phiên đăng nhập, cấu hình IMAP và dữ liệu email gần nhất.</p>
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    if (showIntro) {
      return (
        <main className="min-h-screen bg-slate-100">
          <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
              <Logo />
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setShowIntro(false)}>
                  Đăng nhập
                </Button>
                <Button
                  onClick={() => {
                    setShowIntro(false);
                  }}
                >
                  Get Started
                </Button>
              </div>
            </div>
          </header>

          <section className="border-b border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] px-6 py-20">
            <div className="mx-auto w-full max-w-4xl text-center">
              <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-slate-950 md:text-7xl">
                Your Email, <span className="bg-gradient-to-r from-indigo-500 to-sky-500 bg-clip-text text-transparent">Cognitively</span>{" "}
                Optimized.
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
                Kết nối email qua IMAP, tóm tắt hội thoại bằng AI theo yêu cầu và theo dõi task/deadline trên một luồng làm việc duy nhất.
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Button
                  className="h-12 px-8 text-base"
                  onClick={() => {
                    setShowIntro(false);
                  }}
                >
                  Tạo Workspace
                </Button>
                <Button variant="secondary" className="h-12 px-8 text-base" onClick={() => setShowIntro(false)}>
                  Cách hoạt động
                </Button>
              </div>
            </div>
          </section>

          <section className="px-6 py-14">
            <div className="mx-auto grid w-full max-w-6xl gap-6 md:grid-cols-3">
              {introFeatures.map((feature) => (
                <article key={feature.title} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
                  <div className="mb-5 inline-flex rounded-2xl bg-indigo-100 p-3 text-indigo-600">{feature.icon}</div>
                  <h3 className="text-2xl font-bold text-slate-900">{feature.title}</h3>
                  <p className="mt-3 text-slate-600">{feature.description}</p>
                </article>
              ))}
            </div>
          </section>
        </main>
      );
    }

    return (
      <main className="mx-auto mt-12 max-w-md p-4">
        <Card>
          <CardHeader>
            <Logo />
            <CardTitle className="text-2xl">Đăng nhập hệ thống</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mật khẩu" />
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={async () => {
                  setError("");
                  try {
                    await signInWithEmailAndPassword(firebaseAuth, email, password);
                  } catch (authError) {
                    setError((authError as Error).message);
                  }
                }}
              >
                Đăng nhập
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  setError("");
                  try {
                    await createUserWithEmailAndPassword(firebaseAuth, email, password);
                  } catch (authError) {
                    setError((authError as Error).message);
                  }
                }}
              >
                Đăng ký
              </Button>
            </div>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setShowIntro(true);
              }}
            >
              Xem trang giới thiệu
            </Button>
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <AppLayout
      activeView={activeView}
      setActiveView={setActiveView}
      onLogout={async () => {
        await signOut(firebaseAuth);
      }}
      sidebarExtra={
        activeView === "emails" ? (
          <SidebarFetchPanel
            fetchFilter={fetchFilter}
            displayFilter={displayFilter}
            onFetchFilterChange={setFetchFilter}
            onDisplayFilterChange={setDisplayFilter}
            fetching={fetching}
            senderSuggestions={senderSuggestions}
            senderGroups={senderGroups}
            onFetch={async () => {
              setFetching(true);
              setError("");
              try {
                const params = new URLSearchParams();
                params.set("limit", String(fetchFilter.limit ?? 20));
                if (fetchFilter.dateFrom) params.set("dateFrom", fetchFilter.dateFrom);
                if (fetchFilter.dateTo) params.set("dateTo", fetchFilter.dateTo);
                if (fetchFilter.status) params.set("status", fetchFilter.status);
                if (fetchFilter.sender) params.set("sender", fetchFilter.sender);
                if (fetchFilter.tags?.length) params.set("tags", fetchFilter.tags.join(","));

                const response = await fetchEmailsFromBackend(getToken, params);
                setEmails(response.rawEmails);
              } catch (fetchError) {
                setError((fetchError as Error).message);
              } finally {
                setFetching(false);
              }
            }}
          />
        ) : null
      }
    >
      {activeView === "emails" ? (
        <EmailPage
          emails={emails}
          displayFilter={displayFilter}
          config={config}
          billingProfile={billingProfile}
          currentUserEmail={user.email ?? undefined}
          output={output}
          error={error}
          focusEmailId={focusEmailId}
          onAiOutput={async (nextOutput, parsedTasks, sourceEmails, usage) => {
            if (billingProfile.plan !== "pro" && config.ai.provider === "openai" && config.ai.openaiOAuth?.enabled) {
              setError("Gói Free không được dùng OpenAI OAuth. Hãy chuyển Pro hoặc tắt OAuth.");
              return;
            }
            let usageLine = "";
            if (usage) {
              usageLine = `\n\n---\nToken usage: prompt=${usage.promptTokens}, completion=${usage.completionTokens}, total=${usage.totalTokens}${usage.estimated ? " (uoc luong)" : ""}`;
            }
            setOutput(`${nextOutput}${usageLine}`);
            const mergedTasks = mergeIncomingTasks(tasks, parsedTasks, emails);
            setTasks(mergedTasks);
            const aiEmail = await saveAiSummaryEmail(user.uid, sourceEmails, nextOutput);
            if (aiEmail) {
              setEmails((prev) => {
                const filtered = prev.filter((item) => item.id !== aiEmail.id);
                return [aiEmail, ...filtered].map((item) =>
                  sourceEmails.some((source) => source.id === item.id)
                    ? { ...item, hasAiResult: true, aiLinkedId: aiEmail.id, sourceGroupKey: aiEmail.sourceGroupKey }
                    : item,
                );
              });
            }
            if (config.ai.saveTasksToFirestore) {
              await saveTasks(user.uid, mergedTasks);
            }
            if (usage) {
              await consumeBillingCreditByUsage(user.uid, usage);
              const refreshedBilling = await loadBillingProfile(user.uid);
              setBillingProfile(refreshedBilling);
            }
          }}
          onAiError={setError}
          onDeleteEmails={async (ids) => {
            await deleteEmails(user.uid, ids);
            setEmails((prev) => prev.filter((item) => !ids.includes(item.id)));
          }}
          onSaveEmailBody={async (emailId, textBody) => {
            await updateEmailTextBody(user.uid, emailId, textBody);
            setEmails((prev) =>
              prev.map((item) =>
                item.id === emailId
                  ? { ...item, textBody, updatedAt: new Date().toISOString() }
                  : item,
              ),
            );
          }}
        />
      ) : null}

      {activeView === "settings" ? (
        <SettingsPage
          config={config}
          currentUserEmail={user.email ?? undefined}
          senderSuggestions={senderSuggestions}
          billingProfile={billingProfile}
          localAgentStatus={localAgentStatus}
          localAgentHealth={localAgentHealth}
          localAgentBusy={localAgentBusy}
          onCheckLocalAgent={checkLocalAgent}
          onCancelLocalAgent={cancelLocalAgentFetch}
          onConfigureLocalAgent={configureLocalAgent}
          onTestImap={async (imap) => testImapConfigFromBackend(getToken, imap)}
          onSave={async (nextConfig) => {
            const normalizedConfig = normalizeConfigWithRecommended(nextConfig);
            setConfig(normalizedConfig);
            await saveConfig(user.uid, normalizedConfig);
          }}
          onSetPlan={async (plan) => {
            await setBillingPlan(user.uid, plan);
            const refreshed = await loadBillingProfile(user.uid);
            setBillingProfile(refreshed);
            if (plan !== "pro") {
              const nextConfig: UserConfig = {
                ...config,
                ai: {
                  ...config.ai,
                  openaiOAuth: {
                    ...(config.ai.openaiOAuth ?? {
                      enabled: false,
                      clientId: openaiOAuthDefaults.clientId,
                      authorizeUrl: openaiOAuthDefaults.authorizeUrl,
                      tokenUrl: openaiOAuthDefaults.tokenUrl,
                      scope: openaiOAuthDefaults.scope,
                      updatedAt: new Date().toISOString(),
                    }),
                    enabled: false,
                    accessToken: undefined,
                    refreshToken: undefined,
                    expiresAt: undefined,
                    updatedAt: new Date().toISOString(),
                  },
                },
              };
              setConfig(nextConfig);
              await saveConfig(user.uid, nextConfig);
            }
          }}
          onManualTopup={async (amount, note) => {
            await topupBillingCreditManual(user.uid, amount, note);
            const refreshed = await loadBillingProfile(user.uid);
            setBillingProfile(refreshed);
          }}
          onConnectOpenAIOAuth={connectOpenAIOAuth}
        />
      ) : null}

      {activeView === "calendar" ? (
        <CalendarView
          tasks={tasks}
          currentUserEmail={user.email ?? undefined}
          directEmailIds={directEmailIds}
          onTaskClick={(task) => {
            const byId = task.emailId ? emails.find((item) => item.id === task.emailId) : undefined;
            const byGroup = task.sourceGroupKey
              ? emails
                  .filter((item) => normalizeSubject(item.subject).toLowerCase() === task.sourceGroupKey)
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
              : undefined;
            const target = byId ?? byGroup;

            if (!target) {
              return;
            }
            setActiveView("emails");
            setDisplayFilter({ senders: [], groups: [], directOnly: false });
            setFocusEmailId(target.id);
            setOutput(`Đã chuyển tới email liên quan: ${target.id}`);
          }}
          onToggleTaskCompleted={async (task, completed) => {
            setTasks((prev) =>
              sortTasks(
                prev.map((item) =>
                  item.id === task.id
                    ? { ...item, completed, completedAt: completed ? new Date().toISOString() : undefined }
                    : item,
                ),
                emails,
              ),
            );
            await updateTaskStatus(user.uid, task.id, completed);
          }}
          onDeleteTask={async (task) => {
            setTasks((prev) => prev.filter((item) => item.id !== task.id));
            await deleteTask(user.uid, task.id);
          }}
        />
      ) : null}

      {activeView === "donate" ? <DonatePage /> : null}
    </AppLayout>
  );
}
