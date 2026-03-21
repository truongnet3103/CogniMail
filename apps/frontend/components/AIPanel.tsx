"use client";

import { useEffect, useState } from "react";
import type { AiPayload, AiTokenUsage, BillingProfile, Email, Task, UserConfig } from "@/lib/types";
import { extractEmailFeatures, extractTasks, normalizeSubject } from "@/lib/email-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  config: UserConfig | null;
  emails: Email[];
  selectedIds: string[];
  currentUserEmail?: string;
  billingProfile?: BillingProfile;
  onOutput: (output: string, tasks: Task[], usage?: AiTokenUsage) => void;
  onError: (error: string) => void;
};

const extractTextFromOpenAIResponse = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const json = JSON.parse(trimmed) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };
    if (typeof json.output_text === "string" && json.output_text.trim()) return json.output_text;
    return (
      json.output
        ?.flatMap((item) => item.content ?? [])
        .filter((part) => part?.type === "output_text" || part?.type === "text")
        .map((part) => part.text ?? "")
        .join("\n")
        .trim() ?? ""
    );
  } catch {
    let outputText = "";
    for (const line of trimmed.split(/\r?\n/)) {
      const normalized = line.trim();
      if (!normalized.startsWith("data:")) continue;
      const payload = normalized.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as { type?: string; delta?: string; output_text?: string };
        if (typeof event.output_text === "string") outputText += event.output_text;
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") outputText += event.delta;
      } catch {
        // ignore invalid stream lines
      }
    }
    return outputText.trim();
  }
};

const estimateTokenCount = (input: string) => Math.max(1, Math.ceil((input || "").length / 4));

const numberOrZero = (value: unknown) => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? Math.max(0, Math.floor(num)) : 0;
};

const extractUsageFromJson = (json: unknown, provider: string, model?: string): AiTokenUsage | undefined => {
  if (!json || typeof json !== "object") return undefined;
  const data = json as Record<string, unknown>;
  const usageRaw = (data.usage as Record<string, unknown> | undefined) ?? undefined;

  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  if (usageRaw) {
    promptTokens = numberOrZero(
      usageRaw.input_tokens ?? usageRaw.prompt_tokens ?? usageRaw.promptTokenCount ?? usageRaw.inputTokenCount,
    );
    completionTokens = numberOrZero(
      usageRaw.output_tokens ?? usageRaw.completion_tokens ?? usageRaw.candidatesTokenCount ?? usageRaw.outputTokenCount,
    );
    totalTokens = numberOrZero(usageRaw.total_tokens ?? usageRaw.totalTokenCount ?? promptTokens + completionTokens);
  }

  if (provider === "google" && data.usageMetadata && typeof data.usageMetadata === "object") {
    const usageMetadata = data.usageMetadata as Record<string, unknown>;
    promptTokens = numberOrZero(usageMetadata.promptTokenCount);
    completionTokens = numberOrZero(usageMetadata.candidatesTokenCount);
    totalTokens = numberOrZero(usageMetadata.totalTokenCount ?? promptTokens + completionTokens);
  }

  if (totalTokens <= 0 && (promptTokens > 0 || completionTokens > 0)) {
    totalTokens = promptTokens + completionTokens;
  }

  if (totalTokens <= 0) return undefined;
  return {
    provider,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    estimated: false,
  };
};

const emailToText = (email: Email) =>
  [
    `--- BAT DAU EMAIL ${email.id} ---`,
    `EmailID: ${email.id}`,
    `Tiêu đề: ${email.subject}`,
    `Người gửi: ${email.from.name?.trim() || email.from.address}`,
    `Thời gian: ${email.date}`,
    `Nội dung: ${email.textBody ?? ""}`,
    `--- KET THUC EMAIL ${email.id} ---`,
  ].join("\n");

