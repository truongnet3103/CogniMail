import axios from "axios";
import type { EmailsResponse, UserConfig } from "@/lib/types";

export const backendBaseUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://cognimail-backend.vercel.app";

export const authHeaders = async (getToken: () => Promise<string>) => {
  const token = await getToken();
  return {
    Authorization: `Bearer ${token}`,
  };
};

export const fetchEmailsFromBackend = async (
  getToken: () => Promise<string>,
  query: URLSearchParams,
): Promise<EmailsResponse> => {
  const headers = await authHeaders(getToken);
  const { data } = await axios.get<EmailsResponse>(`${backendBaseUrl}/emails?${query.toString()}`, { headers });
  return data;
};

export const fetchConfigFromBackend = async (getToken: () => Promise<string>) => {
  const headers = await authHeaders(getToken);
  const { data } = await axios.get<{ config: UserConfig | null }>(`${backendBaseUrl}/config`, { headers });
  return data.config;
};

export const saveConfigToBackend = async (getToken: () => Promise<string>, config: UserConfig) => {
  const headers = await authHeaders(getToken);
  await axios.post(`${backendBaseUrl}/config`, config, { headers });
};

export const testImapConfigFromBackend = async (
  getToken: () => Promise<string>,
  imap: UserConfig["imap"],
) => {
  const headers = await authHeaders(getToken);
  const { data } = await axios.post<{ ok: boolean; error?: string }>(
    `${backendBaseUrl}/config/test-imap`,
    { imap },
    { headers },
  );
  return data;
};
