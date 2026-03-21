"use client";

import { useEffect, useMemo, useState } from "react";
import type { AiTokenUsage, BillingProfile, DisplayEmailFilter, Email, Task, UserConfig } from "@/lib/types";
import { groupEmails, normalizeSubject } from "@/lib/email-utils";
import { EmailList } from "./EmailList";
import { EmailDetail } from "./EmailDetail";
import { AIPanel } from "./AIPanel";
import { OutputPanel } from "./OutputPanel";
import { Segmented } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";

type Props = {
  emails: Email[];
  displayFilter: DisplayEmailFilter;
  config: UserConfig;
  billingProfile: BillingProfile;
  currentUserEmail?: string;
  output: string;
  error: string;
  focusEmailId?: string;
  onAiOutput: (output: string, tasks: Task[], sourceEmails: Email[], usage?: AiTokenUsage) => Promise<void>;
  onAiError: (error: string) => void;
  onDeleteEmails: (ids: string[]) => Promise<void>;
  onSaveEmailBody: (emailId: string, textBody: string) => Promise<void>;
};

export function EmailPage({
  emails,
  displayFilter,
  config,
  billingProfile,
  currentUserEmail,
  output,
  error,
  focusEmailId,
  onAiOutput,
  onAiError,
  onDeleteEmails,
  onSaveEmailBody,
}: Props) {
  const [mode, setMode] = useState<"raw" | "grouped">("raw");
  const [sourceMode, setSourceMode] = useState<"goc" | "ai">("goc");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const displayEmails = useMemo(() => {
    const sourceFiltered = emails.filter((email) => (sourceMode === "ai" ? email.isAi : !email.isAi));
    const currentUserLower = currentUserEmail?.trim().toLowerCase() ?? "";
    const isDirectToCurrentUser = (email: Email) =>
      currentUserLower.length > 0 &&
      email.to.some((toItem) => toItem.address.trim().toLowerCase() === currentUserLower);

    const selectedSenders = new Set(displayFilter.senders.map((item) => item.trim().toLowerCase()));
    const groupSenders = new Set(
      displayFilter.groups.flatMap((group) => (config.ai.tagMapping[group] ?? []).map((item) => item.trim().toLowerCase())),
    );
    const hasSenderFilter = selectedSenders.size > 0 || groupSenders.size > 0;
    const directConversationKeys =
      displayFilter.directOnly && mode === "grouped" && currentUserLower
        ? new Set(
            sourceFiltered
              .filter((email) => isDirectToCurrentUser(email))
              .map((email) => normalizeSubject(email.subject).toLowerCase()),
          )
        : undefined;
    const fromDate = displayFilter.dateFrom ? new Date(displayFilter.dateFrom).getTime() : undefined;
    const toDate = displayFilter.dateTo ? new Date(displayFilter.dateTo).getTime() : undefined;

    return sourceFiltered.filter((email) => {
      if (displayFilter.directOnly) {
        if (mode === "raw") {
          if (!isDirectToCurrentUser(email)) return false;
        } else {
          const subjectKey = normalizeSubject(email.subject).toLowerCase();
          if (!directConversationKeys?.has(subjectKey)) return false;
        }
      }

      const emailTime = new Date(email.date).getTime();
      if (fromDate !== undefined && emailTime < fromDate) return false;
      if (toDate !== undefined && emailTime > toDate) return false;
      if (!hasSenderFilter) return true;

      const sender = email.from.address.trim().toLowerCase();
      return selectedSenders.has(sender) || groupSenders.has(sender);
    });
  }, [emails, sourceMode, displayFilter, config.ai.tagMapping, currentUserEmail, mode]);
  const lastTwoDaysEmails = useMemo(() => {
    const now = new Date();
    const startYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0).getTime();
    const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    return displayEmails.filter((email) => {
      const emailTime = new Date(email.date).getTime();
      return emailTime >= startYesterday && emailTime <= endToday;
    });
  }, [displayEmails]);
  const groups = useMemo(() => groupEmails(displayEmails), [displayEmails]);
  const allVisibleIds = useMemo(() => [...new Set(displayEmails.map((email) => email.id))], [displayEmails]);
  const allVisibleSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.includes(id));
  const selected = displayEmails.find((item) => item.id === selectedId);
  const aiEmails =
    selectedIds.length > 0
      ? displayEmails.filter((email) => selectedIds.includes(email.id))
      : lastTwoDaysEmails.length > 0
        ? lastTwoDaysEmails
        : displayEmails.slice(0, 20);

  const openAiForCurrentDetail = () => {
    if (!selected) {
      setAiPanelOpen(true);
      return;
    }

    if (mode === "raw") {
      setSelectedIds([selected.id]);
      setAiPanelOpen(true);
      return;
    }

    const subjectKey = normalizeSubject(selected.subject).toLowerCase();
    const conversationIds = displayEmails
      .filter((item) => normalizeSubject(item.subject).toLowerCase() === subjectKey)
      .map((item) => item.id);

    setSelectedIds(conversationIds.length > 0 ? conversationIds : [selected.id]);
    setAiPanelOpen(true);
  };

  useEffect(() => {
    if (!focusEmailId) return;
    const foundInAll = emails.find((email) => email.id === focusEmailId);
    if (foundInAll) {
      setSourceMode(foundInAll.isAi ? "ai" : "goc");
    }
    const foundInDisplay = displayEmails.find((email) => email.id === focusEmailId);
    if (foundInDisplay) setSelectedId(foundInDisplay.id);
  }, [focusEmailId, emails, displayEmails]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Email</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={sourceMode}
            onChange={setSourceMode}
            options={[
              { value: "goc", label: "Chế độ gốc" },
              { value: "ai", label: "Chế độ AI" },
            ]}
          />
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "raw", label: "Thư gốc" },
              { value: "grouped", label: "Thư phản hồi" },
            ]}
          />
          <button
            type="button"
            aria-label="Mở trợ lý AI"
            onClick={() => setAiPanelOpen(true)}
            className="group inline-flex h-10 items-center gap-2 rounded-full border border-violet-300 bg-gradient-to-b from-violet-200 via-indigo-400 to-indigo-700 px-3 text-white shadow-[0_10px_24px_rgba(79,70,229,0.45)] transition hover:scale-[1.02]"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/30 shadow-inner">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                <path d="M12 2a1 1 0 0 1 1 1v1.1a5.9 5.9 0 0 1 4.8 5.8v5.1a3 3 0 0 1-3 3H9.2a3 3 0 0 1-3-3V9.9A5.9 5.9 0 0 1 11 4.1V3a1 1 0 0 1 1-1Zm-2.7 8.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm5.4 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4ZM9 18.4c.5 1.1 1.6 1.8 3 1.8s2.5-.7 3-1.8H9Z" />
              </svg>
            </span>
            <span className="text-xs font-semibold">AI</span>
          </button>
          <Button
            size="sm"
            variant="destructive"
            disabled={selectedIds.length === 0 || deleting}
            onClick={async () => {
              setDeleting(true);
              try {
                await onDeleteEmails(selectedIds);
                setSelectedIds([]);
                setSelectedId(undefined);
              } finally {
                setDeleting(false);
              }
            }}
          >
            {deleting ? "Đang xoá..." : `Xoá (${selectedIds.length})`}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 min-[1025px]:grid-cols-[380px_minmax(0,1fr)]">
        <EmailList
          emails={displayEmails}
          groups={groups}
          mode={mode}
          currentUserEmail={currentUserEmail}
          selectedId={selectedId}
          selectedIds={selectedIds}
          allVisibleSelected={allVisibleSelected}
          onToggleSelectAllVisible={() => setSelectedIds(allVisibleSelected ? [] : allVisibleIds)}
          onSelect={setSelectedId}
          onToggleSelect={(ids) => {
            setSelectedIds((prev) => {
              const set = new Set(prev);
              const allSelected = ids.every((id) => set.has(id));
              for (const id of ids) {
                if (allSelected) set.delete(id);
                else set.add(id);
              }
              return [...set];
            });
          }}
          onQuickDelete={async (ids) => {
            await onDeleteEmails(ids);
            setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
            setSelectedId((prev) => (prev && ids.includes(prev) ? undefined : prev));
          }}
        />

        <div className="hidden min-h-0 min-[1025px]:block">
          <EmailDetail
            mode={mode}
            emails={displayEmails}
            email={selected}
            onOpenAiPanel={openAiForCurrentDetail}
            onSaveEmailBody={onSaveEmailBody}
          />
        </div>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-30 bg-white min-[1025px]:hidden">
          <div className="flex items-center justify-between border-b border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-900">Chi tiết email</p>
            <Button variant="secondary" size="sm" onClick={() => setSelectedId(undefined)}>
              Đóng
            </Button>
          </div>
          <div className="h-[calc(100vh-58px)] min-h-0 overflow-hidden p-3">
            <EmailDetail
              mode={mode}
              emails={displayEmails}
              email={selected}
              onOpenAiPanel={openAiForCurrentDetail}
              onSaveEmailBody={onSaveEmailBody}
            />
          </div>
        </div>
      ) : null}

      {aiPanelOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/50 p-3">
          <div className="mx-auto flex h-full max-w-4xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Bảng tuỳ chỉnh prompt AI</h3>
                <p className="text-sm text-slate-500">Tóm tắt nhiều email / hội thoại đã chọn</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setAiPanelOpen(false)}>
                Đóng
              </Button>
            </div>
            <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
              <div className="min-h-0 overflow-auto rounded-xl border border-slate-200 p-3">
                {selectedIds.length === 0 ? (
                  <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Bạn chưa chọn email. AI sẽ mặc định xử lý email trong 2 ngày gần nhất (hôm qua + hôm nay), tách theo từng hội thoại để tránh lẫn ngữ cảnh.
                  </p>
                ) : null}
                <AIPanel
                  config={config}
                  billingProfile={billingProfile}
                  emails={aiEmails}
                  selectedIds={selectedIds}
                  currentUserEmail={currentUserEmail}
                  onOutput={async (nextOutput, parsedTasks, usage) => {
                    await onAiOutput(nextOutput, parsedTasks, aiEmails, usage);
                  }}
                  onError={onAiError}
                />
              </div>
              <div className="min-h-0 overflow-auto rounded-xl border border-slate-200 p-3">
                <OutputPanel output={output} error={error} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
