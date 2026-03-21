import dotenv from "dotenv";
import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import type { Server } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, writeBatch } from "firebase/firestore";
import type { Email, EmailFilter, LastFetchMeta, UserConfig } from "./shared-types";
import { fetchImapEmails } from "./services/imap";
import { attachEmailMetadata } from "./services/parser";

dotenv.config({ path: process.env.WORKER_ENV_PATH || ".env.worker.userdirect" });

const workerEnvPath = process.env.WORKER_ENV_PATH || ".env.worker.userdirect";
const workerRootDir = path.resolve(path.dirname(workerEnvPath));
const lockFilePath = path.join(workerRootDir || os.tmpdir(), ".worker-user-direct.lock");

const firebaseApiKey = process.env.FIREBASE_WEB_API_KEY ?? "AIzaSyCo1W3Fx8hvUqYB5joqjaAKUMnDAz0fqLM";
const firebaseAuthDomain = process.env.FIREBASE_AUTH_DOMAIN ?? "cognimail-fa0c0.firebaseapp.com";
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID ?? "cognimail-fa0c0";
const firebaseAppId = process.env.FIREBASE_APP_ID ?? "1:906136722896:web:3dc2809bf51d11ba302dd5";
const firebaseStorageBucket = process.env.FIREBASE_STORAGE_BUCKET ?? "cognimail-fa0c0.firebasestorage.app";
const firebaseMessagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID ?? "906136722896";
const agentPort = 41731;
const oauthCallbackPort = Number.parseInt(process.env.OAUTH_CALLBACK_PORT ?? "1455", 10);
const workerVersion = "5.10.0";
const openaiAuthorizeDefault = "https://auth.openai.com/oauth/authorize";
const openaiTokenDefault = "https://auth.openai.com/oauth/token";
const openaiCodexResponsesUrl =
  process.env.OPENAI_CODEX_RESPONSES_URL ?? "https://chatgpt.com/backend-api/codex/responses";
const openaiScopeDefault = "openid profile email offline_access";
const codexDefaultInstructions =
  "Bạn là trợ lý xử lý email công việc. Chỉ tạo deadline khi email nêu rõ ngày/giờ phải làm. Không biến mốc dự án chung thành deadline cá nhân.";
const openaiClientDefault = process.env.OPENAI_OAUTH_CLIENT_ID ?? "app_EMoamEEZ73f0CkXaXp7hrann";
const openaiRedirectDefault = `http://localhost:${oauthCallbackPort}/auth/callback`;

let userEmail = process.env.USER_EMAIL ?? "";
let userPassword = process.env.USER_PASSWORD ?? "";
let intervalMinutes = Math.max(1, Number.parseInt(process.env.WORKER_INTERVAL_MINUTES ?? "15", 10));
let fetchLimit = Math.min(100, Math.max(1, Number.parseInt(process.env.WORKER_LIMIT ?? "5", 10)));
let timer: NodeJS.Timeout | null = null;
let retryTimer: NodeJS.Timeout | null = null;
let lockAcquired = false;
let syncing = false;
let lastRunAt: string | null = null;
let lastResult: { fetched: number; saved: number } | null = null;
let lastError: string | null = null;
let currentStage = "idle";
let queuedFetch = false;
let cancelRequested = false;
let activeImapClient: { close?: () => void } | null = null;
let eventSeq = 0;
const recentEvents: { seq: number; line: string }[] = [];
const IMAP_FETCH_TIMEOUT_MS = Number(process.env.IMAP_FETCH_TIMEOUT_MS ?? 14 * 60 * 1000);

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timeout: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};
type OauthPending = {
  requestId: string;
  state: string;
  codeVerifier: string;
  clientId: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  redirectUri: string;
  status: "pending" | "authorized" | "exchanged" | "error";
  code?: string;
  error?: string;
  errorDescription?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  accountEmail?: string;
  createdAt: number;
  updatedAt: number;
};
const oauthByRequestId = new Map<string, OauthPending>();
const oauthByState = new Map<string, string>();
let openaiOauthSession:
  | {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: string;
      accountEmail?: string;
      updatedAt: string;
    }
  | null = null;
let oauthCallbackServer: Server | null = null;

