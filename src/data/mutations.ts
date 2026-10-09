import {
  Timestamp, deleteDoc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { convertWeight } from "../calc/weight";
import { recalcSession, sessionEffort } from "../calc/calories";
import { localDateString, minutesBetween, slugify } from "../calc/dates";
import {
  exerciseDoc, locationDoc, sessionDoc, sessionsCol, userDoc, weightDoc, weightsCol,
} from "./refs";
import type { Entry, Equipment, Rating, Session, Settings, Unit } from "./types";

const now = () => Timestamp.fromDate(new Date());
const newId = () => crypto.randomUUID();

// ---- settings ------------------------------------------------------------

export function saveSettings(uid: string, patch: Partial<Settings>) {
  return setDoc(userDoc(uid), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

// ---- body weight (SPEC §5.5) --------------------------------------------

/** Weight used for calories: latest weigh-in on or before `date`, else the settings fallback. */
export async function resolveBodyWeightKg(uid: string, date: string, settings: Settings): Promise<number> {
  const snap = await getDocs(
    query(weightsCol(uid), where("date", "<=", date), orderBy("date", "desc"), limit(1)),
  );
  const w = snap.docs[0]?.data() as { weight: number; unit: Unit } | undefined;
  return w ? convertWeight(w.weight, w.unit, "kg") : convertWeight(settings.bodyWeight, settings.bodyUnit, "kg");
}

/** One entry per day (overwrites). Updates the settings fallback if this is the newest weigh-in. */
export async function saveWeight(uid: string, date: string, weight: number, unit: Unit, settings: Settings) {
  const newest = await getDocs(query(weightsCol(uid), orderBy("date", "desc"), limit(1)));
  const latestDate = newest.docs[0]?.data().date as string | undefined;
  await setDoc(weightDoc(uid, date), { date, weight, unit, loggedAt: now() });
  if (!latestDate || date >= latestDate) {
    await saveSettings(uid, { bodyWeight: convertWeight(weight, unit, settings.bodyUnit) });
  }
}

export function deleteWeight(uid: string, date: string) {
  return deleteDoc(weightDoc(uid, date));
}

/** Sessions already logged on `date`, for the "Recalculate with this weight" offer. */
export async function sessionsOnDate(uid: string, date: string) {
  const snap = await getDocs(query(sessionsCol(uid), where("date", "==", date)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Session) }));
}

export async function recalculateSessionsOnDate(
  uid: string, date: string, bodyWeightKg: number, settings: Settings,
) {
  const sessions = await sessionsOnDate(uid, date);
  await Promise.all(sessions.map((s) => updateSession(uid, s.id, { ...s, bodyWeightKg }, { bodyWeightKg }, settings)));
}

// ---- sessions ------------------------------------------------------------

export interface StartSessionInput {
  startedAt: Date;
  endedAt?: Date | null;      // set for "log past session"
  locationId: string | null;
  locationName: string | null;
  energy: Rating | null;
  sleep: Rating | null;
  bodyWeightKg: number;
}

export async function startSession(uid: string, input: StartSessionInput): Promise<string> {
  const id = newId();
  const ended = input.endedAt ?? null;
  const session: Omit<Session, "createdAt" | "updatedAt"> & { createdAt: unknown; updatedAt: unknown } = {
    status: ended ? "finished" : "active",
    date: localDateString(input.startedAt),
    startedAt: Timestamp.fromDate(input.startedAt),
    endedAt: ended ? Timestamp.fromDate(ended) : null,
    durationMin: ended ? minutesBetween(input.startedAt, ended) : null,
    locationId: input.locationId,
    locationName: input.locationName,
    bodyWeightKg: input.bodyWeightKg,
    energy: input.energy,
    sleep: input.sleep,
    mood: null,
    effort: null,
    journal: "",
    entries: [],
    totals: {
      kcalGross: 0, kcalNet: 0, byGroup: { arms: 0, upper: 0, legs: 0, swim: 0 },
      sets: 0, laps: 0, liftVolume: 0,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(sessionDoc(uid, id), session);
  if (input.locationId) await touchLocation(uid, input.locationId, input.locationName ?? "");
  return id;
}

type SessionPatch = Partial<Pick<
  Session,
  "startedAt" | "endedAt" | "locationId" | "locationName" | "energy" | "sleep" | "mood" | "journal" |
  "entries" | "status" | "bodyWeightKg"
>>;

/**
 * Single write path for session edits. Merges the patch, then re-derives date, duration, effort,
 * per-entry calories and totals so the document is always self-consistent.
 */
export function updateSession(
  uid: string, id: string, current: Session, patch: SessionPatch, settings: Settings,
) {
  const next = { ...current, ...patch };
  const start = next.startedAt.toDate();
  const end = next.endedAt?.toDate() ?? null;
  const durationMin = end ? minutesBetween(start, end) : null;

  const useActual = next.status === "finished" && settings.restMode === "actual" && durationMin != null;
  const { entries, totals } = recalcSession(next.entries, {
    bodyWeightKg: next.bodyWeightKg,
    restSec: settings.restSec,
    durationSec: useActual ? durationMin * 60 : null,
  });

  return updateDoc(sessionDoc(uid, id), {
    ...patch,
    entries,
    totals,
    date: localDateString(start),
    durationMin,
    effort: sessionEffort(entries),
    updatedAt: serverTimestamp(),
  });
}

export function finishSession(
  uid: string, id: string, current: Session, endedAt: Date, mood: Rating | null, settings: Settings,
) {
  return updateSession(uid, id, current, { status: "finished", endedAt: Timestamp.fromDate(endedAt), mood }, settings).then(
    () => (current.locationId ? touchLocation(uid, current.locationId, current.locationName ?? "") : undefined),
  );
}

export function deleteSession(uid: string, id: string) {
  return deleteDoc(sessionDoc(uid, id));
}

// ---- entries -------------------------------------------------------------

/** Adds a new entry or replaces one with the same id. Kcal are filled in by updateSession. */
export function upsertEntry(
  uid: string, id: string, current: Session, entry: Omit<Entry, "id" | "kcalGross" | "kcalNet"> & { id?: string },
  settings: Settings,
) {
  const full = { kcalGross: 0, kcalNet: 0, ...entry, id: entry.id ?? newId() } as Entry;
  const exists = current.entries.some((e) => e.id === full.id);
  const entries = exists ? current.entries.map((e) => (e.id === full.id ? full : e)) : [...current.entries, full];
  return updateSession(uid, id, current, { entries }, settings);
}

export function removeEntry(uid: string, id: string, current: Session, entryId: string, settings: Settings) {
  return updateSession(uid, id, current, { entries: current.entries.filter((e) => e.id !== entryId) }, settings);
}

// ---- locations & exercises ----------------------------------------------

export async function touchLocation(uid: string, id: string, name: string) {
  await setDoc(locationDoc(uid, id), { name, lastUsedAt: now() }, { merge: true });
}

/** Creates (or reuses) a location by name and returns its id. */
export async function addLocation(uid: string, name: string): Promise<string> {
  const id = slugify(name);
  await touchLocation(uid, id, name.trim());
  return id;
}

export function deleteLocation(uid: string, id: string) {
  return deleteDoc(locationDoc(uid, id));
}

export async function saveExercisePreference(
  uid: string,
  ex: { name: string; group: "arms" | "upper" | "legs"; builtIn: boolean },
  lastEquipment: Equipment,
  lastCount: 1 | 2,
) {
  const ref = exerciseDoc(uid, slugify(ex.name));
  const existing = await getDoc(ref);
  await setDoc(
    ref,
    {
      ...ex, lastEquipment, lastCount, updatedAt: serverTimestamp(),
      ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true },
  );
}

export function deleteExercise(uid: string, name: string) {
  return deleteDoc(exerciseDoc(uid, slugify(name)));
}
