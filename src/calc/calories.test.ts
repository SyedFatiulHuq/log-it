import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { actualRestPerSet, liftKcal, lbToKg, recalcSession, sessionEffort, swimKcal, swimDistance } from "./calories";
import type { LiftEntry, SwimEntry } from "../data/types";

const kg180 = lbToKg(180);
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.1);
const ts = Timestamp.fromDate(new Date("2026-01-01T10:00:00"));

const upper3x10: LiftEntry = {
  id: "l1", kind: "lift", loggedAt: ts, rpe: 7, kcalGross: 0, kcalNet: 0,
  exercise: "Chest press", group: "upper", equipment: "machine", count: 1, unit: "lb",
  sets: [{ weight: 100, reps: 10 }, { weight: 100, reps: 10 }, { weight: 100, reps: 10 }],
};

const swim: SwimEntry = {
  id: "s1", kind: "swim", loggedAt: ts, rpe: 5, kcalGross: 0, kcalNet: 0,
  group: "swim", pool: "25m", laps: { free: 4, back: 4 }, treadMinutes: 0,
};

describe("acceptance values, 180 lb person, fixed rest 90 s (§6.4)", () => {
  it("upper body, 3 sets x 10 reps", () => {
    const k = liftKcal(upper3x10.sets, 90, kg180, "upper");
    near(k.gross, 27.6);
    near(k.net, 19.4);
  });

  it("swim, 25 m pool, 4 laps free + 4 laps back", () => {
    const k = swimKcal(swim, kg180);
    near(k.gross, 114.7);
    near(k.net, 98.3);
  });
});

describe("group factors", () => {
  it("scales gross by group", () => {
    const sets = [{ weight: 10, reps: 10 }];
    const upper = liftKcal(sets, 90, kg180, "upper").gross;
    expect(liftKcal(sets, 90, kg180, "arms").gross).toBeCloseTo(upper * 0.8, 6);
    expect(liftKcal(sets, 90, kg180, "legs").gross).toBeCloseTo(upper * 1.3, 6);
  });
});

describe("swimming details", () => {
  it("scales by pool and counts treading water", () => {
    const base = swimKcal({ laps: { free: 2 }, pool: "25m", treadMinutes: 0 }, kg180).gross;
    expect(swimKcal({ laps: { free: 2 }, pool: "50m", treadMinutes: 0 }, kg180).gross).toBeCloseTo(base * 2, 6);
    expect(swimKcal({ laps: {}, pool: "25m", treadMinutes: 10 }, kg180).gross).toBeCloseTo((3.5 * kg180 * 600) / 3600, 6);
  });

  it("reports distance in the pool's unit", () => {
    expect(swimDistance({ laps: { free: 4, back: 4 }, pool: "25m", treadMinutes: 0 })).toEqual({ value: 400, unit: "m" });
    expect(swimDistance({ laps: { free: 2 }, pool: "25yd", treadMinutes: 0 })).toEqual({ value: 100, unit: "yd" });
    expect(swimDistance({ laps: { free: 1 }, pool: "50m", treadMinutes: 0 })).toEqual({ value: 100, unit: "m" });
  });
});

describe("actual rest (§6.3)", () => {
  it("clamps rest per set to 30..240 s", () => {
    expect(actualRestPerSet(60, [upper3x10])).toBe(30);
    expect(actualRestPerSet(10 * 3600, [upper3x10])).toBe(240);
    // (1800 - 90 work) / 3 sets = 570 -> clamped; use a tighter case
    expect(actualRestPerSet(90 + 3 * 120, [upper3x10])).toBeCloseTo(120, 6);
  });

  it("is null with no lifting sets", () => {
    expect(actualRestPerSet(3600, [swim])).toBeNull();
  });
});

describe("recalcSession", () => {
  it("rolls up totals, groups, volume and laps", () => {
    const { entries, totals } = recalcSession([upper3x10, swim], { bodyWeightKg: kg180, restSec: 90 });
    near(totals.kcalNet, 19.4 + 98.3);
    near(totals.kcalGross, 27.6 + 114.7);
    near(totals.byGroup.upper, 19.4);
    near(totals.byGroup.swim, 98.3);
    expect(totals.sets).toBe(3);
    expect(totals.laps).toBe(8);
    expect(totals.liftVolume).toBe(3000);
    near(entries[0].kcalNet, 19.4);
  });

  it("computes effort as mean RPE, 1 decimal", () => {
    expect(sessionEffort([upper3x10, swim])).toBe(6);
    expect(sessionEffort([{ ...upper3x10, rpe: null }])).toBeNull();
  });
});
