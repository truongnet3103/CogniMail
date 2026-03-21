import type { AppContext, EmailRepo } from "../types";
import type { Email, LastFetchMeta } from "../shared-types";
import { getFirestore } from "../firebase";
import { stripUndefined } from "./firestoreSanitize";

const userRef = (ctx: AppContext) => getFirestore().collection("users").doc(ctx.userId);

export const firestoreEmailRepo: EmailRepo = {
  async saveEmails(ctx, emails: Email[]) {
    const batch = getFirestore().batch();
    for (const email of emails) {
      const ref = userRef(ctx).collection("emails").doc(email.id);
      batch.set(ref, stripUndefined(email), { merge: true });
    }
    await batch.commit();
  },

  async getRecentEmails(ctx, limit: number) {
    const snapshot = await userRef(ctx)
      .collection("emails")
      .orderBy("date", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as Email);
  },

  async saveLastFetchMeta(ctx, meta: LastFetchMeta) {
    await userRef(ctx).collection("meta").doc("lastFetch").set(stripUndefined(meta), { merge: true });
  },
};

