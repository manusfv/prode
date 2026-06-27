import { describe, expect, it } from "vitest";
import type { Group } from "./types";
import { getGroupStatus, hasGroupOrder, isGroupProvisional, stepScore } from "./tournament";

describe("stepScore", () => {
  it("starts at 0 when incrementing from empty", () => {
    expect(stepScore(null, 1)).toBe(0);
  });

  it("increments an existing score", () => {
    expect(stepScore(0, 1)).toBe(1);
    expect(stepScore(2, 1)).toBe(3);
  });

  it("decrements an existing score", () => {
    expect(stepScore(3, -1)).toBe(2);
  });

  it("clears to empty when decrementing from 0", () => {
    expect(stepScore(0, -1)).toBeNull();
  });

  it("stays empty when decrementing from empty", () => {
    expect(stepScore(null, -1)).toBeNull();
  });
});

describe("getGroupStatus", () => {
  const group: Group = {
    groupLabel: "A",
    locksAt: "2026-06-11T22:00:00.000Z",
    firstTeamId: null,
    secondTeamId: null,
    thirdTeamId: null,
    fourthTeamId: null,
    resultFinalizedAt: null,
    resultFinalizedBy: null,
    resultSource: null,
  };

  it("is open before the lock time", () => {
    expect(getGroupStatus(group, new Date("2026-06-11T21:59:00.000Z"))).toBe("open");
  });

  it("is locked at or after the lock time", () => {
    expect(getGroupStatus(group, new Date("2026-06-11T22:00:00.000Z"))).toBe("locked");
  });

  it("is open when no lock time is set", () => {
    expect(getGroupStatus({ ...group, locksAt: null }, new Date("2030-01-01T00:00:00.000Z"))).toBe(
      "open",
    );
  });

  it("is finalized once a result is recorded", () => {
    expect(
      getGroupStatus(
        { ...group, resultFinalizedAt: "2026-06-25T00:00:00.000Z" },
        new Date("2026-06-11T21:00:00.000Z"),
      ),
    ).toBe("finalized");
  });
});

function testGroup(overrides: Partial<Group> = {}): Group {
  return {
    groupLabel: "A",
    locksAt: null,
    firstTeamId: null,
    secondTeamId: null,
    thirdTeamId: null,
    fourthTeamId: null,
    resultFinalizedAt: null,
    resultFinalizedBy: null,
    resultSource: null,
    ...overrides,
  };
}

describe("hasGroupOrder", () => {
  it("is false when any slot is null", () => {
    expect(hasGroupOrder(testGroup({ firstTeamId: "t1", secondTeamId: "t2", thirdTeamId: "t3" }))).toBe(false);
  });

  it("is true when all four slots are set", () => {
    expect(
      hasGroupOrder(testGroup({ firstTeamId: "t1", secondTeamId: "t2", thirdTeamId: "t3", fourthTeamId: "t4" })),
    ).toBe(true);
  });
});

describe("isGroupProvisional", () => {
  const full = { firstTeamId: "t1", secondTeamId: "t2", thirdTeamId: "t3", fourthTeamId: "t4" };

  it("is false when the order is incomplete", () => {
    expect(isGroupProvisional(testGroup({ firstTeamId: "t1" }))).toBe(false);
  });

  it("is true when complete and not finalized", () => {
    expect(isGroupProvisional(testGroup(full))).toBe(true);
  });

  it("is false when finalized", () => {
    expect(isGroupProvisional(testGroup({ ...full, resultFinalizedAt: "2026-06-13T00:00:00Z" }))).toBe(false);
  });
});
