"use client";

import { useEffect, useMemo, useState } from "react";
import type { BillingProfile, LocalAgentHealth, UserConfig } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/ui/segmented";

type Props = {
  config: UserConfig;
  currentUserEmail?: string;
  onSave: (config: UserConfig) => Promise<void>;
  onTestImap?: (imap: UserConfig["imap"]) => Promise<{ ok: boolean; error?: string }>;
  senderSuggestions: string[];
  localAgentStatus?: string;
  localAgentHealth?: LocalAgentHealth | null;
  localAgentBusy?: boolean;
  onCheckLocalAgent?: () => Promise<void>;
  onCancelLocalAgent?: () => Promise<void>;
  onConfigureLocalAgent?: (input: { email: string; password: string; intervalMinutes: number; limit: number }) => Promise<void>;
  billingProfile: BillingProfile;
  onSetPlan: (plan: BillingProfile["plan"]) => Promise<void>;
  onManualTopup: (amount: number, note?: string) => Promise<void>;
  onConnectOpenAIOAuth?: () => Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: string;
    accountEmail?: string;
    redirectUri?: string;
  }>;
};

type TagGroup = {
  id: string;
  name: string;
  senders: string[];
};

const providerDefaults: Record<string, string> = {
  openai: "https://api.openai.com/v1/responses",
  anthropic: "https://api.anthropic.com/v1/messages",
  google: "https://generativelanguage.googleapis.com/v1beta/models",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  custom: "",
};

const providerMethod: Record<string, "POST" | "PUT"> = {
  openai: "POST",
  anthropic: "POST",
  google: "POST",
  groq: "POST",
  openrouter: "POST",
  custom: "POST",
};

const providerAuthHeader: Record<string, string> = {
  openai: "Authorization",
  anthropic: "x-api-key",
  google: "",
  groq: "Authorization",
  openrouter: "Authorization",
  custom: "Authorization",
};
const workerMsiVersion = "1.26.80";
const workerMsiFileName = `CogniMailWorkerSetup-v${workerMsiVersion}.msi`;

const newId = () => `grp_${Math.random().toString(36).slice(2, 9)}`;

const normalizeSender = (value: string) => value.trim().toLowerCase();
const isValidSenderEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const toLocalDayStartIso = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map((item) => Number(item));
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0).toISOString();
};
const toLocalDayEndIso = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map((item) => Number(item));
  return new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999).toISOString();
};
const isoToLocalDateInput = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const mappingToGroups = (mapping: Record<string, string[]>): TagGroup[] =>
  Object.entries(mapping ?? {}).map(([name, senders]) => ({
    id: newId(),
    name,
    senders: [...new Set((senders ?? []).map(normalizeSender).filter(Boolean))],
  }));

const groupsToMapping = (groups: TagGroup[]) =>
  Object.fromEntries(
    groups
      .map((group) => [group.name.trim(), [...new Set(group.senders.map(normalizeSender).filter(Boolean))]])
      .filter(([name, senders]) => Boolean(name) && (senders as string[]).length > 0),
  ) as Record<string, string[]>;

