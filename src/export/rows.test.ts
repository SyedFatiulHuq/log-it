import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Session } from "../data/types";
import { liftingRows, safeText, swimmingRows } from "./rows";
import { weekStart } from "./summary";

const ts = Timestamp.fromDate(new Date(2026, 0, 5, 10, 30));
const session = {
  date: "2026-01-05", locationName: "Campus gym",
  entries: [
    {
      id: "e1", kind: "lift", loggedAt: ts, rpe: 8, kcalGross: 10, kcalNet: 7, exercise: "Bicep curl", group: "arms",
      equipment: "dumbbell", count: 2, unit: "lb", sets: [{ weight: 12, reps: 10 }, { weight: 12, reps: 8 }],
    },
    {
      id: "e2", kind: "swim", group: "swim", loggedAt: ts, rpe: null, kcalGross: 50, kcalNet: 40, pool: "25yd",
      laps: { free: 4 }, treadMinutes: 5,
    },
  ],
} as unknown as Session;

describe("export rows", () => {
  it("emits one lifting row per set with total weight = each x count", () => {
    const rows = liftingRows("s1", session);
    expect(rows).toHaveLength(2);
    expect(rows[0].slice(8, 16)).toEqual([2, 1, 12, 24, "lb", "", 10, 240]);
  });

  it("emits one swimming row per stroke plus treading water", () => {
    const rows = swimmingRows("s1", session);
    expect(rows.map((r) => r[5])).toEqual(["Freestyle", "Treading water"]);
    expect(rows[0][8]).toBe("200 yd");
  });

  it("guards against formula injection", () => {
    expect(safeText("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(safeText("felt good")).toBe("felt good");
  });

  it("finds the Monday of a week", () => {
    expect(weekStart("2026-01-04")).toBe("2025-12-29"); // Sunday
    expect(weekStart("2026-01-05")).toBe("2026-01-05"); // Monday
  });
});