const nowIso = () => new Date().toISOString();
const randomString = (length = 64) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = randomBytes(length);
  let output = "";
  for (let i = 0; i < length; i += 1) output += chars[bytes[i] % chars.length];
  return output;
};
const toBase64Url = (input: Buffer) =>
  input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
const pkceChallenge = (verifier: string) => toBase64Url(createHash("sha256").update(verifier).digest());
const parseJwtPayload = (token?: string) => {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
};
const cleanupOauthPending = () => {
  const ttl = 15 * 60 * 1000;
  const now = Date.now();
  for (const [requestId, pending] of oauthByRequestId.entries()) {
    if (now - pending.createdAt > ttl) {
      oauthByRequestId.delete(requestId);
      oauthByState.delete(pending.state);
    }
  }
};
const stopOauthCallbackServer = () => {
  if (!oauthCallbackServer) return;
  oauthCallbackServer.close();
  oauthCallbackServer = null;
};
const isPidAlive = (pid: number) => {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const releaseWorkerLock = () => {
  if (!lockAcquired) return;
  try {
    if (fs.existsSync(lockFilePath)) {
      const raw = fs.readFileSync(lockFilePath, "utf8");
      const parsed = JSON.parse(raw) as { pid?: number };
      if (parsed.pid === process.pid) {
        fs.unlinkSync(lockFilePath);
      }
    }
  } catch {
    // ignore lock release errors
  }
  lockAcquired = false;
};

const acquireWorkerLock = () => {
  try {
    const payload = JSON.stringify({ pid: process.pid, startedAt: nowIso() });
    fs.writeFileSync(lockFilePath, payload, { encoding: "utf8", flag: "wx" });
    lockAcquired = true;
    return;
  } catch {
    // lock exists or cannot create
  }

  try {
    const raw = fs.readFileSync(lockFilePath, "utf8");
    const parsed = JSON.parse(raw) as { pid?: number };
    const pid = Number(parsed.pid ?? 0);
    if (!isPidAlive(pid)) {
      fs.unlinkSync(lockFilePath);
      const payload = JSON.stringify({ pid: process.pid, startedAt: nowIso() });
      fs.writeFileSync(lockFilePath, payload, { encoding: "utf8", flag: "wx" });
      lockAcquired = true;
      return;
    }
    throw new Error(`Worker da dang chay (pid=${pid}).`);
  } catch (error) {
    throw new Error(`Khong the khoi dong worker moi: ${(error as Error).message}`);
  }
};
const startedAt = nowIso();
const pushEvent = (message: string) => {
  const line = `${nowIso()} | ${message}`;
  eventSeq += 1;
  recentEvents.unshift({ seq: eventSeq, line });
  if (recentEvents.length > 500) recentEvents.length = 500;
  // eslint-disable-next-line no-console
  console.log(`[worker-user-direct] ${message}`);
};

const scheduleRetry = (ms: number, reason: string) => {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  pushEvent(`se thu lai sau ${Math.round(ms / 1000)}s (${reason})`);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void runCycleSafe().catch(() => undefined);
  }, ms);
};

const stripUndefined = <T>(input: T): T => {
  if (Array.isArray(input)) {
    return input.map((item) => stripUndefined(item)).filter((item) => item !== undefined) as T;
  }
  if (input && typeof input === "object") {
    const next = Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, stripUndefined(value)]),
    );
    return next as T;
  }
  return input;
};

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
    return mapped.some((value) => fromLower.includes(value) || participantsLower.some((participant) => participant.includes(value)));
  });
};

const app =
  getApps()[0] ??
  initializeApp({
    apiKey: firebaseApiKey,
    authDomain: firebaseAuthDomain,
    projectId: firebaseProjectId,
    appId: firebaseAppId,
    storageBucket: firebaseStorageBucket,
    messagingSenderId: firebaseMessagingSenderId,
  });

const auth = getAuth(app);
const db = getFirestore(app);

