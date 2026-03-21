"use client";

import { useEffect, useState } from "react";
import type { Email } from "@/lib/types";
import { normalizeSubject, toReplyTitle } from "@/lib/email-utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = {
  mode: "raw" | "grouped";
  emails: Email[];
  email?: Email;
  onOpenAiPanel?: () => void;
  onSaveEmailBody?: (emailId: string, textBody: string) => Promise<void>;
};

const cleanEmailTextWithRegex = (value: string) => {
  const text = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const lines = text.split("\n");
  const signatureStart = lines.findIndex((line) => {
    const t = line.trim();
    return (
      /^thanks(\s|,|&|$)/i.test(t) ||
      /^best regards/i.test(t) ||
      /^kind regards/i.test(t) ||
      /^regards/i.test(t) ||
      /^trân trọng/i.test(t) ||
      /^sent from/i.test(t) ||
      /^on .+ wrote:$/i.test(t) ||
      /^from:\s/i.test(t) ||
      /^subject:\s/i.test(t) ||
      /^to:\s/i.test(t) ||
      /^\[cid:.*\]$/i.test(t)
    );
  });

  const mainLines = (signatureStart > 0 ? lines.slice(0, signatureStart) : lines)
    .map((line) => line.replace(/^\s*>+\s?/, ""))
    .filter((line) => !/^[-_]{2,}$/.test(line.trim()));

  return mainLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

function EmailBodyEditor({
  item,
  onSaveEmailBody,
}: {
  item: Email;
  onSaveEmailBody?: (emailId: string, textBody: string) => Promise<void>;
}) {
  const originalContent = item.textBody?.trim() || "";
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(originalContent);

  useEffect(() => {
    if (!editing) {
      setDraft(originalContent);
    }
  }, [originalContent, editing, item.id]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">{item.from.name?.trim() || item.from.address}</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const source = editing ? draft : originalContent;
              const url = `https://translate.google.com/?sl=auto&tl=vi&text=${encodeURIComponent(source)}&op=translate`;
              window.open(url, "_blank", "noopener,noreferrer");
            }}
          >
            Dịch bằng Google
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const source = editing ? draft : originalContent;
              const cleaned = cleanEmailTextWithRegex(source);
              setDraft(cleaned);
              setEditing(true);
            }}
          >
            Làm sạch regex
          </Button>
          {!editing ? (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Sửa nội dung
            </Button>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={() => { setDraft(originalContent); setEditing(false); }}>
                Hủy
              </Button>
              <Button
                size="sm"
                disabled={saving || !onSaveEmailBody}
                onClick={async () => {
                  if (!onSaveEmailBody) return;
                  setSaving(true);
                  try {
                    await onSaveEmailBody(item.id, draft.trim());
                    setEditing(false);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Đang lưu..." : "Lưu"}
              </Button>
            </>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500">{new Date(item.date).toLocaleString()}</p>
      {editing ? (
        <textarea
          className="h-52 w-full rounded-xl border border-slate-300 px-3 py-2 text-[15px] leading-7 text-slate-700 outline-none focus:border-slate-500"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : (
        <p className="whitespace-pre-wrap text-[15px] leading-7 text-slate-700">{originalContent || "(Không có nội dung)"}</p>
      )}
    </div>
  );
}

export function EmailDetail({ mode, emails, email, onOpenAiPanel, onSaveEmailBody }: Props) {
  if (!email) {
    return (
      <Card className="min-h-[320px] p-8 md:h-[calc(100vh-140px)]">
        <p className="text-sm text-slate-500">Chọn email để xem chi tiết.</p>
      </Card>
    );
  }

  const subjectKey = normalizeSubject(email.subject).toLowerCase();
  const groupedMessages = emails
    .filter((item) => normalizeSubject(item.subject).toLowerCase() === subjectKey)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <Card className="h-full min-h-0 overflow-y-auto overscroll-contain md:h-[calc(100vh-140px)]">
      <div className="space-y-5 p-6">
        <div>
          <h2 className="text-3xl font-semibold leading-tight text-slate-900">{email.subject}</h2>
          <p className="mt-2 text-sm text-slate-500">{mode === "grouped" ? "Hội thoại đã nhóm" : "Chi tiết email"}</p>
          {onOpenAiPanel ? (
            <button
              type="button"
              onClick={onOpenAiPanel}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-violet-300 bg-gradient-to-b from-violet-200 via-indigo-400 to-indigo-700 px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(79,70,229,0.45)] transition hover:scale-[1.02]"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/25 shadow-inner">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
                  <path d="M12 2a1 1 0 0 1 1 1v1.1a5.9 5.9 0 0 1 4.8 5.8v5.1a3 3 0 0 1-3 3H9.2a3 3 0 0 1-3-3V9.9A5.9 5.9 0 0 1 11 4.1V3a1 1 0 0 1 1-1Zm-2.7 8.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm5.4 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4ZM9 18.4c.5 1.1 1.6 1.8 3 1.8s2.5-.7 3-1.8H9Z" />
                </svg>
              </span>
              Trợ lý AI
            </button>
          ) : null}
        </div>

        {mode === "raw" ? (
          <div className="space-y-3">
            <article className="rounded-xl border border-slate-200 bg-white p-5">
              <EmailBodyEditor item={email} onSaveEmailBody={onSaveEmailBody} />
            </article>
          </div>
        ) : (
          <div className="space-y-3">
            {groupedMessages.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {item.id === groupedMessages[groupedMessages.length - 1]?.id ? normalizeSubject(item.subject) : toReplyTitle(item.subject)}
                </p>
                <EmailBodyEditor item={item} onSaveEmailBody={onSaveEmailBody} />
              </article>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

