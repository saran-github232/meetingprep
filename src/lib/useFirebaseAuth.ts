import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, firestore, firebaseConfigured } from "./firebase";

export interface AuthState {
  configured: boolean;
  loading: boolean;
  user: User | null;
  isAdmin: boolean;
}

// Admin status is looked up from Firestore (an `admins/{email}` doc existing) rather than
// decided client-side — the same check is mirrored in the Firestore/Storage security rules,
// which are what actually enforce it. See README > "Resources (Admin/User) setup".
export function useFirebaseAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = firestore;
    if (!auth || !db) {
      setLoading(false);
      return;
    }
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setIsAdmin(u?.email ? (await getDoc(doc(db, "admins", u.email))).exists() : false);
      setLoading(false);
    });
  }, []);

  return { configured: firebaseConfigured, loading, user, isAdmin };
}

export async function signIn(email: string, password: string) {
  if (!auth) throw new Error("Firebase is not configured.");
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signUp(email: string, password: string) {
  if (!auth) throw new Error("Firebase is not configured.");
  await createUserWithEmailAndPassword(auth, email, password);
}

export async function signOutUser() {
  if (auth) await signOut(auth);
}
