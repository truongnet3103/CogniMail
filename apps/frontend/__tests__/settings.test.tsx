import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsPage } from "@/components/SettingsPage";
import type { UserConfig } from "@/lib/types";

const config: UserConfig = {
  imap: {
    host: "imap.example.com",
    port: 993,
    secure: true,
    username: "user@example.com",
    password: "pw",
    mailbox: "INBOX",
  },
  ai: {
    endpointUrl: "https://api.example.com",
    apiKey: "k",
    presets: [],
    tagMapping: {},
  },
  defaultFilters: {
    limit: 50,
    status: "all",
  },
  updatedAt: new Date().toISOString(),
};

describe("Settings persistence", () => {
  it("saves updated config", async () => {
    const onSave = vi.fn(async () => undefined);
    render(<SettingsPage config={config} onSave={onSave} senderSuggestions={[]} />);

    fireEvent.change(screen.getByPlaceholderText("Host"), { target: { value: "mail.example.com" } });
    fireEvent.click(screen.getByText("Lưu"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledOnce();
      expect(onSave.mock.calls[0][0].imap.host).toBe("mail.example.com");
    });
  });
});

