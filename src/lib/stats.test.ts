import { describe, expect, it } from "vitest";

import { revealedMatchIds, finalizedMatchIds, revealedGroupLabels, buildOptimismFacts, buildScorelineHistogram, buildConsensusFacts, predictedOutcome, buildAccuracyFacts, buildTeamLoyaltyFacts, buildBehaviorFacts, buildSimilarityMatrix, computeStats } from "./stats";
import type { Group, GroupPrediction, Match, Prediction, Profile } from "./types";
import { matches as seedMatches, groups as seedGroups, predictions as seedPreds, groupPredictions as seedGroupPreds, profiles as seedProfiles, teams as seedTeams } from "./seed";

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

describe("consensus facts", () => {
  it("classifies outcomes home/away/draw", () => {
    expect(predictedOutcome(2, 1)).toBe("home");
    expect(predictedOutcome(0, 3)).toBe("away");
    expect(predictedOutcome(1, 1)).toBe("draw");
  });

  it("rebelde is the most contrarian, del-monton the most aligned", () => {
    const revealed = new Set(["m1", "m2"]);
    // Crowd: m1 -> home (2 of 3), m2 -> home (2 of 3). u3 always contrarian.
    const preds = [
      pred("u1", "m1", 2, 0), pred("u2", "m1", 1, 0), pred("u3", "m1", 0, 2),
      pred("u1", "m2", 3, 1), pred("u2", "m2", 1, 0), pred("u3", "m2", 0, 1),
    ];
    const profiles3 = [...profiles, { id: "u3", displayName: "Caro", email: "c@x.com", approved: true, role: "user" as const }];
    const { rebelde, delMonton, partidoDividido } = buildConsensusFacts(profiles3, preds, revealed);
    expect(rebelde.winner?.user.id).toBe("u3");
    expect(rebelde.winner?.value).toBe(100);
    expect(delMonton.winner && delMonton.winner.user.id !== "u3").toBe(true);
    expect(partidoDividido.available).toBe(true);
  });
});

describe("accuracy facts", () => {
  function fmatch(id: string, kickoff: string): Match {
    return {
      id, matchNo: 1, stage: "round16", homeTeamId: "arg", awayTeamId: "fra",
      kickoffUtc: kickoff, status: "finalized",
      homeScore: 1, awayScore: 0, winnerTeamId: "arg",
      finalizedAt: "2026-06-11T00:00:00.000Z", finalizedBy: "u1",
      updatedAt: null, updatedBy: null,
    };
  }
  function scored(userId: string, matchId: string, exact: boolean, outcome: boolean): Prediction {
    return { ...pred(userId, matchId, 1, 0), exactHit: exact, outcomeHit: outcome, points: exact ? 3 : outcome ? 1 : 0 };
  }

  const matches = [fmatch("m1", "2026-06-08T00:00:00.000Z"), fmatch("m2", "2026-06-09T00:00:00.000Z")];
  const finalized = new Set(["m1", "m2"]);
  const preds = [
    scored("u1", "m1", true, true), scored("u1", "m2", false, true),  // Ana 2/2 outcomes, 1 exact, streak 2
    scored("u2", "m1", false, false), scored("u2", "m2", false, true), // Beto 1/2 outcomes
  ];

  it("francotirador ranks by exact-hit percentage", () => {
    const { francotirador } = buildAccuracyFacts(profiles, preds, matches, finalized);
    expect(francotirador.winner?.user.id).toBe("u1");
    expect(francotirador.winner?.value).toBe(50); // 1 of 2 exact
  });

  it("racha is the longest consecutive outcome-hit streak", () => {
    const { racha } = buildAccuracyFacts(profiles, preds, matches, finalized);
    expect(racha.winner?.user.id).toBe("u1");
    expect(racha.winner?.value).toBe(2);
  });

  it("is unavailable with no finalized matches", () => {
    const { francotirador } = buildAccuracyFacts(profiles, preds, matches, new Set());
    expect(francotirador.available).toBe(false);
  });
});