const persistWorkerConfig = () => {
  const envLines = [
    "# Auto-generated by local agent configure",
    `FIREBASE_WEB_API_KEY=${firebaseApiKey}`,
    `FIREBASE_AUTH_DOMAIN=${firebaseAuthDomain}`,
    `FIREBASE_PROJECT_ID=${firebaseProjectId}`,
    `FIREBASE_STORAGE_BUCKET=${firebaseStorageBucket}`,
    `FIREBASE_MESSAGING_SENDER_ID=${firebaseMessagingSenderId}`,
    `FIREBASE_APP_ID=${firebaseAppId}`,
    `USER_EMAIL=${userEmail}`,
    `USER_PASSWORD=${userPassword}`,
    `WORKER_INTERVAL_MINUTES=${intervalMinutes}`,
    `WORKER_LIMIT=${fetchLimit}`,
    `WORKER_AGENT_PORT=${agentPort}`,
    `OAUTH_CALLBACK_PORT=${oauthCallbackPort}`,
  ].join("\r\n");
  fs.writeFileSync(workerEnvPath, envLines, "utf8");
};

const ensureTimer = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  timer = setInterval(() => {
    void runCycleSafe().catch(() => undefined);
  }, intervalMinutes * 60 * 1000);
};

const buildFilter = (defaultFilters?: EmailFilter): EmailFilter => ({
  ...(defaultFilters ?? {}),
  limit: fetchLimit,
  cursor: undefined,
});

const isConfigured = () => userEmail.trim().length > 0 && userPassword.trim().length > 0;

const ensureSignedIn = async () => {
  if (!isConfigured()) {
    throw new Error("Worker chua duoc cau hinh tai khoan (USER_EMAIL/USER_PASSWORD).");
  }

  const current = auth.currentUser;
  const currentEmail = current?.email?.trim().toLowerCase() ?? "";
  if (current && currentEmail === userEmail.trim().toLowerCase()) {
    return current;
  }

  if (current) {
    currentStage = "re-authenticating";
    pushEvent("dang dang xuat phien cu");
    await signOut(auth);
  }

  currentStage = "authenticating";
  pushEvent(`dang dang nhap firebase user=${userEmail}`);
  const credential = await signInWithEmailAndPassword(auth, userEmail, userPassword);
  return credential.user;
};

const runCycle = async () => {
  if (syncing) return;
  syncing = true;
  cancelRequested = false;
  currentStage = "starting";

  const current = await ensureSignedIn();
  const uid = current.uid;
  pushEvent(`bat dau chu ky uid=${uid}`);

  currentStage = "loading-config";
  const configRef = doc(db, "users", uid, "config", "default");
  const configSnap = await getDoc(configRef);
  if (!configSnap.exists()) {
    lastRunAt = nowIso();
    lastResult = { fetched: 0, saved: 0 };
    lastError = "Missing config/default";
    currentStage = "error";
    pushEvent("khong tim thay config/default");
    syncing = false;
    return;
  }

  const config = configSnap.data() as UserConfig;
  if (!config.imap?.password) {
    lastRunAt = nowIso();
    lastResult = { fetched: 0, saved: 0 };
    lastError = "Missing IMAP password";
    currentStage = "error";
    pushEvent("thieu IMAP password");
    syncing = false;
    return;
  }

  const filter = buildFilter(config.defaultFilters);
  currentStage = "fetching-imap";
  pushEvent(`dang fetch IMAP limit=${fetchLimit}`);
  const fetched = await withTimeout(
    fetchImapEmails(config.imap, filter, {
      shouldCancel: () => cancelRequested,
      onClient: (client) => {
        activeImapClient = client;
      },
    }),
    IMAP_FETCH_TIMEOUT_MS,
    `IMAP fetch timeout sau ${Math.round(IMAP_FETCH_TIMEOUT_MS / 1000)} giay`,
  );
  activeImapClient = null;
  const withMetadata = attachEmailMetadata(fetched);

  const filteredByGroup =
    filter.tags && filter.tags.length > 0
      ? withMetadata.filter((email) => {
          const participants = [...(email.to ?? []).map((item) => item.address), ...(email.cc ?? []).map((item) => item.address)];
          return hasAnyGroupMatch(email.from.address, participants, filter.tags ?? [], config.ai.tagMapping ?? {});
        })
      : withMetadata;

  const limited = filteredByGroup.slice(0, fetchLimit);
  const nextItem = filteredByGroup.at(fetchLimit);

  currentStage = "saving-firestore";
  pushEvent(`dang luu firestore saved=${limited.length}`);
  const batch = writeBatch(db);
  for (const email of limited) {
    batch.set(doc(db, "users", uid, "emails", email.id), stripUndefined(email as Email), { merge: true });
  }

  const lastFetchMeta: LastFetchMeta = {
    fetchedAt: nowIso(),
    requestFilter: { ...filter, limit: fetchLimit },
    pagination: {
      limit: fetchLimit,
      nextCursor: nextItem?.date,
      hasMore: Boolean(nextItem),
    },
    count: limited.length,
  };
  batch.set(doc(db, "users", uid, "meta", "lastFetch"), stripUndefined(lastFetchMeta), { merge: true });
  await batch.commit();

  lastRunAt = nowIso();
  lastResult = { fetched: fetched.length, saved: limited.length };
  lastError = null;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  currentStage = "idle";
  pushEvent(`hoan tat fetched=${fetched.length} saved=${limited.length}`);
  syncing = false;
};

