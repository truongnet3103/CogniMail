"use client";

import { useMemo, useState } from "react";
import type { Email } from "@/lib/types";
import type { EmailGroup } from "@/lib/email-utils";
import { normalizeSubject, toReplyTitle } from "@/lib/email-utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  emails: Email[];
  groups: EmailGroup[];
  mode: "raw" | "grouped";
  currentUserEmail?: string;
  selectedId?: string;
  selectedIds: string[];
  allVisibleSelected: boolean;
  onToggleSelectAllVisible: () => void;
  onSelect: (id: string) => void;
  onToggleSelect: (ids: string[]) => void;
  onQuickDelete: (ids: string[]) => Promise<void>;
};

export function EmailList({
  emails,
  groups,
  mode,
  currentUserEmail,
  selectedId,
  selectedIds,
  allVisibleSelected,
  onToggleSelectAllVisible,
  onSelect,
  onToggleSelect,
  onQuickDelete,
}: Props) {
  const [expandedThread, setExpandedThread] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const currentUserEmailLower = (currentUserEmail ?? "").trim().toLowerCase();
  const preview = (text?: string) => (text ?? "").replace(/\s+/g, " ").trim().slice(0, 180);

  const items = useMemo(() => {
    if (mode === "raw") {
      return emails.map((email) => ({
        id: email.id,
        subject: email.subject,
        senderName: email.from.name?.trim() || email.from.address,
        senderAddress: email.from.address,
        snippet: preview(email.textBody),
        time: new Date(email.date).toLocaleString(),
        count: 1,
        hasAttachment: email.hasAttachment,
        hasAiResult: email.hasAiResult === true,
        isAi: email.isAi === true,
        isDirectToUser:
          currentUserEmailLower.length > 0 &&
          email.to.some((toItem) => toItem.address.trim().toLowerCase() === currentUserEmailLower),
        emails: [email],
      }));
    }

    return groups.map((group) => {
      const latest = group.emails[group.emails.length - 1];
      return {
        id: latest?.id ?? group.subjectKey,
        subject: toReplyTitle(group.title),
        senderName: latest?.from.name?.trim() || latest?.from.address || "Không rõ",
        senderAddress: latest?.from.address ?? "Không rõ",
        snippet: preview(latest?.textBody),
        time: new Date(group.latestDate).toLocaleString(),
        count: group.emails.length,
        hasAttachment: group.emails.some((email) => email.hasAttachment),
        hasAiResult: group.emails.some((email) => email.hasAiResult),
        isAi: latest?.isAi === true,
        isDirectToUser:
          currentUserEmailLower.length > 0 &&
          group.emails.some((email) => email.to.some((toItem) => toItem.address.trim().toLowerCase() === currentUserEmailLower)),
        emails: group.emails,
      };
    });
  }, [emails, groups, mode, currentUserEmailLower]);

  return (
    <div className="h-[calc(100dvh-170px)] overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:h-[calc(100vh-140px)]">
      <div className="mb-2 flex items-center justify-end">
        <Button size="sm" variant="secondary" onClick={onToggleSelectAllVisible}>
          {allVisibleSelected ? "Bỏ chọn tất cả email đang hiển thị" : "Chọn tất cả email đang hiển thị"}
        </Button>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const isActive = selectedId === item.id;
          const isExpanded = expandedThread === item.id;
          const itemIds = item.emails.map((email) => email.id);
          const checked = itemIds.every((id) => selectedSet.has(id));

          return (
            <Card
              key={item.id}
              className={cn(
                "cursor-pointer border transition-all hover:border-sky-300 hover:shadow-md",
                isActive ? "border-sky-500 bg-sky-50 shadow ring-1 ring-sky-200" : "",
                item.isDirectToUser ? "border-emerald-300 bg-emerald-50/60 shadow-sm" : "border-slate-200 bg-white",
              )}
              onClick={() => {
                onSelect(item.id);
                if (mode === "grouped") setExpandedThread(isExpanded ? null : item.id);
              }}
            >
              <div className="p-4">
                <div className="mb-1 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <input
                      aria-label="Chọn email"
                      type="checkbox"
                      checked={checked}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        event.stopPropagation();
                        onToggleSelect(itemIds);
                      }}
                    />
                    <p className="line-clamp-1 text-sm font-semibold text-slate-900">{item.subject}</p>
                    {item.hasAttachment ? (
                      <span title="Có đính kèm" className="inline-flex h-4 w-4 items-center justify-center">
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-slate-500">
                          <path d="M16.5 6.75a4.25 4.25 0 0 0-8.5 0v8.9a2.85 2.85 0 1 0 5.7 0V8.75h-1.5v6.9a1.35 1.35 0 1 1-2.7 0v-8.9a2.75 2.75 0 1 1 5.5 0v9.4a4.45 4.45 0 1 1-8.9 0v-8.4h-1.5v8.4a5.95 5.95 0 1 0 11.9 0v-9.4Z" />
                        </svg>
                      </span>
                    ) : null}
                    {item.hasAiResult ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">AI</span> : null}
                    {item.isAi ? <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">AI MAIL</span> : null}
                    {item.isDirectToUser ? (
                      <span
                        title="Gửi trực tiếp cho bạn"
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
                      >
                        <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current">
                          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 3a7 7 0 0 1 6.7 5H16a4 4 0 0 0-8 0H5.3A7 7 0 0 1 12 5Zm0 14a7 7 0 0 1-6.7-5H8a4 4 0 0 0 8 0h2.7A7 7 0 0 1 12 19Z" />
                        </svg>
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{item.time}</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={deletingId === item.id}
                      onClick={async (event) => {
                        event.stopPropagation();
                        setDeletingId(item.id);
                        try {
                          await onQuickDelete(itemIds);
                        } finally {
                          setDeletingId(null);
                        }
                      }}
                    >
                      {deletingId === item.id ? "..." : "Xóa"}
                    </Button>
                  </div>
                </div>
                <p className="text-sm font-extrabold text-slate-900">{item.senderName}</p>
                <p className="text-xs text-slate-500">{item.senderAddress}</p>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.snippet}</p>
                {item.count > 1 ? <Badge className="mt-3">{item.count} thư</Badge> : null}
                {mode === "grouped" && isExpanded ? (
                  <div className="mt-3 space-y-1 rounded-xl bg-slate-50 p-2">
                    {item.emails
                      .slice()
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((email) => (
                        <button
                          key={email.id}
                          className={cn(
                            "w-full rounded-lg px-2 py-1 text-left text-xs hover:bg-slate-200/70",
                            selectedId === email.id ? "bg-slate-200" : "",
                          )}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelect(email.id);
                          }}
                        >
                          {email.id === item.emails[0]?.id ? normalizeSubject(email.subject) : toReplyTitle(email.subject)}
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
