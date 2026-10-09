import { useEffect, useMemo, useState } from "react";
import {
  onSnapshot, orderBy, query, where, limit,
  type DocumentReference, type Query,
} from "firebase/firestore";
import { useAuth } from "../auth";
import { DEFAULT_SETTINGS } from "./defaults";
import {
  exercisesCol, locationsCol, sessionDoc, sessionsCol, userDoc, weightsCol,
} from "./refs";
import type { Session, Settings } from "./types";

export interface Live<T> {
  data: T;
  /** true until the first snapshot arrives */
  loading: boolean;
  /** true while local writes have not reached the server (offline or in flight) */
  pending: boolean;
  error: Error | null;
}

function useUid(): string {
  const { user } = useAuth();
  if (!user) throw new Error("Data hooks require a signed-in user");
  return user.uid;
}

/** Subscribes to a document; `key` must change whenever the ref's identity does. */
function useDocSnapshot<T>(make: () => DocumentReference | null, key: string): Live<(T & { id: string }) | null> {
  const [state, setState] = useState<Live<(T & { id: string }) | null>>({
    data: null, loading: true, pending: false, error: null,
  });
  useEffect(() => {
    const ref = make();
    if (!ref) {
      setState({ data: null, loading: false, pending: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) =>
        setState({
          data: snap.exists() ? ({ id: snap.id, ...snap.data() } as T & { id: string }) : null,
          loading: false,
          pending: snap.metadata.hasPendingWrites,
          error: null,
        }),
      (error) => setState((s) => ({ ...s, loading: false, error })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

function useQuerySnapshot<T>(make: () => Query | null, key: string): Live<(T & { id: string })[]> {
  const [state, setState] = useState<Live<(T & { id: string })[]>>({
    data: [], loading: true, pending: false, error: null,
  });
  useEffect(() => {
    const q = make();
    if (!q) {
      setState({ data: [], loading: false, pending: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) =>
        setState({
          data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T & { id: string }),
          loading: false,
          pending: snap.metadata.hasPendingWrites,
          error: null,
        }),
      (error) => setState((s) => ({ ...s, loading: false, error })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/** Settings merged over defaults, so callers never see missing fields. */
export function useSettings(): Live<Settings> & { exists: boolean } {
  const uid = useUid();
  const live = useDocSnapshot<Partial<Settings>>(() => userDoc(uid), uid);
  const data = useMemo(() => ({ ...DEFAULT_SETTINGS, ...(live.data ?? {}) }) as Settings, [live.data]);
  return { ...live, data, exists: live.data != null };
}

export function useSession(id: string | null) {
  const uid = useUid();
  return useDocSnapshot<Session>(() => (id ? sessionDoc(uid, id) : null), `${uid}/${id}`);
}

/** The single active session, if any (spec: only one at a time). */
export function useActiveSession(): Live<(Session & { id: string }) | null> {
  const uid = useUid();
  const live = useQuerySnapshot<Session>(
    () => query(sessionsCol(uid), where("status", "==", "active"), limit(1)),
    uid,
  );
  return { ...live, data: live.data[0] ?? null };
}

/** Sessions with `date` in [from, to] (inclusive "YYYY-MM-DD"), oldest first. */
export function useSessions(from: string, to: string) {
  const uid = useUid();
  return useQuerySnapshot<Session>(
    () => query(sessionsCol(uid), where("date", ">=", from), where("date", "<=", to), orderBy("date")),
    `${uid}/${from}/${to}`,
  );
}

export function useWeights(from: string, to: string) {
  const uid = useUid();
  return useQuerySnapshot<{ date: string; weight: number; unit: "lb" | "kg" }>(
    () => query(weightsCol(uid), where("date", ">=", from), where("date", "<=", to), orderBy("date")),
    `${uid}/${from}/${to}`,
  );
}

export function useLocations() {
  const uid = useUid();
  const live = useQuerySnapshot<{ name: string; lastUsedAt: { toMillis(): number } }>(
    () => locationsCol(uid),
    uid,
  );
  const data = useMemo(
    () => [...live.data].sort((a, b) => b.lastUsedAt.toMillis() - a.lastUsedAt.toMillis()),
    [live.data],
  );
  return { ...live, data };
}

export function useExercises() {
  const uid = useUid();
  return useQuerySnapshot<{
    name: string;
    group: "arms" | "upper" | "legs";
    builtIn: boolean;
    lastEquipment: string;
    lastCount: 1 | 2;
  }>(() => exercisesCol(uid), uid);
}

/** Browser online/offline flag for the "Offline — changes will sync" indicator. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