const buildConversationBlocks = (emails: Email[]) => {
  const buckets = new Map<string, Email[]>();
  for (const email of emails) {
    const key = normalizeSubject(email.subject).toLowerCase() || "(không tiêu đề)";
    const current = buckets.get(key) ?? [];
    buckets.set(key, [...current, email]);
  }

  return [...buckets.entries()].map(([key, items], index) => {
    const sorted = [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const content = sorted.map((email) => emailToText(email)).join("\n\n---\n\n");
    return [
      `=== HỘI THOẠI ${index + 1} ===`,
      `conversationKey: ${key}`,
      `Số email: ${sorted.length}`,
      content,
    ].join("\n");
  });
};

const providerRequest = (
  config: NonNullable<Props["config"]>,
  prompt: string,
  emails: Email[],
  metadataText: string,
) => {
  const provider = config.ai.provider ?? "custom";
  const useLocalOpenAIOAuthProxy = provider === "openai" && Boolean(config.ai.openaiOAuth?.enabled);
  const endpoint =
    useLocalOpenAIOAuthProxy
      ? "http://127.0.0.1:41731/ai/openai/responses"
      : config.ai.endpointUrl || (provider === "openai" ? "https://api.openai.com/v1/responses" : "");
  const model = config.ai.model ?? "";
  const oauthToken =
    provider === "openai" && config.ai.openaiOAuth?.enabled && !useLocalOpenAIOAuthProxy
      ? config.ai.openaiOAuth.accessToken?.trim()
      : undefined;
  const authToken = oauthToken || config.ai.apiKey;
  const conversationBlocks = buildConversationBlocks(emails);
  const emailBlock = conversationBlocks.join("\n\n========================\n\n");
  const soulPrompt = config.ai.soulPrompt?.trim()
    ? `SOUL (vai trò cốt lõi):\n${config.ai.soulPrompt.trim()}\n\n`
    : "";
  const userPrompt = `${soulPrompt}${prompt}

Yêu cầu:
- Không trộn ngữ cảnh giữa các hội thoại.
- Trả lời bằng tiếng Việt có dấu.
- Với mỗi EmailID, phải đọc từ đầu đến cuối nội dung đã được cung cấp.
- Không được bỏ qua phần cuối email chỉ vì phần đầu đã đủ ngữ cảnh.
- Khi tạo task hoặc deadline, phải dựa trên bằng chứng nằm đúng ở email nguồn đó.

Metadata tóm tắt:
${metadataText}

Email theo hội thoại:
${emailBlock}`;
  const openAiInput = [
    ...(instructionsToInput(soulPrompt)
      ? [{ role: "system", content: [{ type: "input_text", text: instructionsToInput(soulPrompt)! }] }]
      : []),
    {
      role: "user",
      content: [{ type: "input_text", text: userPrompt }],
    },
  ];

  if (provider === "openai") {
    if (useLocalOpenAIOAuthProxy) {
      return {
        url: endpoint,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          model,
          input: openAiInput,
          expectJson: true,
        },
        responseParser: async (response: Response) => {
          const raw = await response.text();
          let usage: AiTokenUsage | undefined;
          try {
            usage = extractUsageFromJson(JSON.parse(raw) as unknown, provider, model);
          } catch {
            usage = undefined;
          }
          return { text: extractTextFromOpenAIResponse(raw), usage };
        },
      };
    }

    return {
      url: endpoint || "https://api.openai.com/v1/responses",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken ? `Bearer ${authToken}` : "",
      },
      body: {
        model,
        input: openAiInput,
        stream: false,
        text: { format: { type: "json_object" } },
      },
      responseParser: async (response: Response) => {
        const raw = await response.text();
        let usage: AiTokenUsage | undefined;
        try {
          usage = extractUsageFromJson(JSON.parse(raw) as unknown, provider, model);
        } catch {
          usage = undefined;
        }
        return { text: extractTextFromOpenAIResponse(raw), usage };
      },
    };
  }

  if (provider === "groq" || provider === "openrouter" || provider === "custom") {
    return {
      url: endpoint,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken ? `Bearer ${authToken}` : "",
      },
      body: {
        model,
        messages: [
          {
            role: "system",
            content: "Bạn là trợ lý xử lý email công việc.",
          },
          { role: "user", content: userPrompt },
        ],
      },
      responseParser: async (response: Response) => {
        const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return {
          text: json.choices?.[0]?.message?.content ?? "",
          usage: extractUsageFromJson(json as unknown, provider, model),
        };
      },
    };
  }

  if (provider === "anthropic") {
    return {
      url: endpoint,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.ai.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: {
        model,
        max_tokens: 1500,
        messages: [{ role: "user", content: userPrompt }],
      },
      responseParser: async (response: Response) => {
        const json = (await response.json()) as { content?: Array<{ text?: string }> };
        return {
          text: json.content?.map((item) => item.text ?? "").join("\n").trim() ?? "",
          usage: extractUsageFromJson(json as unknown, provider, model),
        };
      },
    };
  }

  if (provider === "google") {
    const endpointWithModel = endpoint.endsWith("/models")
      ? `${endpoint}/${model}:generateContent`
      : endpoint.includes(":generateContent")
        ? endpoint
        : `${endpoint}:generateContent`;
    const url = config.ai.apiKey ? `${endpointWithModel}?key=${encodeURIComponent(config.ai.apiKey)}` : endpointWithModel;
    return {
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        contents: [{ parts: [{ text: userPrompt }] }],
      },
      responseParser: async (response: Response) => {
        const json = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        return {
          text: json.candidates?.[0]?.content?.parts?.map((item) => item.text ?? "").join("\n").trim() ?? "",
          usage: extractUsageFromJson(json as unknown, provider, model),
        };
      },
    };
  }

  return null;
};

