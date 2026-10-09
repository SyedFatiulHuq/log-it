import type { Session } from "../data/types";
import type { Cell } from "./rows";

export const DAILY_HEADERS = [
  "Date", "Body weight", "Sessions", "Duration (min)", "Net kcal", "Eat-back kcal", "Sets", "Laps",
  "Lift volume", "Avg mood", "Avg effort",
];
export const WEEKLY_HEADERS = [
  "Week start (Mon)", "Active days", "Sessions", "Kcal arms", "Kcal upper", "Kcal legs", "Kcal swim",
  "Net kcal", "Avg effort",
];

const r1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Monday of the week containing "YYYY-MM-DD". */
export function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export function dailyRows(
  sessions: Session[], weights: { date: string; weight: number }[], eatBackPct: number,
): Cell[][] {
  const wMap = new Map(weights.map((w) => [w.date, w.weight]));
  const dates = [...new Set(sessions.map((s) => s.date))].sort();
  return dates.map((date) => {
    const ss = sessions.filter((s) => s.date === date);
    const net = ss.reduce((n, s) => n + s.totals.kcalNet, 0);
    return [
      date,
      wMap.get(date) ?? null,
      ss.length,
      ss.reduce((n, s) => n + (s.durationMin ?? 0), 0),
      r1(net),
      r1((net * eatBackPct) / 100),
      ss.reduce((n, s) => n + s.totals.sets, 0),
      ss.reduce((n, s) => n + s.totals.laps, 0),
      r1(ss.reduce((n, s) => n + s.totals.liftVolume, 0)),
      mean(ss.map((s) => s.mood).filter((v): v is NonNullable<typeof v> => v != null)),
      mean(ss.map((s) => s.effort).filter((v): v is number => v != null)),
    ];
  });
}

export function weeklyRows(sessions: Session[]): Cell[][] {
  const weeks = [...new Set(sessions.map((s) => weekStart(s.date)))].sort();
  return weeks.map((wk) => {
    const ss = sessions.filter((s) => weekStart(s.date) === wk);
    const g = (k: "arms" | "upper" | "legs" | "swim") => r1(ss.reduce((n, s) => n + s.totals.byGroup[k], 0));
    return [
      wk,
      new Set(ss.map((s) => s.date)).size,
      ss.length,
      g("arms"), g("upper"), g("legs"), g("swim"),
      r1(ss.reduce((n, s) => n + s.totals.kcalNet, 0)),
      mean(ss.map((s) => s.effort).filter((v): v is number => v != null)),
    ];
  });
}
