import type { Email, Task } from "@/lib/types";

export type EmailGroup = {
  subjectKey: string;
  title: string;
  latestDate: string;
  emails: Email[];
};

export type EmailFeature = {
  emailId: string;
  subject: string;
  from: string;
  to: string[];
  conversationKey: string;
  hasQuestion: boolean;
  questionSentences: string[];
  hasActionKeyword: boolean;
  actionKeywords: string[];
  hasDeadlineText: boolean;
  deadlinePhrases: string[];
  urgencySignals: string[];
  projectCodes: string[];
  isDirectToMe: boolean;
};

export const normalizeSubject = (subject: string) => subject.replace(/^(re|fwd):\s*/gi, "").trim();
export const toReplyTitle = (subject: string) => `RE ${normalizeSubject(subject)}`;

export const groupEmails = (emails: Email[]): EmailGroup[] => {
  const grouped = new Map<string, Email[]>();

  for (const email of emails) {
    const key = normalizeSubject(email.subject).toLowerCase();
    const current = grouped.get(key) ?? [];
    grouped.set(key, [...current, email]);
  }

  return [...grouped.entries()]
    .map(([subjectKey, threadEmails]) => ({
      subjectKey,
      title: normalizeSubject(threadEmails[0]?.subject ?? "(No Subject)"),
      emails: threadEmails.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      latestDate: threadEmails.reduce((acc, email) => (email.date > acc ? email.date : acc), "1970-01-01T00:00:00.000Z"),
    }))
    .sort((a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime());
};

type ParsedAiTask = {
  title?: string;
  actionType?: string;
  description?: string;
  owner?: string | null;
  sourceGroupKey?: string;
  emailId?: string;
  deadlineText?: string | null;
  deadlineNote?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  dueEvidence?: string | null;
  deadlineRef?: string;
  due?:
    | {
        date?: string | null;
        time?: string | null;
        timezone?: string | null;
        isExplicit?: boolean;
        confidence?: number;
        evidence?: string;
      }
    | undefined;
  priority?: "high" | "medium" | "low";
  importanceLevel?: "critical" | "high" | "medium" | "low";
  score?: number;
  assessment?: string;
  evidence?: string;
  confidence?: number;
  tags?: string[];
  conversationKey?: string;
  sourceEmailId?: string;
};

type ParsedDeadlineExtraction = {
  id?: string;
  sourceEmailId?: string;
  conversationKey?: string;
  rawText?: string | null;
  normalizedDate?: string | null;
  normalizedTime?: string | null;
  timezone?: string | null;
  isExplicit?: boolean;
  confidence?: number;
  kind?: "exact" | "relative" | "conditional" | "none";
  note?: string | null;
  evidence?: string;
};

const actionVerbs = [
  "xac nhan",
  "gui",
  "bo sung",
  "tra loi",
  "theo doi",
  "lien he",
  "kiem tra",
  "cap nhat",
  "chot",
  "thuc hien",
  "confirm",
  "send",
  "reply",
  "follow up",
  "check",
  "update",
  "arrange",
  "decide",
  "approve",
  "pay",
  "inform",
  "advise",
  "let me know",
  "xu ly",
  "quyet dinh",
  "duyet",
  "thanh toan",
  "cho biet",
];

const actionKeywords = [
  "confirm",
  "send",
  "provide",
  "check",
  "update",
  "reply",
  "follow up",
  "advise",
  "clarify",
  "review",
  "xac nhan",
  "gui",
  "bo sung",
  "kiem tra",
  "cap nhat",
  "tra loi",
  "theo doi",
  "lam ro",
  "arrange",
  "decide",
  "approve",
  "pay",
  "invoice",
  "pro forma",
  "tracking",
  "let me know",
  "thanh toan",
  "hoa don",
  "cho biet",
];

const deadlinePatterns = [
  /\b\d{4}-\d{2}-\d{2}\b/gi,
  /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi,
  /\b\d{1,2}[\/\-]\d{1,2}\b/gi,
  /\b(?:today|tomorrow|tonight|eod|end of day|next week|this week)\b/gi,
  /\b(?:before shipment|before production|prior to shipment|asap|urgent)\b/gi,
];

const urgencyPatterns = [/\b(asap|urgent|today|immediately|priority)\b/gi, /\b(gap|khẩn|gấp|ngay)\b/gi];

const vaguePatterns = [/chu de/i, /trang thai/i, /nguoi lien he/i, /tom tat/i, /boi canh/i, /^summary/i];

const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const shortHash = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
};

