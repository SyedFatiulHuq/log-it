import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { firebaseConfig } from "./firebase-config";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Persistent local cache so the app works offline at the gym and syncs later.
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
