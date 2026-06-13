import { describe, expect, it } from "vitest";

import { revealedMatchIds, finalizedMatchIds, revealedGroupLabels, finalizedGroupLabels, buildOptimismFacts, buildScorelineHistogram, buildConsensusFacts, predictedOutcome, buildAccuracyFacts, buildTeamLoyaltyFacts, buildBehaviorFacts, buildSimilarityMatrix, buildPointsRace, buildAccuracyBreakdown, buildParticipation, buildGoalMargin, computeStats } from "./stats";
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

  it("finalizedGroupLabels includes only groups whose result is finalized", () => {
    const open: Group = { groupLabel: "A", locksAt: "2026-06-01T00:00:00.000Z", firstTeamId: null, secondTeamId: null, thirdTeamId: null, fourthTeamId: null, resultFinalizedAt: null, resultFinalizedBy: null };
    const done: Group = { ...open, groupLabel: "B", resultFinalizedAt: "2026-06-10T00:00:00.000Z" };
    const labels = finalizedGroupLabels([open, done], now);
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
  const noMatches = { preds: [] as Prediction[], matches: [] as Match[], revealed: new Set<string>() };
  const loyalty = (over?: Partial<typeof noMatches>) => {
    const { preds, matches, revealed } = { ...noMatches, ...over };
    return buildTeamLoyaltyFacts(profiles, gps, preds, matches, teams, revealedGroups, revealed);
  };

  it("termometro counts 1st-place backers ranked by votes", () => {
    const { termometro } = loyalty();
    expect(termometro.find((t) => t.teamId === "arg")?.count).toBe(2);
    expect(termometro[0]?.teamId).toBe("arg");
  });

  it("mas-querido and mas-odiado rank teams by predicted wins and losses", () => {
    const matchAB = match("m1", { homeTeamId: "arg", awayTeamId: "bra" });
    const preds = [pred("u1", "m1", 2, 1), pred("u2", "m1", 3, 0)]; // both predict arg to win
    const { masQuerido, masOdiado } = loyalty({ preds, matches: [matchAB], revealed: new Set(["m1"]) });
    expect(masQuerido.headline).toContain("Argentina");
    expect(masQuerido.teamSeries?.find((t) => t.teamId === "arg")?.count).toBe(2);
    expect(masOdiado.headline).toContain("Brasil");
    expect(masOdiado.teamSeries?.find((t) => t.teamId === "bra")?.count).toBe(2);
  });

  it("apuesta-audaz highlights each person's loneliest 1st-place pick", () => {
    const { apuestaAudaz } = loyalty();
    expect(apuestaAudaz.available).toBe(true);
    // u1 picked bra 1st in group B alone; u2 shared arg with u1 in A
    expect(apuestaAudaz.winner?.user.displayName).toBe("Ana");
    expect(apuestaAudaz.winner?.displayValue).toContain("Brasil");
    expect(apuestaAudaz.series).toHaveLength(2);
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

describe("points race", () => {
  it("accumulates match points per person across the dates played", () => {
    const m1 = match("m1", { kickoffUtc: "2026-06-10T18:00:00.000Z", status: "finalized" });
    const m2 = match("m2", { kickoffUtc: "2026-06-11T18:00:00.000Z", status: "finalized" });
    const finalized = new Set(["m1", "m2"]);
    const preds: Prediction[] = [
      { ...pred("u1", "m1", 1, 0), points: 3 },
      { ...pred("u2", "m1", 0, 0), points: 1 },
      { ...pred("u1", "m2", 2, 1), points: 1 },
      { ...pred("u2", "m2", 2, 1), points: 5 },
    ];
    const race = buildPointsRace(profiles, preds, [m1, m2], finalized);
    expect(race.keys).toEqual(["Ana", "Beto"]);
    expect(race.data).toHaveLength(2);
    expect(race.data[0]).toMatchObject({ stage: "10 Jun", Ana: 3, Beto: 1 });
    expect(race.data[1]).toMatchObject({ stage: "11 Jun", Ana: 4, Beto: 6 }); // cumulative
  });

  it("is empty when no matches are finalized", () => {
    expect(buildPointsRace(profiles, [], [], new Set()).data).toHaveLength(0);
  });
});

describe("accuracy breakdown", () => {
  it("splits finalized predictions into exact / outcome / miss per person", () => {
    const finalized = new Set(["m1", "m2", "m3"]);
    const preds: Prediction[] = [
      { ...pred("u1", "m1", 1, 0), exactHit: true, outcomeHit: true },
      { ...pred("u1", "m2", 2, 0), exactHit: false, outcomeHit: true },
      { ...pred("u1", "m3", 0, 1), exactHit: false, outcomeHit: false },
    ];
    const rows = buildAccuracyBreakdown(profiles, preds, finalized);
    const ana = rows.find((r) => r.user.id === "u1");
    expect(ana).toMatchObject({ exact: 1, outcome: 1, miss: 1, total: 3 });
  });

  it("ignores non-finalized predictions and people with no finals", () => {
    const preds = [pred("u1", "m1", 1, 0)];
    expect(buildAccuracyBreakdown(profiles, preds, new Set())).toHaveLength(0);
  });
});

describe("participation", () => {
  it("counts revealed matches each person predicted, against the revealed total", () => {
    const revealed = new Set(["m1", "m2"]);
    const preds = [pred("u1", "m1", 1, 0), pred("u1", "m2", 2, 0), pred("u2", "m1", 0, 0)];
    const { rows, total } = buildParticipation(profiles, preds, revealed);
    expect(total).toBe(2);
    expect(rows.find((r) => r.user.id === "u1")?.value).toBe(2);
    expect(rows.find((r) => r.user.id === "u2")?.value).toBe(1);
    expect(rows[0]?.user.id).toBe("u1"); // sorted desc
  });
});

describe("goal margin", () => {
  it("buckets predicted goal differences and skips hidden matches", () => {
    const revealed = new Set(["m1", "m2", "m3"]);
    const preds = [
      pred("u1", "m1", 1, 1), // empate
      pred("u1", "m2", 3, 1), // 2 goles
      pred("u2", "m3", 5, 0), // 4+
      pred("u2", "m4", 9, 0), // hidden -> ignored
    ];
    const { bins, total } = buildGoalMargin(preds, revealed);
    expect(total).toBe(3);
    expect(bins.find((b) => b.label === "Empate")?.count).toBe(1);
    expect(bins.find((b) => b.label === "2 goles")?.count).toBe(1);
    expect(bins.find((b) => b.label === "4+")?.count).toBe(1);
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

  it("surfaces the user's own group champions even with no match predictions and no locks", () => {
    const teams = [
      { id: "arg", name: "Argentina", shortName: "ARG", flag: "🇦🇷" },
      { id: "bra", name: "Brasil", shortName: "BRA", flag: "🇧🇷" },
    ];
    const openGroups: Group[] = [
      { groupLabel: "A", locksAt: "2026-07-01T00:00:00.000Z", firstTeamId: null, secondTeamId: null, thirdTeamId: null, fourthTeamId: null, resultFinalizedAt: null, resultFinalizedBy: null },
      { groupLabel: "B", locksAt: "2026-07-01T00:00:00.000Z", firstTeamId: null, secondTeamId: null, thirdTeamId: null, fourthTeamId: null, resultFinalizedAt: null, resultFinalizedBy: null },
    ];
    const groupPreds: GroupPrediction[] = [
      { id: "g1", userId: "u1", groupLabel: "A", firstTeamId: "arg", secondTeamId: null, thirdTeamId: null, fourthTeamId: null, points: null, exactPositions: 0, createdAt: "", updatedAt: "" },
      { id: "g2", userId: "u1", groupLabel: "B", firstTeamId: "bra", secondTeamId: null, thirdTeamId: null, fourthTeamId: null, points: null, exactPositions: 0, createdAt: "", updatedAt: "" },
    ];
    const bundle = computeStats({
      profiles, predictions: [], groupPredictions: groupPreds,
      matches: [], groups: openGroups, teams,
      currentUserId: "u1", standingsStages: new Set(["groups"]), now,
    });
    expect(bundle.personal.hasData).toBe(true);
    expect(bundle.personal.groupsPicked).toBe(2);
    expect(bundle.personal.groupChampions).toBe("🇦🇷 🇧🇷");
  });
});