const instructionsToInput = (soulPrompt: string) => {
  const normalized = soulPrompt.trim();
  return normalized.length > 0 ? normalized : null;
};

const strictTaskSchemaPrompt = `
Trả về JSON thuần (không markdown).
Schema:
{
  "tasks": [
    {
      "title": "string",
      "description": "string|null",
      "dueDate": "YYYY-MM-DD|null",
      "dueTime": "HH:mm|null",
      "conversationKey": "string|null",
      "sourceEmailId": "string",
      "tags": ["string"],
      "evidence": "trích đoạn ngắn trong email làm bằng chứng"
    }
  ]
}

Quy tắc:
- Trả tiếng Việt có dấu.
- Chỉ trả task cần hành động thực sự.
- Task có deadline thì thêm tag "deadline".
- Mỗi task phải có sourceEmailId đúng với email nguồn.
- Không được bỏ sót thông tin chỉ vì nó nằm ở cuối email.
- Không cần đánh giá mức độ công việc.
`.trim();

export function AIPanel({ config, emails, selectedIds, currentUserEmail, billingProfile, onOutput, onError }: Props) {
  const [loading, setLoading] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(config?.ai.customPrompt ?? "");
  useEffect(() => {
    setCustomPrompt(config?.ai.customPrompt ?? "");
  }, [config?.ai.customPrompt]);

  const recommendedPrompt = config?.ai.recommendedPrompt || config?.ai.presets?.[0]?.prompt || "";

  const runPrompt = async () => {
    if (config?.ai.provider === "openai" && config.ai.openaiOAuth?.enabled && billingProfile?.plan !== "pro") {
      onError("Gói Free không được dùng OpenAI OAuth. Hãy chuyển Pro hoặc tắt OAuth để dùng API key.");
      return;
    }
    if (!config?.ai.endpointUrl && config?.ai.provider !== "openai") {
      onError("Thiếu endpoint AI trong cài đặt.");
      return;
    }
    if (!config?.ai.model && config.ai.provider !== "custom") {
      onError("Thiếu model cho provider đã chọn.");
      return;
    }
    setLoading(true);
    try {
      const basePrompt = customPrompt || config.ai.customPrompt || recommendedPrompt || "Tóm tắt và trích xuất công việc cần làm.";
      const prompt = `${basePrompt}\n\n${strictTaskSchemaPrompt}`;
      const payload: AiPayload = {
        emails,
        selectedIds,
        metadata: {
          tags: [],
          dateRange: emails.length > 0 ? `${emails.at(-1)?.date ?? ""}..${emails[0]?.date ?? ""}` : "",
        },
        prompt,
      };
      const features = extractEmailFeatures(emails, currentUserEmail);
      const metadataText = JSON.stringify(
        {
          summary: {
            emailCount: emails.length,
            selectedCount: selectedIds.length,
            hasQuestion: features.some((item) => item.hasQuestion),
            hasActionKeyword: features.some((item) => item.hasActionKeyword),
            hasDeadlineText: features.some((item) => item.hasDeadlineText),
          },
        },
        null,
        2,
      );

      const request = providerRequest(config, payload.prompt, payload.emails, metadataText);
      if (!request) throw new Error("Provider chưa được hỗ trợ.");

      const headers = Object.fromEntries(Object.entries(request.headers).filter(([, v]) => Boolean(v)));
      let response = await fetch(request.url, {
        method: request.method,
        headers,
        body: JSON.stringify(request.body),
      });
      if (
        !response.ok &&
        response.status === 404 &&
        config.ai.provider === "openai" &&
        config.ai.openaiOAuth?.enabled &&
        request.url.includes("127.0.0.1:41731")
      ) {
        const fallbackToken = config.ai.openaiOAuth.accessToken?.trim();
        if (fallbackToken) {
          const fallbackResponse = await fetch("https://chatgpt.com/backend-api/codex/responses", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${fallbackToken}`,
            },
            body: JSON.stringify(request.body),
          });
          response = fallbackResponse;
        }
      }

      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        let detail = bodyText;
        try {
          const parsed = JSON.parse(bodyText) as { error?: { message?: string }; message?: string };
          detail = parsed.error?.message || parsed.message || bodyText;
        } catch {
          // keep raw body text
        }
        throw new Error(`AI endpoint lỗi (${response.status})${detail ? `: ${detail}` : ""}`);
      }

      const parsed = await request.responseParser(response);
      const text = parsed?.text ?? "";
      const usageFromProvider = parsed?.usage;
      const estimatedUsage: AiTokenUsage = {
        provider: config.ai.provider ?? "custom",
        model: config.ai.model,
        promptTokens: estimateTokenCount(payload.prompt + "\n" + metadataText + "\n" + JSON.stringify(payload.emails)),
        completionTokens: estimateTokenCount(text),
        totalTokens:
          estimateTokenCount(payload.prompt + "\n" + metadataText + "\n" + JSON.stringify(payload.emails)) +
          estimateTokenCount(text),
        estimated: true,
      };
      const usage = usageFromProvider ?? estimatedUsage;
      const tasks = extractTasks(text, emails, { currentUserEmail });
      onOutput(text, tasks, usage);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-slate-200 bg-slate-50/80">
      <CardHeader>
        <CardTitle>Công cụ AI</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⭐ Prompt khuyến nghị đang được ưu tiên sử dụng.
        </div>

        <Textarea rows={6} value={recommendedPrompt} readOnly className="bg-slate-100" />

        <Textarea
          placeholder="Prompt custom (nếu nhập sẽ ưu tiên hơn prompt khuyến nghị)"
          rows={6}
          value={customPrompt}
          onChange={(event) => setCustomPrompt(event.target.value)}
        />

        <p className="text-xs text-slate-500">
          Provider: {config?.ai.provider ?? "custom"} | Model: {config?.ai.model ?? "(chưa nhập)"} | Email: {emails.length}
        </p>

        <Button className="w-full" onClick={runPrompt} disabled={loading || emails.length === 0}>
          {loading ? "Đang chạy AI..." : "Chạy AI"}
        </Button>
      </CardContent>
    </Card>
  );
}