const toTaskIdFromEmail = (emailId: string) => `tsk_email_${emailId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120)}`;

const normalizeDate = (dueDate?: string | null) => {
  if (!dueDate) return undefined;
  const value = dueDate.trim();
  if (!value) return undefined;
  const isoMatch = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const viMatch = value.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (viMatch) {
    const dd = viMatch[1].padStart(2, "0");
    const mm = viMatch[2].padStart(2, "0");
    const yyyy = viMatch[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const viNoYearMatch = value.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/);
  if (viNoYearMatch) {
    const dd = Number(viNoYearMatch[1]);
    const mm = Number(viNoYearMatch[2]);
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      const yyyy = new Date().getFullYear();
      return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    const dd = String(parsed.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return undefined;
};

const normalizeTime = (value?: string | null) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const hhmm = trimmed.match(/\b(\d{1,2}):(\d{2})\b/);
  if (hhmm) {
    return `${hhmm[1].padStart(2, "0")}:${hhmm[2]}`;
  }
  return undefined;
};

const parseMonthNameDeadline = (value?: string | null, referenceYear?: number) => {
  if (!value) return undefined;
  const input = value.trim().toLowerCase();
  if (!input) return undefined;
  const months: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    sept: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };

  const full = input.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?\b/i);
  if (full) {
    const mm = months[full[1].toLowerCase()];
    const dd = String(Number(full[2])).padStart(2, "0");
    const yyyy = Number(full[3] ?? referenceYear ?? new Date().getFullYear());
    return `${yyyy}-${String(mm).padStart(2, "0")}-${dd}`;
  }

  const short = input.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?\b/i);
  if (short) {
    const mm = months[short[1].toLowerCase()];
    const dd = String(Number(short[2])).padStart(2, "0");
    const yyyy = Number(short[3] ?? referenceYear ?? new Date().getFullYear());
    return `${yyyy}-${String(mm).padStart(2, "0")}-${dd}`;
  }

  return undefined;
};

const resolveEmailIdByEvidence = (
  sourceEmails: Email[],
  evidence?: string,
  conversationKey?: string,
  sourceEmailId?: string,
) => {
  if (sourceEmails.length === 0) return undefined;
  const sorted = [...sourceEmails].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (sourceEmailId?.trim()) {
    const bySourceId = sorted.find((email) => email.id === sourceEmailId.trim());
    if (bySourceId) return bySourceId.id;
  }

  const evidenceSourceId = evidence?.match(/EmailID:\s*([^\s]+)/i)?.[1]?.trim();
  if (evidenceSourceId) {
    const byEvidenceSourceId = sorted.find((email) => email.id === evidenceSourceId);
    if (byEvidenceSourceId) return byEvidenceSourceId.id;
  }

  let scopedEmails = sorted;
  if (conversationKey) {
    const key = conversationKey.toLowerCase();
    const byConversation = sorted.filter((email) => normalizeSubject(email.subject).toLowerCase() === key);
    if (byConversation.length > 0) scopedEmails = byConversation;
  }

  const evidenceText = normalizeText(evidence ?? "");
  if (evidenceText) {
    const token = evidenceText.slice(0, 120);
    const byEvidence = scopedEmails.find((email) => normalizeText(email.textBody ?? "").includes(token));
    if (byEvidence) return byEvidence.id;
  }

  return scopedEmails[0]?.id ?? sorted[0]?.id;
};

const isActionableTitle = (title: string) => {
  if (!title.trim()) return false;
  if (vaguePatterns.some((pattern) => pattern.test(normalizeText(title)))) return false;
  const normalized = normalizeText(title);
  if (actionVerbs.some((verb) => normalized.includes(verb))) return true;
  return normalized.length >= 8;
};

