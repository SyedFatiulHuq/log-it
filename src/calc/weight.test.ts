import { describe, expect, it } from "vitest";
import { formatSets, formatWeight, liftVolume } from "./weight";

const base = { unit: "lb" as const, count: 1 as const };

describe("formatWeight (§5.3 table)", () => {
  it("dumbbell pair vs one", () => {
    expect(formatWeight({ ...base, equipment: "dumbbell", count: 2 }, 12)).toBe("12+12 lb");
    expect(formatWeight({ ...base, equipment: "dumbbell" }, 12)).toBe("12 lb");
  });
  it("barbell, machine", () => {
    expect(formatWeight({ ...base, equipment: "barbell" }, 95)).toBe("95 lb");
    expect(formatWeight({ ...base, equipment: "machine" }, 25)).toBe("25 lb");
  });
  it("bodyweight with and without added weight", () => {
    expect(formatWeight({ ...base, equipment: "bodyweight" }, null)).toBe("BW");
    expect(formatWeight({ ...base, equipment: "bodyweight" }, 20)).toBe("BW+20 lb");
  });
  it("band", () => {
    expect(formatWeight({ ...base, equipment: "band", bandLabel: "medium" }, null)).toBe("medium band");
  });
});

describe("formatSets", () => {
  it("same weight", () => {
    const e = { ...base, equipment: "dumbbell" as const, count: 2 as const, sets: [10, 10, 8].map((reps) => ({ weight: 12, reps })) };
    expect(formatSets(e)).toBe("12+12 lb × 10, 10, 8");
  });
  it("varying weight", () => {
    const e = {
      ...base, equipment: "machine" as const,
      sets: [{ weight: 25, reps: 8 }, { weight: 25, reps: 5 }, { weight: 15, reps: 4 }],
    };
    expect(formatSets(e)).toBe("25×8 · 25×5 · 15×4 lb");
  });
});

describe("liftVolume", () => {
  it("multiplies by count for dumbbell pairs", () => {
    expect(liftVolume({ equipment: "dumbbell", count: 2, sets: [{ weight: 12, reps: 10 }] })).toBe(240);
  });
  it("is added weight only for bodyweight, 0 for band", () => {
    expect(liftVolume({ equipment: "bodyweight", count: 1, sets: [{ weight: null, reps: 10 }] })).toBe(0);
    expect(liftVolume({ equipment: "bodyweight", count: 1, sets: [{ weight: 20, reps: 5 }] })).toBe(100);
    expect(liftVolume({ equipment: "band", count: 1, sets: [{ weight: null, reps: 15 }] })).toBe(0);
  });
});
