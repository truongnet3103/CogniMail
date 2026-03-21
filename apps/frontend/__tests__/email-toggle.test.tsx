import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EmailPage } from "@/components/EmailPage";
import type { UserConfig } from "@/lib/types";

const emails = [
  {
    id: "1",
    subject: "Thread A",
    from: { address: "a@example.com" },
    to: [{ address: "b@example.com" }],
    date: "2025-01-01T00:00:00.000Z",
    textBody: "A",
    hasAttachment: false,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "2",
    subject: "Re: Thread A",
    from: { address: "a@example.com" },
    to: [{ address: "b@example.com" }],
    date: "2025-01-02T00:00:00.000Z",
    textBody: "B",
    hasAttachment: false,
    createdAt: "2025-01-02T00:00:00.000Z",
    updatedAt: "2025-01-02T00:00:00.000Z",
  },
];

const config: UserConfig = {
  imap: { host: "imap.example.com", port: 993, secure: true, username: "user", password: "pw", mailbox: "INBOX" },
  ai: { endpointUrl: "https://example.com/ai", presets: [], tagMapping: {} },
  defaultFilters: { limit: 50, status: "all" },
  updatedAt: new Date().toISOString(),
};

describe("Email fetch + toggle", () => {
  it("renders and toggles grouped view", () => {
    render(
      <EmailPage
        emails={emails}
        config={config}
        output=""
        error=""
        onAiOutput={vi.fn(async () => undefined)}
        onAiError={vi.fn()}
        onDeleteEmails={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.click(screen.getByText("Thư phản hồi"));
    expect(screen.getByText("2 thư", { exact: false })).toBeInTheDocument();
  });
});
