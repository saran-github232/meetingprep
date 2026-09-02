import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Firebase web config identifies the project — it is NOT a secret (unlike the AI provider keys,
// which stay in the Electron main process). Access is governed by the security rules deployed
// on the Firebase project, not by hiding this config. See README > "Resources (Admin/User) setup".
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

const app = firebaseConfigured ? initializeApp(firebaseConfig) : null;

export const auth = app ? getAuth(app) : null;
export const firestore = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;
