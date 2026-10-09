import type { Group, Settings } from "../data/types";

export const GROUPS: Group[] = ["arms", "upper", "legs", "swim"];
export const groupColor = (g: Group) => `var(--${g})`;

export const fmtKcal = (n: number) => String(Math.round(n));

/** Net or total, according to settings.calorieMode. */
export const shownKcal = (s: Pick<Settings, "calorieMode">, gross: number, net: number) =>
  s.calorieMode === "net" ? net : gross;

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** "YYYY-MM-DD" → "Mon, Oct 9". */
export function fmtDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export function fmtDuration(min: number | null): string {
  if (min == null) return "–";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`;
}

/** Date → value for <input type="datetime-local">. */
export function toInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromInputValue(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const num1 = (n: number) => (Math.round(n * 10) / 10).toString();

export const EQUIPMENT_LABEL: Record<string, string> = {
  dumbbell: "Dumbbell", barbell: "Barbell", machine: "Machine", cable: "Cable",
  kettlebell: "Kettlebell", smith: "Smith machine", bodyweight: "Bodyweight", band: "Band",
};

export const STROKE_LABEL: Record<string, string> = {
  free: "Freestyle", back: "Backstroke", breast: "Breaststroke", fly: "Butterfly", kick: "Kickboard",
};
