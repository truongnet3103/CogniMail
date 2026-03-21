"use client";

import { useEffect, useState } from "react";

type CallbackData = {
  code: string;
  state: string;
  error: string;
  errorDescription: string;
};

const closeWindow = () => {
  window.setTimeout(() => window.close(), 500);
};

export default function OpenAIOAuthCallbackPage() {
  const [data, setData] = useState<CallbackData>({
    code: "",
    state: "",
    error: "",
    errorDescription: "",
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextData: CallbackData = {
      code: params.get("code") ?? "",
      state: params.get("state") ?? "",
      error: params.get("error") ?? "",
      errorDescription: params.get("error_description") ?? "",
    };
    setData(nextData);

    if (window.opener) {
      window.opener.postMessage(
        {
          type: "cognimail-openai-oauth-callback",
          ...nextData,
        },
        window.location.origin,
      );
      closeWindow();
    }
  }, []);

  if (data.error) {
    return (
      <main className="mx-auto max-w-xl p-6 text-sm text-slate-700">
        <h1 className="mb-2 text-xl font-semibold text-slate-900">Đăng nhập ChatGPT thất bại</h1>
        <p>{data.errorDescription || data.error}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl p-6 text-sm text-slate-700">
      <h1 className="mb-2 text-xl font-semibold text-slate-900">Đăng nhập thành công</h1>
      <p>Bạn có thể đóng cửa sổ này và quay lại CogniMail.</p>
    </main>
  );
}
