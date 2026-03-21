import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const authMocks = vi.hoisted(() => ({
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, cb: (value: null) => void) => {
    cb(null);
    return () => undefined;
  },
  signInWithEmailAndPassword: authMocks.signInWithEmailAndPassword,
  createUserWithEmailAndPassword: authMocks.createUserWithEmailAndPassword,
  signOut: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  firebaseAuth: {},
}));

vi.mock("@/lib/firestore", () => ({
  loadRecentEmails: vi.fn(async () => []),
  loadConfig: vi.fn(async () => null),
  loadTasks: vi.fn(async () => []),
  deleteEmails: vi.fn(async () => undefined),
  saveConfig: vi.fn(async () => undefined),
  saveTasks: vi.fn(async () => undefined),
}));

vi.mock("@/lib/api", () => ({
  fetchEmailsFromBackend: vi.fn(),
  saveConfigToBackend: vi.fn(),
  testImapConfigFromBackend: vi.fn(),
}));

import HomePage from "@/app/page";

describe("Login flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("shows login/register and calls login", async () => {
    render(<HomePage />);
    fireEvent.click(screen.getByText("Bắt đầu"));

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText("Mật khẩu"), { target: { value: "secret" } });
    fireEvent.click(screen.getByText("Đăng nhập"));

    await waitFor(() => {
      expect(authMocks.signInWithEmailAndPassword).toHaveBeenCalledOnce();
    });
  });

  it("calls register", async () => {
    render(<HomePage />);
    fireEvent.click(screen.getByText("Bắt đầu"));
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText("Mật khẩu"), { target: { value: "secret" } });
    fireEvent.click(screen.getByText("Đăng ký"));

    await waitFor(() => {
      expect(authMocks.createUserWithEmailAndPassword).toHaveBeenCalledOnce();
    });
  });
});
