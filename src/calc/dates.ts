/** Local "YYYY-MM-DD" for a Date. */
export function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}
