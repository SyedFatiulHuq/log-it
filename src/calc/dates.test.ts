import { describe, expect, it } from "vitest";
import { localDateString, minutesBetween, slugify } from "./dates";

describe("dates", () => {
  it("formats local dates with zero padding", () => {
    expect(localDateString(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
  it("slugifies exercise and location names", () => {
    expect(slugify("  Romanian Deadlift! ")).toBe("romanian-deadlift");
    expect(slugify("***")).toBe("item");
  });
  it("computes whole minutes, never negative", () => {
    expect(minutesBetween(new Date(2026, 0, 1, 10, 0), new Date(2026, 0, 1, 11, 15))).toBe(75);
    expect(minutesBetween(new Date(2026, 0, 1, 11, 0), new Date(2026, 0, 1, 10, 0))).toBe(0);
  });
});
