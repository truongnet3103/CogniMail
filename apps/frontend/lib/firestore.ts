import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  orderBy,
  query,
  setDoc,
  where,
  limit,
} from "firebase/firestore";
import type { AiTokenUsage, BillingProfile, Email, Task, UserConfig } from "@/lib/types";
import { firebaseDb } from "./firebase";
import { normalizeSubject } from "./email-utils";

const stripUndefined = <T>(input: T): T => {
  if (Array.isArray(input)) {
    return input.map((item) => stripUndefined(item)).filter((item) => item !== undefined) as T;
  }

  if (input && typeof input === "object") {
    const entries = Object.entries(input as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, stripUndefined(value)]);
    return Object.fromEntries(entries) as T;
  }

  return input;
};

export const loadRecentEmails = async (userId: string, max = 50): Promise<Email[]> => {
  const ref = collection(firebaseDb, "users", userId, "emails");
  const snapshot = await getDocs(query(ref, orderBy("date", "desc"), limit(max)));
  return snapshot.docs.map((d) => d.data() as Email);
};

export const loadConfig = async (userId: string): Promise<UserConfig | null> => {
  const ref = doc(firebaseDb, "users", userId, "config", "default");
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data() as UserConfig;
};

export const saveConfig = async (userId: string, config: UserConfig) => {
  const ref = doc(firebaseDb, "users", userId, "config", "default");
  await setDoc(ref, stripUndefined(config), { merge: true });
};

const billingProfileRef = (userId: string) => doc(firebaseDb, "users", userId, "billing", "profile");
const billingLedgerRef = (userId: string) => collection(firebaseDb, "users", userId, "billing", "profile", "ledger");

const defaultBillingProfile = (): BillingProfile => ({
  plan: "free",
  status: "active",
  creditBalance: 0,
  currency: "USD",
  updatedAt: new Date().toISOString(),
});

const CREDIT_COST_PER_1K_TOKENS = 0.0025;