const runCycleSafe = async () => {
  try {
    await runCycle();
  } catch (error) {
    const message = (error as Error).message;
    lastRunAt = nowIso();
    lastError = message;
    currentStage = "error";
    syncing = false;
    pushEvent(`loi: ${message}`);
    if (message.includes("Fetch cancelled by user")) {
      currentStage = "idle";
      lastError = null;
      pushEvent("da huy phien fetch theo yeu cau");
      return;
    }
    if (cancelRequested && message.includes("Connection not available")) {
      currentStage = "idle";
      lastError = null;
      pushEvent("da huy phien fetch theo yeu cau");
      return;
    }
    if (message.includes("Connection not available")) {
      currentStage = "imap-retry";
      lastError = null;
      scheduleRetry(10_000, "IMAP mat ket noi tam thoi, thu lai sau 10s");
    }
    if (message.includes("EAI_AGAIN")) {
      currentStage = "dns-retry";
      lastError = null;
      scheduleRetry(60_000, "DNS tam thoi khong phan giai duoc host IMAP");
    }
    throw error;
  } finally {
    activeImapClient = null;
    cancelRequested = false;
    if (!syncing && queuedFetch) {
      queuedFetch = false;
      pushEvent("thuc hien lenh fetch da xep hang");
      void runCycleSafe().catch(() => undefined);
    }
  }
};

const toStatusPayload = () => ({
  ok: true,
  version: workerVersion,
  configured: isConfigured(),
  authenticated: Boolean(auth.currentUser),
  syncing,
  intervalMinutes,
  fetchLimit,
  stage: currentStage,
  lastRunAt,
  lastResult,
  lastError,
  userEmail: userEmail || null,
  startedAt,
  openaiOAuth: {
    connected: Boolean(openaiOauthSession?.accessToken),
    accountEmail: openaiOauthSession?.accountEmail ?? null,
    expiresAt: openaiOauthSession?.expiresAt ?? null,
    updatedAt: openaiOauthSession?.updatedAt ?? null,
  },
});

