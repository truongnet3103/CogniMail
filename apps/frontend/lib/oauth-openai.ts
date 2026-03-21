type OpenAIOAuthConfig = {
  clientId: string;
  authorizeUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scope: string;
};

type OauthStartResult = {
  authUrl: string;
  state: string;
};

export type OpenAITokenResult = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  idToken?: string;
  raw: unknown;
};

const STORAGE_KEY = "cognimail_openai_oauth_pkce";

const toBase64Url = (input: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const randomString = (length = 64) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let output = "";
  for (let i = 0; i < length; i += 1) {
    output += chars[bytes[i] % chars.length];
  }
  return output;
};

const sha256 = async (value: string) => {
  const encoded = new TextEncoder().encode(value);
  return crypto.subtle.digest("SHA-256", encoded);
};

export const startOpenAIOAuthPkce = async (config: OpenAIOAuthConfig): Promise<OauthStartResult> => {
  const state = randomString(40);
  const codeVerifier = randomString(96);
  const codeChallenge = toBase64Url(await sha256(codeVerifier));

  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      state,
      codeVerifier,
      tokenUrl: config.tokenUrl,
      redirectUri: config.redirectUri,
      clientId: config.clientId,
    }),
  );

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    originator: "pi",
  });

  return {
    authUrl: `${config.authorizeUrl}?${params.toString()}`,
    state,
  };
};

export const exchangeOpenAIOAuthCode = async (code: string, state: string): Promise<OpenAITokenResult> => {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    throw new Error("Không tìm thấy phiên OAuth. Hãy bấm đăng nhập lại.");
  }

  let payload: {
    state: string;
    codeVerifier: string;
    tokenUrl: string;
    redirectUri: string;
    clientId: string;
  };
  try {
    payload = JSON.parse(raw) as {
      state: string;
      codeVerifier: string;
      tokenUrl: string;
      redirectUri: string;
      clientId: string;
    };
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    throw new Error("Phiên OAuth không hợp lệ.");
  }

  if (!payload.state || payload.state !== state) {
    throw new Error("State OAuth không khớp. Hãy thử lại.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: payload.clientId,
    redirect_uri: payload.redirectUri,
    code_verifier: payload.codeVerifier,
  });

  const response = await fetch(payload.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const json = (await response.json().catch(() => null)) as
    | {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        id_token?: string;
        error?: string;
        error_description?: string;
      }
    | null;

  if (!response.ok || !json?.access_token) {
    const message =
      json?.error_description || json?.error || `Token endpoint lỗi (${response.status})`;
    throw new Error(message);
  }

  sessionStorage.removeItem(STORAGE_KEY);
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
    idToken: json.id_token,
    raw: json,
  };
};