const toTask = (
  item: ParsedAiTask,
  fallbackIndex: number,
  sourceGroupKey?: string,
  deadlineOverride?: {
    date?: string | null;
    time?: string | null;
    timezone?: string | null;
    isExplicit?: boolean;
    evidence?: string;
    note?: string | null;
  },
): Task | null => {
  const title = (item.title ?? "").trim().replace(/^[*\-0-9\.\s]+/, "");
  if (!isActionableTitle(title)) return null;

  const fallbackDeadlineText = item.deadlineText ?? item.deadlineNote ?? item.due?.evidence ?? item.evidence ?? item.description;
  const dueDateRaw =
    deadlineOverride?.date ??
    item.due?.date ??
    item.dueDate ??
    normalizeDate(fallbackDeadlineText) ??
    parseMonthNameDeadline(fallbackDeadlineText);
  const dueDate = normalizeDate(dueDateRaw);
  const dueTimeRaw = deadlineOverride?.time ?? item.due?.time ?? item.dueTime;
  const dueTime = normalizeTime(dueTimeRaw);
  const isExplicitFromModel = (deadlineOverride?.isExplicit ?? item.due?.isExplicit) === true;
  const dueExplicit = Boolean(dueDate) && (isExplicitFromModel || Boolean(fallbackDeadlineText?.trim()));
  const normalizedTitle = normalizeText(title);
  const actionType = item.actionType?.trim().toLowerCase() || "other";
  const sourceAnchor = item.sourceEmailId?.trim() || item.emailId?.trim() || sourceGroupKey || "general";
  const idBase = `${normalizedTitle}__${actionType}__${sourceAnchor}`;
  const now = new Date().toISOString();
  const incomingTags = item.tags?.filter(Boolean) ?? [];
  const tags = dueDate ? [...new Set([...incomingTags, "deadline"])] : [...new Set(incomingTags)];

  return {
    id: `tsk_${shortHash(idBase || String(fallbackIndex))}`,
    title,
    actionType,
    description: item.description?.trim() || undefined,
    owner: item.owner?.trim() || undefined,
    dueDate: dueExplicit ? dueDate : undefined,
    dueTime: dueExplicit ? dueTime : undefined,
    dueTimezone: dueExplicit ? deadlineOverride?.timezone?.trim() || item.due?.timezone?.trim() || undefined : undefined,
    dueExplicit,
    dueEvidence:
      dueExplicit
        ? deadlineOverride?.evidence?.trim() ||
          item.due?.evidence?.trim() ||
          item.deadlineText?.trim() ||
          undefined
        : undefined,
    deadlineNote: deadlineOverride?.note?.trim() || item.deadlineNote?.trim() || item.deadlineText?.trim() || undefined,
    tags,
    evidence: item.evidence?.trim() || item.dueEvidence?.trim() || item.due?.evidence?.trim() || undefined,
    assessment: item.assessment?.trim() || undefined,
    confidence: typeof item.confidence === "number" ? item.confidence : undefined,
    priority: item.priority,
    importanceLevel: item.importanceLevel,
    score: typeof item.score === "number" ? item.score : undefined,
    emailId: undefined,
    completed: false,
    createdAt: now,
    sourceGroupKey,
  };
};

const mergeTasks = (tasks: Task[]): Task[] => {
  const grouped = new Map<string, Task[]>();

  for (const task of tasks) {
    const key = `${normalizeText(task.title)}__${task.actionType ?? "other"}__${task.sourceGroupKey ?? "general"}__${task.emailId ?? "no-email"}`;
    const current = grouped.get(key) ?? [];
    grouped.set(key, [...current, task]);
  }

  return [...grouped.values()].map((items) => {
    const sortedByConfidence = [...items].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    const best = sortedByConfidence[0];
    const evidences = [...new Set(items.map((item) => item.evidence).filter(Boolean))];
    return {
      ...best,
      evidence: evidences[0],
      mergedCount: items.length,
      createdAt: items.map((item) => item.createdAt).sort()[0] ?? best.createdAt,
    };
  });
};

const rankTask = (task: Task) => {
  const score = task.score ?? 0;
  const confidence = task.confidence ?? 0;
  const dueBonus = task.dueDate && task.dueExplicit ? 15 : 0;
  const actionBonus =
    task.actionType === "reply" ? 8 : task.actionType === "follow_up" ? 6 : task.actionType === "confirm" ? 5 : 0;
  return score + confidence * 10 + dueBonus + actionBonus;
};

