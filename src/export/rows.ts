import type { Session, Stroke } from "../data/types";

/** Spreadsheet cell values. Shared in shape with functions/src/rows.ts (keep in sync). */
export type Cell = string | number | null;

export const SESSION_HEADERS = [
  "SessionId", "Date", "Location", "Start", "End", "Duration (min)", "Energy", "Sleep", "Mood",
  "Effort (avg RPE)", "Entries", "Sets", "Laps", "Lift volume", "Kcal net", "Kcal total",
  "Kcal arms", "Kcal upper", "Kcal legs", "Kcal swim", "Journal",
];

export const LIFTING_HEADERS = [
  "SessionId", "EntryId", "Date", "Location", "Logged at", "Exercise", "Group", "Equipment", "Count", "Set #",
  "Weight each", "Total weight", "Unit", "Band", "Reps", "Volume", "RPE", "Entry kcal net", "Entry kcal total",
];

export const SWIMMING_HEADERS = [
  "SessionId", "EntryId", "Date", "Location", "Logged at", "Stroke", "Laps or minutes", "Pool", "Distance",
  "RPE", "Entry kcal net", "Entry kcal total",
];

export const WEIGHT_HEADERS = ["Date", "Weight", "Unit", "Weight (lb)", "Weight (kg)"];

const STROKE_NAME: Record<Stroke, string> = {
  free: "Freestyle", back: "Backstroke", breast: "Breaststroke", fly: "Butterfly", kick: "Kickboard",
};
const STROKES: Stroke[] = ["free", "back", "breast", "fly", "kick"];

const p2 = (n: number) => String(n).padStart(2, "0");
export const stamp = (d: Date) =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Stops spreadsheet apps from treating user text as a formula. */
export const safeText = (s: string): string => (/^[=+\-@]/.test(s) ? `'${s}` : s);

export function sessionRow(id: string, s: Session): Cell[] {
  const t = s.totals;
  return [
    id, s.date, s.locationName ?? "", stamp(s.startedAt.toDate()), s.endedAt ? stamp(s.endedAt.toDate()) : "",
    s.durationMin, s.energy, s.sleep, s.mood, s.effort, s.entries.length, t.sets, t.laps, r1(t.liftVolume),
    r1(t.kcalNet), r1(t.kcalGross), r1(t.byGroup.arms), r1(t.byGroup.upper), r1(t.byGroup.legs), r1(t.byGroup.swim),
    safeText(s.journal),
  ];
}

export function liftingRows(id: string, s: Session): Cell[][] {
  const rows: Cell[][] = [];
  for (const e of s.entries) {
    if (e.kind !== "lift") continue;
    e.sets.forEach((set, i) => {
      const w = set.weight;
      const each = e.equipment === "band" ? null : w;
      const total = e.equipment === "band" || w == null ? null : e.equipment === "dumbbell" || e.equipment === "kettlebell" ? w * e.count : w;
      const perRep = total ?? 0;
      rows.push([
        id, e.id, s.date, s.locationName ?? "", stamp(e.loggedAt.toDate()), e.exercise, e.group, e.equipment,
        e.count, i + 1, each, total, e.unit, e.bandLabel ?? "", set.reps, r1(perRep * set.reps), e.rpe,
        r1(e.kcalNet), r1(e.kcalGross),
      ]);
    });
  }
  return rows;
}

export function swimmingRows(id: string, s: Session): Cell[][] {
  const rows: Cell[][] = [];
  for (const e of s.entries) {
    if (e.kind !== "swim") continue;
    const lapLen = e.pool === "50m" ? 100 : 50;
    const unit = e.pool === "25yd" ? "yd" : "m";
    const base = [id, e.id, s.date, s.locationName ?? "", stamp(e.loggedAt.toDate())] as Cell[];
    const tail = [e.rpe, r1(e.kcalNet), r1(e.kcalGross)] as Cell[];
    for (const st of STROKES) {
      const laps = e.laps[st] ?? 0;
      if (laps > 0) rows.push([...base, STROKE_NAME[st], laps, e.pool, `${laps * lapLen} ${unit}`, ...tail]);
    }
    if (e.treadMinutes > 0) rows.push([...base, "Treading water", e.treadMinutes, e.pool, "", ...tail]);
  }
  return rows;
}

export function weightRow(w: { date: string; weight: number; unit: "lb" | "kg" }): Cell[] {
  const kg = w.unit === "kg" ? w.weight : w.weight * 0.45359237;
  const lb = w.unit === "lb" ? w.weight : w.weight / 0.45359237;
  return [w.date, w.weight, w.unit, r1(lb), r1(kg)];
}
