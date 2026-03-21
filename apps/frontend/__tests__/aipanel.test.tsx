import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AIPanel } from "@/components/AIPanel";
import type { Email, UserConfig } from "@/lib/types";

const config: UserConfig = {
  imap: {
    host: "",
    port: 993,
    secure: true,
    username: "",
  },
  ai: {
    provider: "openai",
    model: "gpt-4.1-mini",
    endpointUrl: "https://example.com/ai",
    apiKey: "k",
    presets: [{ id: "p1", label: "Preset", prompt: "Extract tasks" }],
    tagMapping: {},
  },
  updatedAt: new Date().toISOString(),
};

const emails: Email[] = [
  {
    id: "1",
    subject: "Hi",
    from: { address: "a@example.com" },
    to: [{ address: "b@example.com" }],
    date: "2025-01-01T00:00:00.000Z",
    textBody: "Body",
    hasAttachment: false,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  },
];

describe("AIPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("handles success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '{"tasks":[{"id":"t1","title":"Do it","createdAt":"2025-01-01T00:00:00.000Z"}]}',
              },
            },
          ],
        }),
      })) as typeof fetch,
    );

    const onOutput = vi.fn();
    const onError = vi.fn();

    render(<AIPanel config={config} emails={emails} selectedIds={["1"]} onOutput={onOutput} onError={onError} />);
    fireEvent.click(screen.getByText("Chạy AI"));

    await waitFor(() => {
      expect(onOutput).toHaveBeenCalledOnce();
    });
  });

  it("handles endpoint errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, text: async () => "" })) as typeof fetch,
    );

    const onOutput = vi.fn();
    const onError = vi.fn();

    render(<AIPanel config={config} emails={emails} selectedIds={["1"]} onOutput={onOutput} onError={onError} />);
    fireEvent.click(screen.getByText("Chạy AI"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });
  });
});