const compactTasksBySource = (tasks: Task[], sourceEmails: Email[]) => {
  const grouped = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = task.emailId ?? task.sourceGroupKey ?? "unknown";
    const current = grouped.get(key) ?? [];
    grouped.set(key, [...current, task]);
  }

  const compacted: Task[] = [];
  for (const [key, items] of grouped.entries()) {
    const uniqueByAction = new Map<string, Task>();
    for (const item of items) {
      const actionKey = item.actionType ?? "other";
      const existing = uniqueByAction.get(actionKey);
      if (!existing || rankTask(item) > rankTask(existing)) {
        uniqueByAction.set(actionKey, item);
      }
    }

    let candidates = [...uniqueByAction.values()].sort((a, b) => rankTask(b) - rankTask(a));
    const sourceEmail = sourceEmails.find((email) => email.id === key);
    const sourceText = (sourceEmail?.textBody ?? "").trim();
    const isShortQuestionEmail = sourceText.length > 0 && sourceText.length <= 450 && sourceText.includes("?");
    const hasReply = candidates.some((item) => item.actionType === "reply");

    if (isShortQuestionEmail && hasReply) {
      candidates = candidates.filter((item) => item.actionType === "reply").slice(0, 1);
    } else {
      candidates = candidates.slice(0, 2);
    }

    compacted.push(...candidates);
  }

  return compacted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

const extractJsonFromText = (rawOutput: string) => {
  const clean = rawOutput.trim();
  if (!clean) return null;
  if (clean.startsWith("{") || clean.startsWith("[")) return clean;
  const block = clean.match(/```json\s*([\s\S]*?)```/i)?.[1];
  if (block) return block.trim();
  const objStart = clean.indexOf("{");
  const objEnd = clean.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) return clean.slice(objStart, objEnd + 1);
  return null;
};

const splitSentences = (input: string) =>
  input
    .replace(/\r/g, "")
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[\.\?!])\s+/))
    .map((item) => item.trim())
    .filter(Boolean);