const readRequestBody = async (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => {
      data += chunk.toString();
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

const startOauthCallbackServer = () => {
  if (oauthCallbackServer) return;
  const callbackServer = createServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", `http://localhost:${oauthCallbackPort}`);
    if (requestUrl.pathname !== "/auth/callback") {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    const state = requestUrl.searchParams.get("state") ?? "";
    const code = requestUrl.searchParams.get("code") ?? "";
    const error = requestUrl.searchParams.get("error") ?? "";
    const errorDescription = requestUrl.searchParams.get("error_description") ?? "";
    const requestId = oauthByState.get(state);

    if (requestId) {
      const pending = oauthByRequestId.get(requestId);
      if (pending) {
        pending.updatedAt = Date.now();
        if (error) {
          pending.status = "error";
          pending.error = error;
          pending.errorDescription = errorDescription || error;
          pushEvent(`oauth callback error requestId=${requestId} error=${error}`);
        } else if (code) {
          pending.status = "authorized";
          pending.code = code;
          pushEvent(`oauth callback authorized requestId=${requestId}`);
        }
      }
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`
<!doctype html>
<html><head><meta charset="utf-8"><title>CogniMail OAuth</title></head>
<body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#0f172a;color:#e2e8f0">
  <h3>CogniMail OAuth</h3>
  <p>${error ? "Đăng nhập thất bại. Bạn có thể đóng tab này." : "Đăng nhập thành công. Bạn có thể đóng tab này."}</p>
</body></html>`);
  });

  oauthCallbackServer = callbackServer;
  callbackServer.listen(oauthCallbackPort, "127.0.0.1", () => {
    pushEvent(`oauth callback ready http://127.0.0.1:${oauthCallbackPort}/auth/callback`);
  });
};

const startLocalAgentServer = () => {
  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = requestUrl.pathname;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Accept");
    res.setHeader("Access-Control-Allow-Private-Network", "true");

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (pathname === "/ping" && req.method === "GET") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          ok: true,
          version: workerVersion,
          stage: currentStage,
          syncing,
          startedAt,
        }),
      );
      return;
    }

    if ((pathname === "/status" || pathname === "/health") && req.method === "GET") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(toStatusPayload()));
      return;
    }

    if (pathname === "/events" && req.method === "GET") {
      const sinceSeq = Number.parseInt(requestUrl.searchParams.get("since") ?? "0", 10);
      const normalizedSince = Number.isNaN(sinceSeq) ? 0 : Math.max(0, sinceSeq);
      const events = recentEvents.filter((item) => item.seq > normalizedSince).sort((a, b) => a.seq - b.seq);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          ok: true,
          version: workerVersion,
          stage: currentStage,
          lastRunAt,
          lastError,
          latestSeq: eventSeq,
          events,
        }),
      );
      return;
    }

    if (pathname === "/oauth/openai/start" && req.method === "POST") {
      try {
        startOauthCallbackServer();
        cleanupOauthPending();
        const raw = await readRequestBody(req);
        const payload = raw
          ? (JSON.parse(raw) as {
              clientId?: string;
              authorizeUrl?: string;
              tokenUrl?: string;
              scope?: string;
              redirectUri?: string;
            })
          : {};

        const clientId = String(payload.clientId ?? openaiClientDefault).trim();
        const authorizeUrl = String(payload.authorizeUrl ?? openaiAuthorizeDefault).trim();
        const tokenUrl = String(payload.tokenUrl ?? openaiTokenDefault).trim();
        const scope = String(payload.scope ?? openaiScopeDefault).trim();
        const requestedRedirectUri = String(payload.redirectUri ?? "").trim();
        const isLocalCallbackRedirectUri = /:\/\/(?:localhost|127\.0\.0\.1):\d+(?:\/auth\/callback)?(?:$|[?#])/i.test(requestedRedirectUri);
        const isExpectedLocalRedirectUri = new RegExp(
          `://(?:localhost|127\\.0\\.0\\.1):${oauthCallbackPort}(?:/auth/callback)?(?:$|[?#])`,
          "i",
        ).test(requestedRedirectUri);
        const redirectUri =
          requestedRedirectUri &&
          (!isLocalCallbackRedirectUri || isExpectedLocalRedirectUri)
            ? requestedRedirectUri
            : openaiRedirectDefault;
        if (!clientId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, message: "Thiếu clientId OAuth." }));
          return;
        }

        const requestId = randomString(24);
        const state = randomString(32);
        const codeVerifier = randomString(96);
        const codeChallenge = pkceChallenge(codeVerifier);

        const pending: OauthPending = {
          requestId,
          state,
          codeVerifier,
          clientId,
          authorizeUrl,
          tokenUrl,
          scope,
          redirectUri,
          status: "pending",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        oauthByRequestId.set(requestId, pending);
        oauthByState.set(state, requestId);

        const url = new URL(authorizeUrl);
        url.searchParams.set("client_id", clientId);
        url.searchParams.set("redirect_uri", redirectUri);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", scope);
        url.searchParams.set("state", state);
        url.searchParams.set("code_challenge", codeChallenge);
        url.searchParams.set("code_challenge_method", "S256");
        url.searchParams.set("id_token_add_organizations", "true");
        url.searchParams.set("codex_cli_simplified_flow", "true");
        url.searchParams.set("originator", "pi");

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: true, requestId, authUrl: url.toString(), redirectUri }));
        pushEvent(`oauth start requestId=${requestId}`);
        return;
      } catch (error) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, message: (error as Error).message }));
        return;
      }
    }

    if (pathname === "/oauth/openai/result" && req.method === "GET") {
      cleanupOauthPending();
      const requestId = requestUrl.searchParams.get("requestId") ?? "";
      const pending = oauthByRequestId.get(requestId);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      if (!pending) {
        res.statusCode = 404;
        res.end(JSON.stringify({ ok: false, message: "Không tìm thấy phiên OAuth." }));
        return;
      }
      res.end(
        JSON.stringify({
          ok: true,
          requestId: pending.requestId,
          status: pending.status,
          error: pending.error,
          errorDescription: pending.errorDescription,
          accountEmail: pending.accountEmail,
        }),
      );
      return;
    }

    if (pathname === "/oauth/openai/exchange" && req.method === "POST") {
      try {
        cleanupOauthPending();
        const raw = await readRequestBody(req);
        const payload = raw ? (JSON.parse(raw) as { requestId?: string }) : {};
        const requestId = String(payload.requestId ?? "").trim();
        const pending = oauthByRequestId.get(requestId);
        if (!pending) {
          res.statusCode = 404;
          res.end(JSON.stringify({ ok: false, message: "Không tìm thấy phiên OAuth." }));
          return;
        }
        if (pending.status === "error") {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, message: pending.errorDescription || pending.error || "OAuth lỗi." }));
          return;
        }
        if (!pending.code) {
          res.statusCode = 409;
          res.end(JSON.stringify({ ok: false, message: "Chưa nhận code OAuth. Hãy đăng nhập trước." }));
          return;
        }

        const tokenResponse = await fetch(pending.tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: pending.clientId,
            code: pending.code,
            redirect_uri: pending.redirectUri,
            code_verifier: pending.codeVerifier,
          }).toString(),
        });
        const tokenJson = (await tokenResponse.json().catch(() => null)) as
          | {
              access_token?: string;
              refresh_token?: string;
              expires_in?: number;
              id_token?: string;
              error?: string;
              error_description?: string;
            }
          | null;
        if (!tokenResponse.ok || !tokenJson?.access_token) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              ok: false,
              message: tokenJson?.error_description || tokenJson?.error || `Token endpoint lỗi (${tokenResponse.status})`,
            }),
          );
          return;
        }
        const expiresAt = tokenJson.expires_in
          ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
          : undefined;
        const jwtPayload = parseJwtPayload(tokenJson.id_token);
        const accountEmail = typeof jwtPayload?.email === "string" ? jwtPayload.email : undefined;

        pending.status = "exchanged";
        pending.updatedAt = Date.now();
        pending.accessToken = tokenJson.access_token;
        pending.refreshToken = tokenJson.refresh_token;
        pending.expiresAt = expiresAt;
        pending.accountEmail = accountEmail;
        openaiOauthSession = {
          accessToken: pending.accessToken,
          refreshToken: pending.refreshToken,
          expiresAt: pending.expiresAt,
          accountEmail: pending.accountEmail,
          updatedAt: nowIso(),
        };
        stopOauthCallbackServer();

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({
            ok: true,
            accessToken: pending.accessToken,
            refreshToken: pending.refreshToken,
            expiresAt: pending.expiresAt,
            accountEmail: pending.accountEmail,
          }),
        );
        pushEvent(`oauth exchanged requestId=${requestId}`);
        return;
      } catch (error) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, message: (error as Error).message }));
        return;
      }
    }

    if (pathname === "/ai/openai/responses" && req.method === "POST") {
      try {
        const raw = await readRequestBody(req);
        const payload = raw
          ? (JSON.parse(raw) as {
              model?: string;
              instructions?: string;
              input?: string | Array<Record<string, unknown>>;
              expectJson?: boolean;
            })
          : {};
        const model = String(payload.model ?? "").trim();
        const inputRaw = payload.input;
        const input =
          typeof inputRaw === "string"
            ? inputRaw.trim()
            : Array.isArray(inputRaw)
              ? inputRaw
              : "";
        const instructions = String(payload.instructions ?? "").trim();
        const expectJson = Boolean(payload.expectJson ?? true);
        if (!model || (typeof input === "string" ? !input : input.length === 0)) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ ok: false, message: "Thiếu model hoặc input." }));
          return;
        }
        if (!openaiOauthSession?.accessToken) {
          res.statusCode = 401;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ ok: false, message: "Chưa đăng nhập OpenAI OAuth trên worker." }));
          return;
        }

        const normalizedInput =
          typeof input === "string"
            ? [
                ...(instructions
                  ? [
                      {
                        role: "system",
                        content: [{ type: "input_text", text: instructions }],
                      },
                    ]
                  : []),
                {
                  role: "user",
                  content: [{ type: "input_text", text: input }],
                },
              ]
            : input;

        const requestBody: Record<string, unknown> = {
          model,
          instructions: (instructions || codexDefaultInstructions).trim(),
          input: normalizedInput,
          stream: true,
          store: false,
        };
        if (expectJson) {
          requestBody.text = { format: { type: "json_object" } };
        }

        const openaiResp = await fetch(openaiCodexResponsesUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiOauthSession.accessToken}`,
          },
          body: JSON.stringify(requestBody),
        });

        if (!openaiResp.ok) {
          const text = await openaiResp.text();
          res.statusCode = openaiResp.status;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(text);
          return;
        }

        const contentType = openaiResp.headers.get("content-type") ?? "";
        if (!contentType.includes("text/event-stream")) {
          const text = await openaiResp.text();
          res.statusCode = openaiResp.status;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(text);
          return;
        }

        const reader = openaiResp.body?.getReader();
        if (!reader) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ ok: false, message: "Không đọc được stream từ Codex endpoint." }));
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let outputText = "";
        let completedResponse: Record<string, unknown> | null = null;

        const handleEventChunk = (chunk: string) => {
          const lines = chunk
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const event = JSON.parse(payload) as {
                type?: string;
                delta?: string;
                response?: Record<string, unknown>;
              };
              if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
                outputText += event.delta;
              }
              if (event.type === "response.completed" && event.response && typeof event.response === "object") {
                completedResponse = event.response;
              }
            } catch {
              // ignore malformed event chunk
            }
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sepIndex = buffer.indexOf("\n\n");
          while (sepIndex >= 0) {
            const eventChunk = buffer.slice(0, sepIndex);
            buffer = buffer.slice(sepIndex + 2);
            handleEventChunk(eventChunk);
            sepIndex = buffer.indexOf("\n\n");
          }
        }
        if (buffer.trim()) handleEventChunk(buffer);

        const finalPayload: Record<string, unknown> = completedResponse ?? {};
        if (outputText.trim()) {
          finalPayload.output_text = outputText.trim();
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(finalPayload));
        return;
      } catch (error) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, message: (error as Error).message }));
        return;
      }
    }

    if ((pathname === "/config" || pathname === "/configure") && req.method === "POST") {
      try {
        const raw = await readRequestBody(req);
        const payload = raw
          ? (JSON.parse(raw) as { email?: string; password?: string; intervalMinutes?: number; limit?: number; fetchNow?: boolean })
          : {};

        const nextEmail = (payload.email ?? "").trim();
        const nextPassword = payload.password ?? "";
        const nextInterval = Math.max(1, Math.min(120, Number(payload.intervalMinutes ?? intervalMinutes)));
        const nextLimit = Math.max(1, Math.min(100, Number(payload.limit ?? fetchLimit)));

        if (!nextEmail || !nextPassword) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, message: "Thieu email hoac password." }));
          return;
        }

        userEmail = nextEmail;
        userPassword = nextPassword;
        intervalMinutes = nextInterval;
        fetchLimit = nextLimit;
        if (!syncing) {
          currentStage = "configured";
        }
        pushEvent(`da cau hinh interval=${intervalMinutes}m limit=${fetchLimit}`);
        persistWorkerConfig();
        ensureTimer();
        const previousRunAt = lastRunAt;
        const shouldFetchNow = Boolean(payload.fetchNow);
          if (shouldFetchNow) {
            void (async () => {
              try {
                await ensureSignedIn();
                await runCycleSafe();
              } catch (error) {
                pushEvent(`configure-run error: ${(error as Error).message}`);
              }
            })();
          }

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({
            ok: true,
            message: shouldFetchNow ? "Da nhan cau hinh va dang lay email." : "Da nhan cau hinh.",
            stage: currentStage,
            previousRunAt,
            lastRunAt,
            lastResult,
          }),
        );
        return;
      } catch (error) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, message: (error as Error).message }));
        return;
      }
    }

      if (pathname === "/fetch" && req.method === "POST") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      if (!isConfigured()) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, message: "Chua cau hinh worker. Hay gui /config truoc." }));
        return;
      }
      const raw = await readRequestBody(req);
      const payload = raw ? (JSON.parse(raw) as { queueIfBusy?: boolean }) : {};
      const queueIfBusy = Boolean(payload.queueIfBusy);
      if (syncing) {
        if (queueIfBusy) {
          queuedFetch = true;
          res.end(JSON.stringify({ ok: true, queued: true, message: "Worker dang lay email, da xep hang lan fetch tiep theo." }));
          return;
        }
        res.statusCode = 409;
        res.end(JSON.stringify({ ok: false, message: "Worker dang lay email." }));
        return;
      }
      const previousRunAt = lastRunAt;
      void (async () => {
        try {
          await ensureSignedIn();
          await runCycleSafe();
        } catch (error) {
          pushEvent(`fetch-run error: ${(error as Error).message}`);
        }
      })();
        res.end(JSON.stringify({ ok: true, message: "Worker da nhan lenh lay email.", previousRunAt, stage: currentStage }));
        return;
      }

      if (pathname === "/cancel" && req.method === "POST") {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        if (!syncing) {
          res.end(JSON.stringify({ ok: true, message: "Khong co phien fetch nao dang chay." }));
          return;
        }
        cancelRequested = true;
        queuedFetch = false;
        lastError = null;
        currentStage = "cancelling";
        try {
          activeImapClient?.close?.();
        } catch {
          // ignore close errors
        }
        pushEvent("nguoi dung yeu cau huy phien fetch");
        res.end(JSON.stringify({ ok: true, message: "Da gui lenh huy phien fetch." }));
        return;
      }

    if (pathname === "/sync-now" && req.method === "POST") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      if (!isConfigured()) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, message: "Chua cau hinh worker. Hay gui /configure tu frontend." }));
        return;
      }
      if (syncing) {
        res.statusCode = 409;
        res.end(JSON.stringify({ ok: false, message: "Agent is syncing" }));
        return;
      }

      try {
        pushEvent("yeu cau dong bo ngay tu frontend");
        await runCycleSafe();
        res.end(JSON.stringify({ ok: true, lastRunAt, lastResult, stage: currentStage, recentEvents }));
      } catch (error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, message: (error as Error).message }));
      }
      return;
    }

    res.statusCode = 404;
    res.end("Not found");
  });

  server.listen(agentPort, "127.0.0.1", () => {
    pushEvent(`local agent ready http://127.0.0.1:${agentPort}`);
  });
};

const main = async () => {
  acquireWorkerLock();
  pushEvent(`started interval=${intervalMinutes}m limit=${fetchLimit} port=${agentPort}`);
  startLocalAgentServer();
  ensureTimer();

  if (isConfigured()) {
    try {
      await ensureSignedIn();
      await runCycleSafe();
    } catch (error) {
      lastError = (error as Error).message;
      currentStage = "error";
      pushEvent(`startup error: ${(error as Error).message}`);
    }
  } else {
    currentStage = "waiting-config";
    pushEvent("dang cho /configure tu frontend");
  }
};

process.on("SIGINT", () => {
  releaseWorkerLock();
  process.exit(0);
});
process.on("SIGTERM", () => {
  releaseWorkerLock();
  process.exit(0);
});
process.on("exit", () => {
  releaseWorkerLock();
});

main().catch((error) => {
  currentStage = "fatal";
  pushEvent(`fatal: ${(error as Error).message}`);
  releaseWorkerLock();
  process.exit(1);
});
