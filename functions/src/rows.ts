// Row shaping for the sheet mirror. Mirrors ../../src/export/rows.ts (keep the two in sync).
export type Cell = string | number | null;
type Ts = { toDate(): Date };

interface LiftEntry {
  kind: "lift"; id: string; loggedAt: Ts; rpe: number | null; kcalGross: number; kcalNet: number;
  exercise: string; group: string; equipment: string; count: number; unit: string; bandLabel?: string;
  sets: { weight: number | null; reps: number }[];
}
interface SwimEntry {
  kind: "swim"; id: string; loggedAt: Ts; rpe: number | null; kcalGross: number; kcalNet: number;
  pool: string; laps: Record<string, number | undefined>; treadMinutes: number;
}
export interface SessionDoc {
  status: string; date: string; startedAt: Ts; endedAt: Ts | null; durationMin: number | null;
  locationName: string | null; energy: number | null; sleep: number | null; mood: number | null;
  effort: number | null; journal: string; entries: (LiftEntry | SwimEntry)[];
  totals: {
    kcalGross: number; kcalNet: number; sets: number; laps: number; liftVolume: number;
    byGroup: { arms: number; upper: number; legs: number; swim: number };
  };
}
export interface WeightDoc { date: string; weight: number; unit: "lb" | "kg" }

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

const STROKE_NAME: Record<string, string> = {
  free: "Freestyle", back: "Backstroke", breast: "Breaststroke", fly: "Butterfly", kick: "Kickboard",
};
const STROKES = ["free", "back", "breast", "fly", "kick"];

// Cloud Functions run in UTC; the sheet shows the user's local time via the stored `date`, and
// times are formatted in the America/Los_Angeles zone to match a US gym schedule.
const TZ = "America/Los_Angeles";
export const stamp = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(d);

const r1 = (n: number) => Math.round(n * 10) / 10;
const safeText = (s: string) => (/^[=+\-@]/.test(s) ? `'${s}` : s);

export function sessionRow(id: string, s: SessionDoc): Cell[] {
  const t = s.totals;
  return [
    id, s.date, s.locationName ?? "", stamp(s.startedAt.toDate()), s.endedAt ? stamp(s.endedAt.toDate()) : "",
    s.durationMin, s.energy, s.sleep, s.mood, s.effort, s.entries.length, t.sets, t.laps, r1(t.liftVolume),
    r1(t.kcalNet), r1(t.kcalGross), r1(t.byGroup.arms), r1(t.byGroup.upper), r1(t.byGroup.legs), r1(t.byGroup.swim),
    safeText(s.journal ?? ""),
  ];
}

export function liftingRows(id: string, s: SessionDoc): Cell[][] {
  const rows: Cell[][] = [];
  for (const e of s.entries) {
    if (e.kind !== "lift") continue;
    e.sets.forEach((set, i) => {
      const w = set.weight;
      const each = e.equipment === "band" ? null : w;
      const pair = e.equipment === "dumbbell" || e.equipment === "kettlebell";
      const total = e.equipment === "band" || w == null ? null : pair ? w * e.count : w;
      rows.push([
        id, e.id, s.date, s.locationName ?? "", stamp(e.loggedAt.toDate()), e.exercise, e.group, e.equipment,
        e.count, i + 1, each, total, e.unit, e.bandLabel ?? "", set.reps, r1((total ?? 0) * set.reps), e.rpe,
        r1(e.kcalNet), r1(e.kcalGross),
      ]);
    });
  }
  return rows;
}

export function swimmingRows(id: string, s: SessionDoc): Cell[][] {
  const rows: Cell[][] = [];
  for (const e of s.entries) {
    if (e.kind !== "swim") continue;
    const lapLen = e.pool === "50m" ? 100 : 50;
    const unit = e.pool === "25yd" ? "yd" : "m";
    const base: Cell[] = [id, e.id, s.date, s.locationName ?? "", stamp(e.loggedAt.toDate())];
    const tail: Cell[] = [e.rpe, r1(e.kcalNet), r1(e.kcalGross)];
    for (const st of STROKES) {
      const laps = e.laps[st] ?? 0;
      if (laps > 0) rows.push([...base, STROKE_NAME[st], laps, e.pool, `${laps * lapLen} ${unit}`, ...tail]);
    }
    if (e.treadMinutes > 0) rows.push([...base, "Treading water", e.treadMinutes, e.pool, "", ...tail]);
  }
  return rows;
}

export function weightRow(w: WeightDoc): Cell[] {
  const kg = w.unit === "kg" ? w.weight : w.weight * 0.45359237;
  const lb = w.unit === "lb" ? w.weight : w.weight / 0.45359237;
  return [w.date, w.weight, w.unit, r1(lb), r1(kg)];
}