export function SettingsPage({
  config,
  currentUserEmail,
  onSave,
  onTestImap,
  senderSuggestions,
  localAgentStatus,
  localAgentHealth,
  localAgentBusy,
  onCheckLocalAgent,
  onCancelLocalAgent,
  onConfigureLocalAgent,
  billingProfile,
  onSetPlan,
  onManualTopup,
  onConnectOpenAIOAuth,
}: Props) {
  const [draft, setDraft] = useState<UserConfig>(config);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState("");
  const [section, setSection] = useState<"imap" | "fetch" | "fetchEmail" | "ai">("imap");
  const [agentPassword, setAgentPassword] = useState("");
  const [agentInterval, setAgentInterval] = useState(15);
  const [agentLimit, setAgentLimit] = useState(5);
  const [topupAmount, setTopupAmount] = useState("5");
  const [topupNote, setTopupNote] = useState("Nạp tay test");
  const [billingBusy, setBillingBusy] = useState(false);

  useEffect(() => {
    if (!localAgentHealth) return;
    const nextInterval = Math.max(1, Math.min(120, Number(localAgentHealth.intervalMinutes ?? 15)));
    const nextLimit = Math.max(1, Math.min(100, Number(localAgentHealth.fetchLimit ?? 5)));
    setAgentInterval(nextInterval);
    setAgentLimit(nextLimit);
  }, [localAgentHealth?.intervalMinutes, localAgentHealth?.fetchLimit]);

  const [senderDirectory, setSenderDirectory] = useState<string[]>(
    [...new Set((config.ai.senderDirectory ?? []).map(normalizeSender).filter(Boolean))],
  );
  const [newSender, setNewSender] = useState("");

  const [tagGroups, setTagGroups] = useState<TagGroup[]>(mappingToGroups(config.ai.tagMapping ?? {}));
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupSenders, setNewGroupSenders] = useState<string[]>([]);

  const actualSuggestions = useMemo(
    () => [...new Set(senderSuggestions.map(normalizeSender).filter(Boolean))],
    [senderSuggestions],
  );

  const allSenderOptions = useMemo(
    () => [...new Set([...senderDirectory, ...actualSuggestions])].sort(),
    [senderDirectory, actualSuggestions],
  );

  const updateImap = <K extends keyof UserConfig["imap"]>(key: K, value: UserConfig["imap"][K]) => {
    setDraft((prev) => ({ ...prev, imap: { ...prev.imap, [key]: value }, updatedAt: new Date().toISOString() }));
  };

  const updateAi = <K extends keyof UserConfig["ai"]>(key: K, value: UserConfig["ai"][K]) => {
    setDraft((prev) => ({ ...prev, ai: { ...prev.ai, [key]: value }, updatedAt: new Date().toISOString() }));
  };

  const updateOpenAIOAuth = (patch: Partial<NonNullable<UserConfig["ai"]["openaiOAuth"]>>) => {
    const current = draft.ai.openaiOAuth ?? { enabled: false, updatedAt: new Date().toISOString() };
    updateAi("openaiOAuth", {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  };

  const updateFilter = <K extends keyof NonNullable<UserConfig["defaultFilters"]>>(
    key: K,
    value: NonNullable<UserConfig["defaultFilters"]>[K],
  ) => {
    setDraft((prev) => ({
      ...prev,
      defaultFilters: { ...(prev.defaultFilters ?? {}), [key]: value },
      updatedAt: new Date().toISOString(),
    }));
  };

  const selectedDefaultSenders =
    draft.defaultFilters?.sender
      ?.split(",")
      .map(normalizeSender)
      .filter(Boolean) ?? [];

  const selectedDefaultTags = draft.defaultFilters?.tags ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-semibold text-slate-900">Cài đặt</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              if (!onTestImap) return;
              setTesting(true);
              setStatus("");
              try {
                const result = await onTestImap(draft.imap);
                setStatus(result.ok ? "Kết nối IMAP thành công" : `Kết nối IMAP thất bại: ${result.error ?? "Không rõ"}`);
              } finally {
                setTesting(false);
              }
            }}
          >
            {testing ? "Đang test..." : "Test kết nối"}
          </Button>
          <Button
            onClick={async () => {
              setSaving(true);
              setStatus("");
              try {
                const cleanedDirectory = [...new Set(senderDirectory.map(normalizeSender).filter(isValidSenderEmail))].sort();
                const nextTagMapping = groupsToMapping(tagGroups);

                await onSave({
                  ...draft,
                  ai: {
                    ...draft.ai,
                    tagMapping: nextTagMapping,
                    senderDirectory: cleanedDirectory,
                  },
                  defaultFilters: {
                    ...(draft.defaultFilters ?? {}),
                    sender:
                      selectedDefaultSenders.length > 0
                        ? [...new Set(selectedDefaultSenders)].join(",")
                        : undefined,
                    tags: selectedDefaultTags.length > 0 ? [...new Set(selectedDefaultTags)] : undefined,
                  },
                });
                setStatus("Đã lưu cài đặt");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </div>

      {status ? <p className="text-sm text-slate-600">{status}</p> : null}

      <Segmented
        value={section}
        onChange={setSection}
        options={[
          { value: "imap", label: "IMAP" },
          { value: "fetch", label: "Bộ lọc fetch" },
          { value: "fetchEmail", label: "Fetch Email" },
          { value: "ai", label: "AI Config" },
        ]}
      />

      {section === "imap" ? (
        <Card>
          <CardHeader>
            <CardTitle>Cấu hình IMAP</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <Input value={draft.imap.host} onChange={(e) => updateImap("host", e.target.value)} placeholder="Host" />
            <Input value={String(draft.imap.port)} onChange={(e) => updateImap("port", Number(e.target.value))} placeholder="Port" />
            <Input value={draft.imap.username} onChange={(e) => updateImap("username", e.target.value)} placeholder="Username" />
            <Input type="password" value={draft.imap.password ?? ""} onChange={(e) => updateImap("password", e.target.value)} placeholder="Password" />
            <Input value={draft.imap.mailbox ?? "INBOX"} onChange={(e) => updateImap("mailbox", e.target.value)} placeholder="Mailbox" />
            <Select value={draft.imap.secure ? "true" : "false"} onChange={(e) => updateImap("secure", e.target.value === "true")}>
              <option value="true">Bảo mật SSL/TLS</option>
              <option value="false">Không SSL</option>
            </Select>
          </CardContent>
        </Card>
      ) : null}

      {section === "fetch" ? (
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Agent cục bộ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-600">
                Dùng worker local trên chính máy này để đồng bộ IMAP trực tiếp, không qua Vercel.
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                <Input value={currentUserEmail ?? ""} disabled placeholder="Email đăng nhập frontend" />
                <Input
                  type="password"
                  value={agentPassword}
                  onChange={(e) => setAgentPassword(e.target.value)}
                  placeholder="Mật khẩu đăng nhập frontend"
                />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-600">Chu kỳ tự động</p>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={String(agentInterval)}
                    onChange={(e) => setAgentInterval(Number(e.target.value) || 15)}
                    placeholder="15 (phút/lần)"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-600">Số email mỗi lần chạy</p>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={String(agentLimit)}
                    onChange={(e) => setAgentLimit(Number(e.target.value) || 5)}
                    placeholder="5 (email/lần)"
                  />
                </div>
              </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <Button variant="secondary" onClick={() => onCheckLocalAgent?.()} disabled={!onCheckLocalAgent || localAgentBusy}>
                    Kiểm tra Agent
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => onCancelLocalAgent?.()}
                    disabled={!onCancelLocalAgent}
                  >
                    Dừng phiên fetch
                  </Button>
                  <Button
                    className="md:col-span-1"
                    onClick={async () => {
                    if (!onConfigureLocalAgent || !currentUserEmail) return;
                    await onConfigureLocalAgent({
                      email: currentUserEmail,
                      password: agentPassword,
                      intervalMinutes: agentInterval,
                      limit: agentLimit,
                    });
                  }}
                  disabled={!onConfigureLocalAgent || !currentUserEmail || !agentPassword || localAgentBusy}
                >
                  Lấy Email
                </Button>
              </div>
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {localAgentStatus ??
                  "Chưa kiểm tra agent. Hãy mở ứng dụng CogniMail Worker từ Desktop hoặc Start Menu, rồi bấm Kết nối Agent local."}
              </p>
              {localAgentHealth ? (
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
                  <p>Trạng thái: {localAgentHealth.stage ?? "không rõ"}</p>
                  <p>Phiên bản: {localAgentHealth.version ?? "không rõ"}</p>
                  <p>Kết nối: {localAgentHealth.authenticated ? "đã xác thực" : "chưa xác thực"}</p>
                  <p>Đang chạy: {localAgentHealth.syncing ? "có" : "không"}</p>
                  <p>Chu kỳ: {localAgentHealth.intervalMinutes} phút</p>
                  <p>Giới hạn: {localAgentHealth.fetchLimit} email/lần</p>
                  {localAgentHealth.lastRunAt ? <p>Lần chạy gần nhất: {new Date(localAgentHealth.lastRunAt).toLocaleString()}</p> : null}
                  {localAgentHealth.lastResult ? (
                    <p>Fetch gần nhất: fetched={localAgentHealth.lastResult.fetched ?? 0}, saved={localAgentHealth.lastResult.saved ?? 0}</p>
                  ) : null}
                  {localAgentHealth.lastError ? <p className="text-rose-600">Lỗi gần nhất: {localAgentHealth.lastError}</p> : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Điều kiện fetch mặc định</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <Input
                type="date"
                value={isoToLocalDateInput(draft.defaultFilters?.dateFrom)}
                onChange={(e) => updateFilter("dateFrom", e.target.value ? toLocalDayStartIso(e.target.value) : undefined)}
              />
              <Input
                type="date"
                value={isoToLocalDateInput(draft.defaultFilters?.dateTo)}
                onChange={(e) => updateFilter("dateTo", e.target.value ? toLocalDayEndIso(e.target.value) : undefined)}
              />
              <Input
                type="number"
                min={1}
                max={100}
                value={String(draft.defaultFilters?.limit ?? 20)}
                onChange={(e) => updateFilter("limit", Number(e.target.value))}
                placeholder="Số lượng mặc định"
              />
              <Select value={draft.defaultFilters?.status ?? "all"} onChange={(e) => updateFilter("status", e.target.value as "all" | "read" | "unread")}>
                <option value="all">Tất cả</option>
                <option value="read">Đã đọc</option>
                <option value="unread">Chưa đọc</option>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Danh sách người gửi (dùng cho filter)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={newSender}
                  onChange={(e) => setNewSender(e.target.value)}
                  placeholder="Nhập email người gửi, ví dụ: heather@abc.com"
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    const value = normalizeSender(newSender);
                    if (!value) return;
                    if (!isValidSenderEmail(value)) {
                      setStatus("Email người gửi không hợp lệ. Hãy kiểm tra lại.");
                      return;
                    }
                    setSenderDirectory((prev) => [...new Set([...prev, value])]);
                    setNewSender("");
                  }}
                >
                  Thêm
                </Button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-700">Gợi ý từ dữ liệu thực tế</p>
                <div className="flex flex-wrap gap-1">
                  {actualSuggestions.length === 0 ? <span className="text-xs text-slate-500">Chưa có gợi ý thực tế</span> : null}
                  {actualSuggestions.map((sender) => (
                    <button
                      key={sender}
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                      onClick={() => setSenderDirectory((prev) => [...new Set([...prev, sender])])}
                    >
                      + {sender}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-700">Danh sách đã lưu</p>
                <div className="flex flex-wrap gap-1">
                  {senderDirectory.length === 0 ? <span className="text-xs text-slate-500">Chưa có người gửi nào.</span> : null}
                  {senderDirectory.map((sender) => (
                    <button
                      key={sender}
                      type="button"
                      className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-700"
                      onClick={() => setSenderDirectory((prev) => prev.filter((value) => value !== sender))}
                      title="Bấm để xóa"
                    >
                      {sender} ×
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Gắn tag nhóm người gửi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Tên nhóm mới (ví dụ: Khách hàng A)" />
                <Button
                  variant="secondary"
                  onClick={() => {
                    const name = newGroupName.trim();
                    if (!name) return;
                    setTagGroups((prev) => [...prev, { id: newId(), name, senders: [...new Set(newGroupSenders)] }]);
                    setNewGroupName("");
                    setNewGroupSenders([]);
                  }}
                >
                  Tạo nhóm
                </Button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-700">Chọn người gửi cho nhóm mới</p>
                <div className="flex flex-wrap gap-1">
                  {allSenderOptions.length === 0 ? <span className="text-xs text-slate-500">Chưa có dữ liệu người gửi thực tế.</span> : null}
                  {allSenderOptions.map((sender) => {
                    const selected = newGroupSenders.includes(sender);
                    return (
                      <button
                        key={`newgrp-${sender}`}
                        type="button"
                        className={`rounded-full border px-2 py-1 text-xs ${
                          selected ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-700"
                        }`}
                        onClick={() =>
                          setNewGroupSenders((prev) =>
                            selected ? prev.filter((item) => item !== sender) : [...new Set([...prev, sender])],
                          )
                        }
                      >
                        {selected ? "✓ " : "+ "}
                        {sender}
                      </button>
                    );
                  })}
                </div>
              </div>

              {tagGroups.map((group) => (
                <div key={group.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Input
                      value={group.name}
                      onChange={(e) =>
                        setTagGroups((prev) => prev.map((item) => (item.id === group.id ? { ...item, name: e.target.value } : item)))
                      }
                      placeholder="Tên nhóm"
                    />
                    <Button variant="destructive" size="sm" onClick={() => setTagGroups((prev) => prev.filter((item) => item.id !== group.id))}>
                      Xóa
                    </Button>
                  </div>

                  <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <p className="mb-2 text-xs font-semibold text-slate-700">Gợi ý người gửi thực tế (bấm để thêm vào nhóm)</p>
                    <div className="flex flex-wrap gap-1">
                      {actualSuggestions.length === 0 ? <span className="text-xs text-slate-500">Chưa có gợi ý thực tế</span> : null}
                      {actualSuggestions.map((sender) => {
                        const inGroup = group.senders.includes(sender);
                        return (
                          <button
                            key={`${group.id}-${sender}`}
                            type="button"
                            className={`rounded-full border px-2 py-1 text-xs ${
                              inGroup ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-700"
                            }`}
                            onClick={() =>
                              setTagGroups((prev) =>
                                prev.map((item) =>
                                  item.id === group.id
                                    ? {
                                        ...item,
                                        senders: inGroup
                                          ? item.senders.filter((value) => value !== sender)
                                          : [...new Set([...item.senders, sender])],
                                      }
                                    : item,
                                ),
                              )
                            }
                          >
                            {inGroup ? "✓ " : "+ "}
                            {sender}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mb-2 max-h-44 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
                    {allSenderOptions.length === 0 ? (
                      <p className="text-xs text-slate-500">Chưa có dữ liệu người gửi thực tế để chọn.</p>
                    ) : null}
                    <div className="space-y-1">
                      {allSenderOptions.map((sender) => {
                        const checked = group.senders.includes(sender);
                        return (
                          <label key={sender} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-white">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setTagGroups((prev) =>
                                  prev.map((item) =>
                                    item.id === group.id
                                      ? {
                                          ...item,
                                          senders: checked
                                            ? item.senders.filter((value) => value !== sender)
                                            : [...new Set([...item.senders, sender])],
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                            <span className="truncate">{sender}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {group.senders.length === 0 ? <span className="text-xs text-slate-500">Chưa có người gửi trong nhóm.</span> : null}
                    {group.senders.map((sender) => (
                      <button
                        key={sender}
                        type="button"
                        className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-700"
                        onClick={() =>
                          setTagGroups((prev) =>
                            prev.map((item) =>
                              item.id === group.id ? { ...item, senders: item.senders.filter((value) => value !== sender) } : item,
                            ),
                          )
                        }
                      >
                        {sender} ×
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {tagGroups.length === 0 ? <p className="text-sm text-slate-500">Chưa có nhóm tag nào.</p> : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {section === "fetchEmail" ? (
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Tải Worker local</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-600">
                Worker local giúp lấy email IMAP trực tiếp từ máy người dùng và đồng bộ vào Firestore, không đi qua Vercel.
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/downloads/${workerMsiFileName}`}
                  download
                  className="inline-flex h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Tải bản cài đặt (.msi) - v{workerMsiVersion}
                </a>
              </div>
              <p className="text-xs text-slate-500">
                Nếu link tải chưa có file, hãy nhắn quản trị viên cập nhật gói worker mới vào thư mục deploy frontend.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Hướng dẫn nhanh cho người dùng</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-700">
              <p>1. Khuyến nghị: tải và chạy file <code>.msi</code> để cài đặt tự động.</p>
              <p>2. Quay lại web, vào <b>Cài đặt - Bộ lọc fetch - Agent cục bộ</b>.</p>
              <p>3. Nhập mật khẩu tài khoản đang đăng nhập, chọn chu kỳ/giới hạn, bấm <b>Lấy Email</b>.</p>
              <p>4. Nếu thành công, email sẽ lên Firestore và hiện trong Hộp thư. Từ các lần sau worker sẽ tự chạy theo chu kỳ đã đặt.</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {section === "ai" ? (
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Gói & Credit (Test)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <p>Gói hiện tại: <b>{billingProfile.plan === "pro" ? "Pro" : "Free"}</b></p>
                <p>Số dư credit: <b>{billingProfile.creditBalance.toFixed(4)} {billingProfile.currency}</b></p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={billingProfile.plan === "free" ? "default" : "secondary"}
                  disabled={billingBusy}
                  onClick={async () => {
                    setBillingBusy(true);
                    try {
                      await onSetPlan("free");
                      setStatus("Đã chuyển gói Free");
                    } catch (error) {
                      setStatus(`Chuyển gói thất bại: ${(error as Error).message}`);
                    } finally {
                      setBillingBusy(false);
                    }
                  }}
                >
                  Chuyển Free
                </Button>
                <Button
                  variant={billingProfile.plan === "pro" ? "default" : "secondary"}
                  disabled={billingBusy}
                  onClick={async () => {
                    setBillingBusy(true);
                    try {
                      await onSetPlan("pro");
                      setStatus("Đã chuyển gói Pro");
                    } catch (error) {
                      setStatus(`Chuyển gói thất bại: ${(error as Error).message}`);
                    } finally {
                      setBillingBusy(false);
                    }
                  }}
                >
                  Chuyển Pro
                </Button>
              </div>
              <div className="grid gap-2 md:grid-cols-[140px_minmax(0,1fr)_auto]">
                <Input
                  type="number"
                  min={0.0001}
                  step="0.1"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  placeholder="Số credit"
                />
                <Input value={topupNote} onChange={(e) => setTopupNote(e.target.value)} placeholder="Ghi chú nạp tay" />
                <Button
                  disabled={billingBusy}
                  onClick={async () => {
                    const amount = Number(topupAmount);
                    if (!Number.isFinite(amount) || amount <= 0) {
                      setStatus("Số credit nạp không hợp lệ");
                      return;
                    }
                    setBillingBusy(true);
                    try {
                      await onManualTopup(amount, topupNote || "Nạp tay test");
                      setStatus(`Đã nạp tay +${amount}`);
                    } catch (error) {
                      setStatus(`Nạp tay thất bại: ${(error as Error).message}`);
                    } finally {
                      setBillingBusy(false);
                    }
                  }}
                >
                  Nạp tay
                </Button>
              </div>
              <p className="text-xs text-slate-500">Dùng để test nhanh credit theo token. Sẽ thay bằng cổng thanh toán sau.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI Config</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
              ChatGPT OAuth (qua worker local): dùng tài khoản ChatGPT của chính bạn, không qua backend cloud.
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="mb-2 text-sm font-semibold text-slate-800">OpenAI OAuth (Pro)</p>
              {billingProfile.plan !== "pro" ? (
                <p className="mb-2 text-xs text-amber-700">Bạn đang ở gói Free. Hãy chuyển Pro để dùng OAuth ChatGPT.</p>
              ) : null}
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  disabled={billingProfile.plan !== "pro" || !onConnectOpenAIOAuth}
                  onClick={async () => {
                    if (!onConnectOpenAIOAuth) return;
                    try {
                      const result = await onConnectOpenAIOAuth();
                      updateOpenAIOAuth({
                        enabled: true,
                        accessToken: result.accessToken,
                        refreshToken: result.refreshToken,
                        expiresAt: result.expiresAt,
                        accountEmail: result.accountEmail ?? draft.ai.openaiOAuth?.accountEmail,
                        redirectUri: result.redirectUri ?? draft.ai.openaiOAuth?.redirectUri,
                      });
                      setStatus("Đăng nhập ChatGPT OAuth thành công. Hãy bấm Lưu.");
                    } catch (error) {
                      setStatus(`Đăng nhập ChatGPT OAuth thất bại: ${(error as Error).message}`);
                    }
                  }}
                >
                  Đăng nhập ChatGPT
                </Button>
                {draft.ai.openaiOAuth?.enabled && draft.ai.openaiOAuth?.accessToken ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                    ✓ Đã kết nối
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
                    Chưa kết nối
                  </span>
                )}
              </div>
              {draft.ai.openaiOAuth?.accountEmail ? (
                <p className="mt-2 text-xs text-slate-600">Tài khoản: {draft.ai.openaiOAuth.accountEmail}</p>
              ) : null}
            </div>
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
              API key chạy phía client. Hãy dùng key giới hạn quyền và quota.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <Select
                value={draft.ai.provider ?? "custom"}
                onChange={(e) => {
                  const provider = e.target.value as UserConfig["ai"]["provider"];
                  updateAi("provider", provider);
                  updateAi("method", providerMethod[provider ?? "custom"]);
                  updateAi("authHeaderName", providerAuthHeader[provider ?? "custom"]);
                  updateAi("endpointUrl", providerDefaults[provider ?? "custom"] ?? "");
                }}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google Gemini</option>
                <option value="groq">Groq</option>
                <option value="openrouter">OpenRouter</option>
                <option value="custom">Custom</option>
              </Select>
              {draft.ai.provider === "openai" ? (
                <Select value={draft.ai.model ?? "gpt-5.4-mini"} onChange={(e) => updateAi("model", e.target.value)}>
                  <option value="gpt-5.4">gpt-5.4</option>
                  <option value="gpt-5.4-mini">gpt-5.4-mini</option>
                  <option value="gpt-5.3-chat">gpt-5.3-chat</option>
                  <option value="gpt-5.3">gpt-5.3</option>
                  <option value="gpt-5.3-codex">gpt-5.3-codex</option>
                  <option value="gpt-5.2-codex">gpt-5.2-codex</option>
                  <option value="gpt-5.2">gpt-5.2</option>
                  <option value="gpt-5.1-codex-max">gpt-5.1-codex-max</option>
                  <option value="gpt-5.1-codex-mini">gpt-5.1-codex-mini</option>
                </Select>
              ) : (
                <Input value={draft.ai.model ?? ""} onChange={(e) => updateAi("model", e.target.value)} placeholder="Model (ví dụ: gpt-4.1-mini)" />
              )}
              {draft.ai.provider === "openai" ? (
                <Input
                  value={
                    draft.ai.openaiOAuth?.enabled
                      ? "http://127.0.0.1:41731/ai/openai/responses (worker local)"
                      : "https://api.openai.com/v1/responses"
                  }
                  disabled
                />
              ) : (
                <Input value={draft.ai.endpointUrl} onChange={(e) => updateAi("endpointUrl", e.target.value)} placeholder="Endpoint URL" />
              )}
              {draft.ai.provider === "openai" && draft.ai.openaiOAuth?.enabled && draft.ai.openaiOAuth?.accessToken ? (
                <Input value="Đã dùng token OAuth từ worker local" disabled />
              ) : (
                <Input value={draft.ai.apiKey ?? ""} onChange={(e) => updateAi("apiKey", e.target.value)} placeholder="API key" />
              )}
              {draft.ai.provider === "custom" ? (
                <>
                  <Input value={draft.ai.authHeaderName ?? "Authorization"} onChange={(e) => updateAi("authHeaderName", e.target.value)} placeholder="Tên header auth" />
                  <Select value={draft.ai.method ?? "POST"} onChange={(e) => updateAi("method", e.target.value as "POST" | "PUT")}>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                  </Select>
                </>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 md:col-span-2">
                  Provider này dùng mặc định: Method {providerMethod[draft.ai.provider ?? "custom"]}, header auth {providerAuthHeader[draft.ai.provider ?? "custom"] || "(không cần)"}.
                </div>
              )}
            </div>

            <Textarea
              rows={5}
              value={draft.ai.soulPrompt ?? ""}
              placeholder="Soul Prompt: định nghĩa vai trò, tinh thần và cách AI ra quyết định công việc"
              onChange={(e) => updateAi("soulPrompt", e.target.value)}
            />

            <Textarea
              rows={6}
              value={draft.ai.recommendedPrompt ?? ""}
              placeholder="Prompt khuyến nghị (ưu tiên dùng)"
              onChange={(e) => updateAi("recommendedPrompt", e.target.value)}
            />

            <Textarea
              rows={6}
              value={draft.ai.customPrompt ?? ""}
              placeholder="Prompt custom của bạn"
              onChange={(e) => updateAi("customPrompt", e.target.value)}
            />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
