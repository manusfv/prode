import { describe, expect, it } from "vitest";

import { getInitials, podiumOrder } from "./standings";

describe("getInitials", () => {
  it("uppercases the first letter of a single-word name", () => {
    expect(getInitials("marcos")).toBe("M");
  });

  it("uses the first letters of the first two words", () => {
    expect(getInitials("Lucía Pérez")).toBe("LP");
  });

  it("ignores words beyond the first two", () => {
    expect(getInitials("Ana María López")).toBe("AM");
  });

  it("collapses and trims surrounding whitespace", () => {
    expect(getInitials("  diego   gómez  ")).toBe("DG");
  });

  it("falls back to '?' for an empty or blank name", () => {
    expect(getInitials("")).toBe("?");
    expect(getInitials("   ")).toBe("?");
  });
});

describe("podiumOrder", () => {
  it("reorders three rows to second, first, third (raised center)", () => {
    expect(podiumOrder(["first", "second", "third"])).toEqual(["second", "first", "third"]);
  });

  it("returns two rows unchanged", () => {
    expect(podiumOrder(["first", "second"])).toEqual(["first", "second"]);
  });

  it("returns one row unchanged", () => {
    expect(podiumOrder(["first"])).toEqual(["first"]);
  });

  it("returns an empty array unchanged", () => {
    expect(podiumOrder([])).toEqual([]);
  });
});
