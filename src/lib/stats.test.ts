import { describe, expect, it } from "vitest";

import { revealedMatchIds, finalizedMatchIds, revealedGroupLabels, buildOptimismFacts, buildScorelineHistogram } from "./stats";
import type { Group, Match, Prediction, Profile } from "./types";

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

const profiles: Profile[] = [
  { id: "u1", displayName: "Ana", email: "a@x.com", approved: true, role: "user" },
  { id: "u2", displayName: "Beto", email: "b@x.com", approved: true, role: "user" },
];

function pred(userId: string, matchId: string, h: number, a: number): Prediction {
  return {
    id: `${userId}-${matchId}`, userId, matchId, homeScore: h, awayScore: a,
    winnerTeamId: null, points: null, exactHit: false, outcomeHit: false,
    createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
  };
}

describe("optimism facts", () => {
  const revealed = new Set(["m1", "m2"]);
  // Ana: 3+1 and 2+2 -> avg goals 4 per match; Beto: 0+0 and 1+0 -> avg 0.5
  const predictions = [
    pred("u1", "m1", 3, 1), pred("u1", "m2", 2, 2),
    pred("u2", "m1", 0, 0), pred("u2", "m2", 1, 0),
  ];

  it("optimista winner is the highest avg-goals predictor", () => {
    const { optimista } = buildOptimismFacts(profiles, predictions, revealed);
    expect(optimista.available).toBe(true);
    expect(optimista.winner?.user.id).toBe("u1");
    expect(optimista.winner?.value).toBe(4);
  });

  it("candado winner is the lowest avg-goals predictor", () => {
    const { candado } = buildOptimismFacts(profiles, predictions, revealed);
    expect(candado.winner?.user.id).toBe("u2");
  });

  it("sin-empates ranks by lowest draw percentage", () => {
    const { sinEmpates } = buildOptimismFacts(profiles, predictions, revealed);
    // Ana drew 1/2 = 50%, Beto drew 1/2 = 50% -> tie, both 50
    expect(sinEmpates.series.every((s) => s.value === 50)).toBe(true);
  });

  it("is unavailable when no revealed predictions exist", () => {
    const { optimista } = buildOptimismFacts(profiles, predictions, new Set());
    expect(optimista.available).toBe(false);
    expect(optimista.series).toEqual([]);
  });
});

describe("scoreline favorito", () => {
  it("counts predicted scorelines and finds the mode", () => {
    const revealed = new Set(["m1", "m2", "m3"]);
    const preds = [
      pred("u1", "m1", 2, 1), pred("u2", "m1", 2, 1),
      pred("u1", "m2", 2, 1), pred("u2", "m2", 0, 0),
      pred("u1", "m3", 1, 0), pred("u2", "m3", 2, 1),
    ];
    const { bins, mode, total } = buildScorelineHistogram(preds, revealed);
    expect(total).toBe(6);
    expect(mode?.label).toBe("2-1");
    expect(mode?.count).toBe(4);
    // bins sorted by count desc
    expect(bins[0]!.label).toBe("2-1");
  });
});