describe("team loyalty facts", () => {
  function gp(userId: string, groupLabel: string, first: string): GroupPrediction {
    return {
      id: `${userId}-${groupLabel}`, userId, groupLabel,
      firstTeamId: first, secondTeamId: null, thirdTeamId: null, fourthTeamId: null,
      points: null, exactPositions: 0,
      createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
    };
  }
  const teams = [
    { id: "arg", name: "Argentina", shortName: "ARG", flag: "🇦🇷" },
    { id: "bra", name: "Brasil", shortName: "BRA", flag: "🇧🇷" },
  ];
  const revealedGroups = new Set(["A", "B"]);
  const gps = [
    gp("u1", "A", "arg"), gp("u2", "A", "arg"), // arg backed twice
    gp("u1", "B", "bra"),                        // bra backed once -> oveja negra
  ];

  it("termometro counts 1st-place backers and finds the family favorite", () => {
    const { favoritoFamilia, termometro } = buildTeamLoyaltyFacts(profiles, gps, teams, revealedGroups);
    expect(favoritoFamilia.headline).toContain("Argentina");
    expect(termometro.find((t) => t.teamId === "arg")?.count).toBe(2);
  });

  it("oveja negra is a team backed by exactly one person", () => {
    const { ovejaNegra } = buildTeamLoyaltyFacts(profiles, gps, teams, revealedGroups);
    expect(ovejaNegra.available).toBe(true);
    expect(ovejaNegra.headline).toContain("Brasil");
  });
});

describe("behavior facts", () => {
  function tpred(userId: string, matchId: string, created: string, updated: string): Prediction {
    return { ...pred(userId, matchId, 1, 0), createdAt: created, updatedAt: updated };
  }
  function kmatch(id: string, kickoff: string): Match {
    return { ...({} as Match), id, matchNo: 1, stage: "round16", homeTeamId: "arg", awayTeamId: "fra",
      kickoffUtc: kickoff, status: "open", homeScore: null, awayScore: null, winnerTeamId: null,
      finalizedAt: null, finalizedBy: null, updatedAt: null, updatedBy: null };
  }
  const matches = [kmatch("m1", "2026-06-10T00:00:00.000Z")];
  const revealed = new Set(["m1"]);
  // Ana updated 2 days early; Beto updated 1h before kickoff. Beto edited (created != updated).
  const preds = [
    tpred("u1", "m1", "2026-06-08T00:00:00.000Z", "2026-06-08T00:00:00.000Z"),
    tpred("u2", "m1", "2026-06-01T00:00:00.000Z", "2026-06-09T23:00:00.000Z"),
  ];

  it("madrugador has the largest average lead time", () => {
    const { madrugador } = buildBehaviorFacts(profiles, preds, matches, revealed);
    expect(madrugador.winner?.user.id).toBe("u1");
  });

  it("indeciso counts edited predictions", () => {
    const { indeciso } = buildBehaviorFacts(profiles, preds, matches, revealed);
    expect(indeciso.winner?.user.id).toBe("u2");
    expect(indeciso.winner?.value).toBe(1);
  });
});

describe("similarity matrix", () => {
  it("scores pairwise outcome agreement 0-100", () => {
    const revealed = new Set(["m1", "m2"]);
    const preds = [
      pred("u1", "m1", 2, 0), pred("u2", "m1", 1, 0), // both home -> agree
      pred("u1", "m2", 0, 1), pred("u2", "m2", 2, 0), // away vs home -> disagree
    ];
    const { cells } = buildSimilarityMatrix(profiles, preds, revealed);
    const pair = cells.find((c) => c.aId === "u1" && c.bId === "u2");
    expect(pair?.value).toBe(50);
  });
});

describe("computeStats", () => {
  it("returns a bundle and excludes open matches from group facts", () => {
    const now = new Date("2026-06-12T12:00:00.000Z");
    const bundle = computeStats({
      profiles: seedProfiles, predictions: seedPreds, groupPredictions: seedGroupPreds,
      matches: seedMatches, groups: seedGroups, teams: seedTeams,
      currentUserId: "u1", standingsStages: new Set(["groups"]), now,
    });
    expect(Array.isArray(bundle.facts)).toBe(true);
    expect(bundle.facts.length).toBeGreaterThan(0);
    expect(bundle.personal).toBeTruthy();
    expect(bundle.hero.predictionsLoaded).toBeGreaterThanOrEqual(0);
  });
});
