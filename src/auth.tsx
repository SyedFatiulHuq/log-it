import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { ALLOWED_EMAIL } from "./firebase-config";

interface AuthState {
  user: User | null;
  loading: boolean;
  /** Set when a signed-in account is not the allowlisted owner. */
  denied: string | null;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState<string | null>(null);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        if (u && u.email !== ALLOWED_EMAIL) {
          setDenied(u.email ?? "unknown account");
          void signOut(auth);
          setUser(null);
        } else {
          setUser(u);
        }
        setLoading(false);
      }),
    [],
  );

  const value: AuthState = {
    user,
    loading,
    denied,
    // signInWithPopup, not redirect: redirect is unreliable on iOS Safari across domains.
    signIn: async () => {
      setDenied(null);
      await signInWithPopup(auth, googleProvider);
    },
    signOutUser: () => signOut(auth),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
