import type { Entry, Group, LiftGroup, LiftSet, Pool, SessionTotals, Stroke, SwimEntry } from "../data/types";
import { liftVolume } from "./weight";

// ---- constants (SPEC §6) -------------------------------------------------

export const LB_PER_KG = 1 / 0.45359237;
export const lbToKg = (lb: number) => lb * 0.45359237;
export const kgToLb = (kg: number) => kg / 0.45359237;

export const SEC_PER_REP = 3;
export const MET_WORK = 6.0;
export const MET_REST = 2.5;

export const GROUP_FACTOR: Record<LiftGroup, number> = { arms: 0.8, upper: 1.0, legs: 1.3 };

export const STROKE_MET: Record<Stroke, number> = { free: 8.3, back: 6.0, breast: 7.0, fly: 13.8, kick: 6.0 };
/** Seconds per 25 m length. */
export const STROKE_PACE: Record<Stroke, number> = { free: 40, back: 50, breast: 50, fly: 45, kick: 60 };
export const TREAD_MET = 3.5;
export const POOL_SCALE: Record<Pool, number> = { "25m": 1.0, "25yd": 0.914, "50m": 2.0 };

export const STROKES: Stroke[] = ["free", "back", "breast", "fly", "kick"];

export interface Kcal {
  gross: number;
  net: number;
}

const ZERO: Kcal = { gross: 0, net: 0 };
const add = (a: Kcal, b: Kcal): Kcal => ({ gross: a.gross + b.gross, net: a.net + b.net });

// ---- lifting (§6.1) ------------------------------------------------------

export function liftSetKcal(reps: number, restSec: number, bodyWeightKg: number, group: LiftGroup): Kcal {
  const workSec = reps * SEC_PER_REP;
  const gross = (bodyWeightKg * (MET_WORK * workSec + MET_REST * restSec)) / 3600 * GROUP_FACTOR[group];
  const sit = (bodyWeightKg * (workSec + restSec)) / 3600;
  return { gross, net: Math.max(0, gross - sit) };
}

export function liftKcal(sets: LiftSet[], restSec: number, bodyWeightKg: number, group: LiftGroup): Kcal {
  return sets.reduce((acc, s) => add(acc, liftSetKcal(s.reps, restSec, bodyWeightKg, group)), ZERO);
}

export function liftWorkSeconds(sets: LiftSet[]): number {
  return sets.reduce((n, s) => n + s.reps * SEC_PER_REP, 0);
}

// ---- swimming (§6.2) -----------------------------------------------------

type SwimInput = Pick<SwimEntry, "laps" | "pool" | "treadMinutes">;

export function strokeSeconds(stroke: Stroke, laps: number, pool: Pool): number {
  return laps * 2 * STROKE_PACE[stroke] * POOL_SCALE[pool];
}

export function swimSeconds(e: SwimInput): number {
  const strokes = STROKES.reduce((n, s) => n + strokeSeconds(s, e.laps[s] ?? 0, e.pool), 0);
  return strokes + e.treadMinutes * 60;
}

export function swimKcal(e: SwimInput, bodyWeightKg: number): Kcal {
  let gross = 0;
  let sit = 0;
  for (const s of STROKES) {
    const sec = strokeSeconds(s, e.laps[s] ?? 0, e.pool);
    gross += (STROKE_MET[s] * bodyWeightKg * sec) / 3600;
    sit += (bodyWeightKg * sec) / 3600;
  }
  const treadSec = e.treadMinutes * 60;
  gross += (TREAD_MET * bodyWeightKg * treadSec) / 3600;
  sit += (bodyWeightKg * treadSec) / 3600;
  return { gross, net: Math.max(0, gross - sit) };
}

export function totalLaps(e: Pick<SwimEntry, "laps">): number {
  return STROKES.reduce((n, s) => n + (e.laps[s] ?? 0), 0);
}

/** Pool distance for one lap (there and back) in the pool's own unit. */
export function swimDistance(e: SwimInput): { value: number; unit: "m" | "yd" } {
  const lapLen = e.pool === "50m" ? 100 : 50; // there and back
  return { value: totalLaps(e) * lapLen, unit: e.pool === "25yd" ? "yd" : "m" };
}

// ---- rest time (§6.3) ----------------------------------------------------

export function actualRestPerSet(durationSec: number, entries: Entry[]): number | null {
  let totalSets = 0;
  let liftSec = 0;
  let swimSec = 0;
  for (const e of entries) {
    if (e.kind === "lift") {
      totalSets += e.sets.length;
      liftSec += liftWorkSeconds(e.sets);
    } else {
      swimSec += swimSeconds(e);
    }
  }
  if (totalSets === 0) return null;
  const available = durationSec - liftSec - swimSec;
  return Math.min(240, Math.max(30, available / totalSets));
}

// ---- session roll-up -----------------------------------------------------

export interface RecalcOptions {
  bodyWeightKg: number;
  restSec: number;
  /** When set (restMode "actual" on a finished session), overrides restSec for lifting. */
  durationSec?: number | null;
}

/** Recomputes every entry's kcal and the session totals. Pure; returns new objects. */
export function recalcSession(
  entries: Entry[],
  opts: RecalcOptions,
): { entries: Entry[]; totals: SessionTotals } {
  const rest =
    opts.durationSec != null ? (actualRestPerSet(opts.durationSec, entries) ?? opts.restSec) : opts.restSec;

  const totals: SessionTotals = {
    kcalGross: 0,
    kcalNet: 0,
    byGroup: { arms: 0, upper: 0, legs: 0, swim: 0 },
    sets: 0,
    laps: 0,
    liftVolume: 0,
  };

  const out = entries.map((e): Entry => {
    const k = e.kind === "lift" ? liftKcal(e.sets, rest, opts.bodyWeightKg, e.group) : swimKcal(e, opts.bodyWeightKg);
    const group: Group = e.group;
    totals.kcalGross += k.gross;
    totals.kcalNet += k.net;
    totals.byGroup[group] += k.net;
    if (e.kind === "lift") {
      totals.sets += e.sets.length;
      totals.liftVolume += liftVolume(e);
    } else {
      totals.laps += totalLaps(e);
    }
    return { ...e, kcalGross: k.gross, kcalNet: k.net };
  });

  return { entries: out, totals };
}

/** Mean RPE of entries that have one, 1 decimal; null if none. */
export function sessionEffort(entries: Entry[]): number | null {
  const r = entries.map((e) => e.rpe).filter((v): v is number => v != null);
  if (r.length === 0) return null;
  return Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 10) / 10;
}
