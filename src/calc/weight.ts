import type { Equipment, LiftEntry, LiftSet, Unit } from "../data/types";

const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

export const supportsPair = (eq: Equipment) => eq === "dumbbell" || eq === "kettlebell";

/** Weight actually moved per rep, for volume (§5.3 table). */
export function volumePerRep(eq: Equipment, count: 1 | 2, weight: number | null): number {
  if (weight == null) return 0;
  switch (eq) {
    case "dumbbell":
    case "kettlebell":
      return weight * count;
    case "band":
      return 0;
    default:
      return weight; // barbell, smith, machine, cable, bodyweight (added weight)
  }
}

export function setVolume(e: Pick<LiftEntry, "equipment" | "count">, s: LiftSet): number {
  return volumePerRep(e.equipment, e.count, s.weight) * s.reps;
}

export function liftVolume(e: Pick<LiftEntry, "equipment" | "count" | "sets">): number {
  return e.sets.reduce((n, s) => n + setVolume(e, s), 0);
}

/** Weight value only, e.g. `12+12`, `95`, `BW`, `BW+20`, `medium band`. */
export function formatWeightValue(
  e: Pick<LiftEntry, "equipment" | "count" | "bandLabel">,
  weight: number | null,
): string {
  switch (e.equipment) {
    case "dumbbell":
    case "kettlebell":
      if (weight == null) return "–";
      return e.count === 2 ? `${num(weight)}+${num(weight)}` : num(weight);
    case "bodyweight":
      return weight ? `BW+${num(weight)}` : "BW";
    case "band":
      return e.bandLabel ? `${e.bandLabel} band` : "band";
    default:
      return weight == null ? "–" : num(weight);
  }
}

/** Full weight with unit, e.g. `12+12 lb`, `BW`, `medium band`. */
export function formatWeight(e: Pick<LiftEntry, "equipment" | "count" | "bandLabel" | "unit">, weight: number | null): string {
  const v = formatWeightValue(e, weight);
  if (e.equipment === "band" || v === "BW" || v === "–") return v;
  return `${v} ${e.unit}`;
}

/**
 * Compact set summary for entry rows (§7.3):
 *  same weight throughout → `12+12 lb × 10, 10, 8`
 *  varying weight         → `25×8 · 25×5 · 15×4 lb`
 */
export function formatSets(e: Pick<LiftEntry, "equipment" | "count" | "bandLabel" | "unit" | "sets">): string {
  const { sets } = e;
  if (sets.length === 0) return "";
  if (e.equipment === "band") {
    return `${formatWeightValue(e, null)} × ${sets.map((s) => s.reps).join(", ")}`;
  }
  const first = sets[0].weight;
  const same = sets.every((s) => s.weight === first);
  if (same) return `${formatWeight(e, first)} × ${sets.map((s) => s.reps).join(", ")}`;
  const parts = sets.map((s) => `${formatWeightValue(e, s.weight)}×${s.reps}`).join(" · ");
  return `${parts} ${e.unit}`;
}

export function convertWeight(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;
  return from === "lb" ? value * 0.45359237 : value / 0.45359237;
}