export const extractEmailFeature = (email: Email, currentUserEmail?: string): EmailFeature => {
  const text = email.textBody ?? "";
  const sentences = splitSentences(text);
  const questionSentences = sentences.filter((sentence) => sentence.includes("?"));
  const normalizedText = normalizeText(text);
  const foundActionKeywords = [...new Set(actionKeywords.filter((keyword) => normalizedText.includes(normalizeText(keyword))))];

  const deadlinePhrases = [
    ...new Set(
      deadlinePatterns.flatMap((pattern) => {
        pattern.lastIndex = 0;
        return [...(text.match(pattern) ?? [])];
      }),
    ),
  ];
  const urgencySignals = [
    ...new Set(
      urgencyPatterns.flatMap((pattern) => {
        pattern.lastIndex = 0;
        return [...(text.match(pattern) ?? [])];
      }),
    ),
  ];
  const projectCodes = [...new Set((email.subject.match(/\b(?:PO[#:\s-]*[A-Z0-9-]+|[A-Z]{2,}\d{3,})\b/gi) ?? []).map((item) => item.trim()))];
  const me = currentUserEmail?.trim().toLowerCase() ?? "";
  const isDirectToMe = me.length > 0 && email.to.some((item) => item.address.trim().toLowerCase() === me);

  return {
    emailId: email.id,
    subject: email.subject,
    from: email.from.address,
    to: email.to.map((item) => item.address),
    conversationKey: normalizeSubject(email.subject).toLowerCase(),
    hasQuestion: questionSentences.length > 0,
    questionSentences,
    hasActionKeyword: foundActionKeywords.length > 0,
    actionKeywords: foundActionKeywords,
    hasDeadlineText: deadlinePhrases.length > 0,
    deadlinePhrases,
    urgencySignals,
    projectCodes,
    isDirectToMe,
  };
};

export const extractEmailFeatures = (emails: Email[], currentUserEmail?: string) =>
  emails.map((email) => extractEmailFeature(email, currentUserEmail));

export const extractTasks = (
  rawOutput: string,
  sourceEmails: Email[] = [],
  options?: { currentUserEmail?: string },
): Task[] => {
  try {
    const candidate = extractJsonFromText(rawOutput);
    if (candidate) {
      const parsed = JSON.parse(candidate) as
        | ParsedAiTask[]
        | {
            tasks?: ParsedAiTask[];
            deadlineExtraction?: ParsedDeadlineExtraction[];
          };
      const parsedTasks = Array.isArray(parsed) ? parsed : Array.isArray(parsed.tasks) ? parsed.tasks : [];
      const parsedDeadlineExtraction =
        !Array.isArray(parsed) && Array.isArray(parsed.deadlineExtraction) ? parsed.deadlineExtraction : [];

      if (parsedTasks.length > 0) {
        const deadlineMap = new Map<string, ParsedDeadlineExtraction>();
        for (const entry of parsedDeadlineExtraction) {
          const id = entry.id?.trim();
          if (id) deadlineMap.set(id, entry);
        }

        const mapped = (parsedTasks
          .map((item, index) => {
            const deadline = item.deadlineRef?.trim() ? deadlineMap.get(item.deadlineRef.trim()) : undefined;
            const resolvedEmailId = resolveEmailIdByEvidence(
              sourceEmails,
              deadline?.evidence ?? item.evidence,
              deadline?.conversationKey ?? item.conversationKey ?? item.sourceGroupKey,
              deadline?.sourceEmailId ?? item.sourceEmailId ?? item.emailId,
            );
            const sourceEmail = sourceEmails.find((email) => email.id === resolvedEmailId);
            const taskSourceGroupKey =
              deadline?.conversationKey?.toLowerCase() ??
              item.conversationKey?.toLowerCase() ??
              item.sourceGroupKey?.toLowerCase() ??
              (sourceEmail ? normalizeSubject(sourceEmail.subject).toLowerCase() : undefined);
            const task = toTask(item, index, taskSourceGroupKey, deadline
              ? {
                  date: deadline.normalizedDate,
                  time: deadline.normalizedTime,
                  timezone: deadline.timezone,
                  isExplicit: deadline.isExplicit,
                  evidence: deadline.evidence,
                  note: deadline.note ?? deadline.rawText ?? undefined,
                }
              : undefined);
            if (!task) return null;
            return {
              ...task,
              id: resolvedEmailId ? toTaskIdFromEmail(resolvedEmailId) : task.id,
              emailId: resolvedEmailId,
              sourceGroupKey: taskSourceGroupKey,
              createdAt: sourceEmail?.date ?? task.createdAt,
            };
          })
          .filter((item) => Boolean(item)) as Task[]).filter((task) => {
            if (typeof task.confidence !== "number") return true;
            if (task.confidence >= 0.35) return true;
            return Boolean(task.dueDate && task.dueExplicit);
          });

        const merged = compactTasksBySource(mergeTasks(mapped), sourceEmails);
        if (merged.length > 0) return merged;
      }
    }
  } catch {
    // fallback parsing below
  }

  const lines = rawOutput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const fallback = (lines
    .filter((line) => line.startsWith("- ") || line.match(/^\d+\.\s/))
    .map((line, index) => {
      const title = line.replace(/^(-|\d+\.)\s*/, "").slice(0, 120);
      const resolvedEmailId = resolveEmailIdByEvidence(sourceEmails, title);
      const sourceEmail = sourceEmails.find((email) => email.id === resolvedEmailId);
      const taskSourceGroupKey = sourceEmail ? normalizeSubject(sourceEmail.subject).toLowerCase() : undefined;
      const task = toTask({ title }, index, taskSourceGroupKey);
      if (!task) return null;
      return {
        ...task,
        id: resolvedEmailId ? toTaskIdFromEmail(resolvedEmailId) : task.id,
        emailId: resolvedEmailId,
        sourceGroupKey: taskSourceGroupKey,
        createdAt: sourceEmail?.date ?? task.createdAt,
      };
    })
    .filter((item) => Boolean(item)) as Task[]);

  const mergedFallback = compactTasksBySource(mergeTasks(fallback), sourceEmails);
  if (mergedFallback.length > 0) return mergedFallback;

  const features = extractEmailFeatures(sourceEmails, options?.currentUserEmail);
  const questionFeature = features.find((item) => item.hasQuestion);
  if (questionFeature) {
    const sourceEmail = sourceEmails.find((email) => email.id === questionFeature.emailId);
    const now = new Date().toISOString();
    const task: Task = {
      id: toTaskIdFromEmail(questionFeature.emailId),
      title: "Trả lời câu hỏi trong email",
      actionType: "reply",
      description: questionFeature.questionSentences[0] ?? "Email có câu hỏi cần phản hồi.",
      priority: "medium",
      importanceLevel: "medium",
      score: 60,
      evidence: questionFeature.questionSentences[0] ?? undefined,
      emailId: questionFeature.emailId,
      sourceGroupKey: sourceEmail ? normalizeSubject(sourceEmail.subject).toLowerCase() : questionFeature.conversationKey,
      dueExplicit: false,
      createdAt: sourceEmail?.date ?? now,
      completed: false,
    };
    return [task];
  }

  return [];
};
