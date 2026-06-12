import { describe, expect, it } from "vitest";

import { revealedMatchIds, finalizedMatchIds, revealedGroupLabels } from "./stats";
import type { Group, Match } from "./types";

const now = new Date("2026-06-12T12:00:00.000Z");

function match(id: string, over: Partial<Match> = {}): Match {
  return {
    id, matchNo: 1, stage: "round16",
    homeTeamId: "arg", awayTeamId: "fra",
    kickoffUtc: "2026-06-10T00:00:00.000Z", // past → locked
    status: "open",
    homeScore: null, awayScore: null, winnerTeamId: null,
    finalizedAt: null, finalizedBy: null, updatedAt: null, updatedBy: null,
    ...over,
  };
}

describe("visibility helpers", () => {
  it("treats past-kickoff matches as revealed (locked) and future as hidden", () => {
    const locked = match("locked");
    const open = match("open", { kickoffUtc: "2026-07-01T00:00:00.000Z" });
    const ids = revealedMatchIds([locked, open], now);
    expect(ids.has("locked")).toBe(true);
    expect(ids.has("open")).toBe(false);
  });

  it("finalizedMatchIds only includes finalized matches", () => {
    const fin = match("fin", { status: "finalized" });
    const locked = match("locked");
    const ids = finalizedMatchIds([fin, locked], now);
    expect(ids.has("fin")).toBe(true);
    expect(ids.has("locked")).toBe(false);
  });

  it("revealedGroupLabels includes locked and finalized groups only", () => {
    const open: Group = { groupLabel: "A", locksAt: "2026-07-01T00:00:00.000Z", firstTeamId: null, secondTeamId: null, thirdTeamId: null, fourthTeamId: null, resultFinalizedAt: null, resultFinalizedBy: null };
    const locked: Group = { ...open, groupLabel: "B", locksAt: "2026-06-01T00:00:00.000Z" };
    const labels = revealedGroupLabels([open, locked], now);
    expect(labels.has("A")).toBe(false);
    expect(labels.has("B")).toBe(true);
  });
});
