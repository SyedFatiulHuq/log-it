import type { Timestamp } from "firebase/firestore";

export type Unit = "lb" | "kg";
export type Pool = "25m" | "25yd" | "50m";
export type LiftGroup = "arms" | "upper" | "legs";
export type Group = LiftGroup | "swim";
export type Stroke = "free" | "back" | "breast" | "fly" | "kick";
export type Rating = 1 | 2 | 3 | 4 | 5;

export type Equipment =
  | "dumbbell" | "barbell" | "machine" | "cable"
  | "kettlebell" | "smith" | "bodyweight" | "band";

export interface Settings {
  bodyWeight: number;
  bodyUnit: Unit;
  liftUnit: Unit;
  restSec: number;
  restMode: "fixed" | "actual";
  calorieMode: "net" | "total";
  eatBackPct: number;
  defaultPool: Pool;
  forgotFinishHours: number;
  sheetId: string | null;
  updatedAt?: Timestamp;
}

export interface LiftSet {
  weight: number | null;
  reps: number;
}

interface BaseEntry {
  id: string;
  loggedAt: Timestamp;
  rpe: number | null;
  kcalGross: number;
  kcalNet: number;
}

export interface LiftEntry extends BaseEntry {
  kind: "lift";
  exercise: string;
  group: LiftGroup;
  equipment: Equipment;
  count: 1 | 2;
  unit: Unit;
  bandLabel?: string;
  sets: LiftSet[];
}

export interface SwimEntry extends BaseEntry {
  kind: "swim";
  group: "swim";
  pool: Pool;
  laps: Partial<Record<Stroke, number>>;
  treadMinutes: number;
}

export type Entry = LiftEntry | SwimEntry;

export interface SessionTotals {
  kcalGross: number;
  kcalNet: number;
  byGroup: Record<Group, number>;
  sets: number;
  laps: number;
  liftVolume: number;
}

export interface Session {
  status: "active" | "finished";
  date: string;
  startedAt: Timestamp;
  endedAt: Timestamp | null;
  durationMin: number | null;
  locationId: string | null;
  locationName: string | null;
  bodyWeightKg: number;
  energy: Rating | null;
  sleep: Rating | null;
  mood: Rating | null;
  effort: number | null;
  journal: string;
  entries: Entry[];
  totals: SessionTotals;
  sheetSync?: { state: "ok" | "error"; syncedAt: Timestamp; error?: string };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
