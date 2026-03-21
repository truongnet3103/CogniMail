import type { AppContext, ConfigRepo } from "../types";
import type { UserConfig } from "../shared-types";
import { getFirestore } from "../firebase";
import { stripUndefined } from "./firestoreSanitize";

const configDoc = (ctx: AppContext) =>
  getFirestore().collection("users").doc(ctx.userId).collection("config").doc("default");

export const firestoreConfigRepo: ConfigRepo = {
  async getConfig(ctx) {
    const snapshot = await configDoc(ctx).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as UserConfig;
  },

  async saveConfig(ctx, config) {
    await configDoc(ctx).set(stripUndefined(config), { merge: true });
  },
};

