import { readFileSync } from "node:fs";
import admin from "firebase-admin";

let initialized = false;

export const initFirebaseAdmin = () => {
  if (initialized) {
    return admin;
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  let serviceAccount: Record<string, unknown>;

  if (serviceAccountJson) {
    serviceAccount = JSON.parse(serviceAccountJson);
  } else if (serviceAccountPath) {
    const raw = readFileSync(serviceAccountPath, "utf8");
    serviceAccount = JSON.parse(raw);
  } else {
    throw new Error("Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  initialized = true;
  return admin;
};

export const getFirestore = () => {
  const app = initFirebaseAdmin();
  return app.firestore();
};

export const getAuth = () => {
  const app = initFirebaseAdmin();
  return app.auth();
};