export const loadBillingProfile = async (userId: string): Promise<BillingProfile> => {
  const snapshot = await getDoc(billingProfileRef(userId));
  if (!snapshot.exists()) return defaultBillingProfile();
  const data = snapshot.data() as Partial<BillingProfile>;
  return {
    plan: data.plan === "pro" ? "pro" : "free",
    status: data.status === "inactive" ? "inactive" : "active",
    creditBalance: Number(data.creditBalance ?? 0),
    currency: data.currency ?? "USD",
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
};

export const setBillingPlan = async (userId: string, plan: BillingProfile["plan"]) => {
  await setDoc(
    billingProfileRef(userId),
    {
      plan,
      status: "active",
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
};

export const topupBillingCreditManual = async (userId: string, amount: number, note = "Nạp tay test") => {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Số tiền nạp không hợp lệ");
  await runTransaction(firebaseDb, async (transaction) => {
    const profileDoc = await transaction.get(billingProfileRef(userId));
    const current = profileDoc.exists() ? (profileDoc.data() as Partial<BillingProfile>) : defaultBillingProfile();
    const currentBalance = Number(current.creditBalance ?? 0);
    const nextBalance = Math.round((currentBalance + amount) * 10000) / 10000;
    const now = new Date().toISOString();
    transaction.set(
      billingProfileRef(userId),
      {
        plan: current.plan === "pro" ? "pro" : "free",
        status: current.status === "inactive" ? "inactive" : "active",
        creditBalance: nextBalance,
        currency: current.currency ?? "USD",
        updatedAt: now,
      },
      { merge: true },
    );

    const ledgerDoc = doc(billingLedgerRef(userId));
    transaction.set(ledgerDoc, {
      id: ledgerDoc.id,
      type: "topup",
      amount,
      balanceAfter: nextBalance,
      note,
      createdAt: now,
    });
  });
};

export const saveTasks = async (userId: string, tasks: Task[]) => {
  await Promise.all(
    tasks.map((task) =>
      setDoc(doc(firebaseDb, "users", userId, "tasks", task.id), stripUndefined(task), { merge: true }),
    ),
  );
};

export const saveTask = async (userId: string, task: Task) => {
  await setDoc(doc(firebaseDb, "users", userId, "tasks", task.id), stripUndefined(task), { merge: true });
};

export const updateTaskStatus = async (userId: string, taskId: string, completed: boolean) => {
  await setDoc(
    doc(firebaseDb, "users", userId, "tasks", taskId),
    {
      completed,
      completedAt: completed ? new Date().toISOString() : null,
    },
    { merge: true },
  );
};

export const deleteTask = async (userId: string, taskId: string) => {
  await deleteDoc(doc(firebaseDb, "users", userId, "tasks", taskId));
};

export const loadTasks = async (userId: string, tags: string[] = []): Promise<Task[]> => {
  const ref = collection(firebaseDb, "users", userId, "tasks");
  if (tags.length === 0) {
    const snapshot = await getDocs(query(ref, orderBy("createdAt", "desc")));
    return snapshot.docs.map((docSnapshot) => docSnapshot.data() as Task);
  }
  const snapshot = await getDocs(query(ref, where("tags", "array-contains-any", tags.slice(0, 10))));
  return snapshot.docs.map((docSnapshot) => docSnapshot.data() as Task);
};

export const cleanupLegacyTasks = async (userId: string): Promise<number> => {
  const ref = collection(firebaseDb, "users", userId, "tasks");
  const snapshot = await getDocs(ref);
  const legacyDocs = snapshot.docs.filter((docSnapshot) => {
    const data = docSnapshot.data() as Record<string, unknown>;
    return !Object.prototype.hasOwnProperty.call(data, "dueExplicit");
  });

  await Promise.all(legacyDocs.map((docSnapshot) => deleteDoc(docSnapshot.ref)));
  return legacyDocs.length;
};

export const deleteEmails = async (userId: string, emailIds: string[]) => {
  await Promise.all(emailIds.map((emailId) => deleteDoc(doc(firebaseDb, "users", userId, "emails", emailId))));
};

export const updateEmailTextBody = async (userId: string, emailId: string, textBody: string) => {
  await setDoc(
    doc(firebaseDb, "users", userId, "emails", emailId),
    {
      textBody,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
};

const toSafeDocId = (value: string) => value.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 120);

export const saveAiSummaryEmail = async (userId: string, sourceEmails: Email[], aiText: string) => {
  if (sourceEmails.length === 0) return null;

  const sorted = [...sourceEmails].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const baseTitle = normalizeSubject(sorted[0]?.subject ?? "Hoi thoai");
  const groupKey = normalizeSubject(sorted[0]?.subject ?? "Hoi thoai").toLowerCase();
  const aiEmailId = `${toSafeDocId(groupKey)}__AI`;
  const now = new Date().toISOString();

  const aiEmail: Email = {
    id: aiEmailId,
    subject: `AI: ${baseTitle}`,
    from: { name: "Tro ly AI", address: "ai@cognimail.local" },
    to: [],
    date: now,
    textBody: aiText,
    hasAttachment: false,
    isAi: true,
    sourceGroupKey: groupKey,
    mailbox: "AI",
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(firebaseDb, "users", userId, "emails", aiEmailId), stripUndefined(aiEmail), { merge: true });
  await Promise.all(
    sourceEmails.map((email) =>
      setDoc(
        doc(firebaseDb, "users", userId, "emails", email.id),
        { hasAiResult: true, aiLinkedId: aiEmailId, sourceGroupKey: groupKey, updatedAt: now },
        { merge: true },
      ),
    ),
  );

  return aiEmail;
};

export const consumeBillingCreditByUsage = async (userId: string, usage: AiTokenUsage, note?: string) => {
  const totalTokens = Math.max(0, Math.floor(Number(usage.totalTokens ?? 0)));
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) {
    return { charged: 0, balanceAfter: null as number | null, skipped: true };
  }

  return runTransaction(firebaseDb, async (transaction) => {
    const profileDoc = await transaction.get(billingProfileRef(userId));
    const current = profileDoc.exists() ? (profileDoc.data() as Partial<BillingProfile>) : defaultBillingProfile();
    const currentBalance = Number(current.creditBalance ?? 0);
    const plan = current.plan === "pro" ? "pro" : "free";

    if (plan !== "pro") {
      return { charged: 0, balanceAfter: currentBalance, skipped: true };
    }

    const rawCost = (totalTokens / 1000) * CREDIT_COST_PER_1K_TOKENS;
    const roundedCost = Math.round(rawCost * 1000000) / 1000000;
    const charged = Math.min(currentBalance, roundedCost);
    const nextBalance = Math.max(0, Math.round((currentBalance - charged) * 1000000) / 1000000);
    const now = new Date().toISOString();

    transaction.set(
      billingProfileRef(userId),
      {
        plan,
        status: current.status === "inactive" ? "inactive" : "active",
        creditBalance: nextBalance,
        currency: current.currency ?? "USD",
        updatedAt: now,
      },
      { merge: true },
    );

    if (charged > 0) {
      const ledgerDoc = doc(billingLedgerRef(userId));
      transaction.set(ledgerDoc, {
        id: ledgerDoc.id,
        type: "usage",
        amount: -charged,
        balanceAfter: nextBalance,
        note:
          note ??
          `AI usage: provider=${usage.provider}, model=${usage.model ?? "unknown"}, totalTokens=${totalTokens}, estimated=${usage.estimated ? "yes" : "no"}`,
        createdAt: now,
      });
    }

    return { charged, balanceAfter: nextBalance, skipped: false };
  });
};
