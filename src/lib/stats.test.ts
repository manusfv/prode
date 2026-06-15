import { describe, expect, it } from "vitest";

import { revealedMatchIds, finalizedMatchIds, revealedGroupLabels, finalizedGroupLabels, buildOptimismFacts, buildScorelineHistogram, buildConsensusFacts, predictedOutcome, buildAccuracyFacts, buildTeamLoyaltyFacts, buildGroupRankingFacts, buildBehaviorFacts, buildSimilarityMatrix, buildPointsRace, buildAccuracyBreakdown, buildParticipation, buildGoalMargin, computeStats, pickTwinAndOpposite, modalGroupPositions, buildVerdictFacts } from "./stats";
import type { Group, GroupPrediction, Match, Prediction, Profile, Team } from "./types";
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

  it("apuesta-audaz summarizes every tied lone pick, not just the leader's", () => {
    // Each person is alone on a DIFFERENT team -> they tie for boldest. The card
    // summary must name both teams, not pin the leader's pick on everyone.
    const tiedGps = [gp("u1", "A", "arg"), gp("u2", "A", "bra")];
    const { apuestaAudaz } = buildTeamLoyaltyFacts(profiles, tiedGps, [], [], teams, new Set(["A"]), new Set());
    expect(apuestaAudaz.coWinners).toHaveLength(2);
    expect(apuestaAudaz.winnerSummary).toContain("Argentina");
    expect(apuestaAudaz.winnerSummary).toContain("Brasil");
    expect(apuestaAudaz.winnerSummary).toContain("nadie más las eligió");
  });
});

describe("group ranking facts", () => {
  const teams = [
    { id: "arg", name: "Argentina", shortName: "ARG", flag: "🇦🇷" },
    { id: "bra", name: "Brasil", shortName: "BRA", flag: "🇧🇷" },
    { id: "uru", name: "Uruguay", shortName: "URU", flag: "🇺🇾" },
    { id: "chi", name: "Chile", shortName: "CHI", flag: "🇨🇱" },
  ];
  const threeProfiles: Profile[] = [
    { id: "u1", displayName: "Ana", email: "a@x.com", approved: true, role: "user" },
    { id: "u2", displayName: "Beto", email: "b@x.com", approved: true, role: "user" },
    { id: "u3", displayName: "Caro", email: "c@x.com", approved: true, role: "user" },
  ];
  function grp(userId: string, label: string, order: [string, string, string, string], exactPositions = 0): GroupPrediction {
    return {
      id: `${userId}-${label}`, userId, groupLabel: label,
      firstTeamId: order[0], secondTeamId: order[1], thirdTeamId: order[2], fourthTeamId: order[3],
      points: null, exactPositions,
      createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
    };
  }
  // Group A: divided; Group B: full consensus.
  const gps: GroupPrediction[] = [
    grp("u1", "A", ["arg", "bra", "uru", "chi"], 4),
    grp("u2", "A", ["arg", "bra", "chi", "uru"], 2),
    grp("u3", "A", ["bra", "arg", "uru", "chi"], 0),
    grp("u1", "B", ["uru", "chi", "arg", "bra"]),
    grp("u2", "B", ["uru", "chi", "arg", "bra"]),
    grp("u3", "B", ["uru", "chi", "arg", "bra"]),
  ];
  const revealedGroups = new Set(["A", "B"]);
  const ranking = (finalized = new Set<string>()) =>
    buildGroupRankingFacts(threeProfiles, gps, teams, revealedGroups, finalized);

  it("grupo de la muerte picks the most-divided group", () => {
    const { grupoMuerte } = ranking();
    expect(grupoMuerte.headline).toContain("A");
    expect(grupoMuerte.bins?.[0]).toMatchObject({ label: "A", count: 33 });
    expect(grupoMuerte.bins?.find((b) => b.label === "B")?.count).toBe(0);
  });

  it("grupo cantado picks the most-agreed group with agreement %", () => {
    const { grupoUnanime } = ranking();
    expect(grupoUnanime.headline).toContain("B");
    expect(grupoUnanime.bins?.[0]).toMatchObject({ label: "B", count: 100 });
    expect(grupoUnanime.bins?.find((b) => b.label === "A")?.count).toBe(67);
    expect(grupoUnanime.winner?.displayValue).toBe("100% de acuerdo");
  });

  it("colista tallies most-predicted last-place teams", () => {
    const { colista } = ranking();
    expect(colista.headline).toContain("Brasil");
    expect(colista.teamSeries?.[0]).toMatchObject({ teamId: "bra", count: 3 });
  });

  it("visionario ranks people by full-order divergence from consensus", () => {
    const { visionario } = ranking();
    expect(visionario.series).toHaveLength(3);
    expect(visionario.winner?.value).toBe(2);
    expect(visionario.series.find((s) => s.user.id === "u1")?.value).toBe(0);
  });

  it("profeta sums exactPositions across finalized groups only", () => {
    const { profeta } = ranking(new Set(["A"]));
    expect(profeta.requires).toBe("results");
    expect(profeta.winner?.user.displayName).toBe("Ana");
    expect(profeta.winner?.value).toBe(4);
    expect(profeta.series.find((s) => s.user.id === "u3")?.value).toBe(0);
  });

  it("profeta is unavailable when no group result is finalized", () => {
    expect(ranking().profeta.available).toBe(false);
  });

  it("dream table picks each group's consensus winner", () => {
    const { dreamTable } = ranking();
    expect(dreamTable).toHaveLength(2);
    expect(dreamTable[0]).toMatchObject({ groupLabel: "A", teamId: "arg", votes: 2, total: 3 });
    expect(dreamTable[1]).toMatchObject({ groupLabel: "B", teamId: "uru", votes: 3, total: 3 });
  });
});

describe("modalGroupPositions helper", () => {
  function grp(userId: string, label: string, order: [string, string, string, string]): GroupPrediction {
    return {
      id: `${userId}-${label}`, userId, groupLabel: label,
      firstTeamId: order[0], secondTeamId: order[1], thirdTeamId: order[2], fourthTeamId: order[3],
      points: null, exactPositions: 0,
      createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
    };
  }
  it("returns the most-voted team per group:slot, ignoring <2-picker groups", () => {
    const gps = [
      grp("u1", "A", ["arg", "bra", "uru", "chi"]),
      grp("u2", "A", ["arg", "uru", "bra", "chi"]),
      grp("u3", "B", ["bra", "arg", "uru", "chi"]), // single picker -> ignored
    ];
    const modal = modalGroupPositions(gps, (id) => id);
    expect(modal.get("A:0")).toBe("arg"); // arg 1st twice
    expect(modal.get("A:3")).toBe("chi"); // chi 4th twice
    expect(modal.has("B:0")).toBe(false); // only one picker in B
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

describe("twin and opposite", () => {
  const users: Profile[] = [
    profiles[0]!, profiles[1]!,
    { id: "u3", displayName: "Caro", email: "c@x.com", approved: true, role: "user" },
  ];
  const matrix = {
    users,
    cells: [
      { aId: "u1", bId: "u2", value: 80 }, { aId: "u1", bId: "u3", value: 30 },
      { aId: "u2", bId: "u1", value: 80 }, { aId: "u2", bId: "u3", value: 50 },
      { aId: "u3", bId: "u1", value: 30 }, { aId: "u3", bId: "u2", value: 50 },
    ],
  };

  it("picks the most and least similar family member", () => {
    expect(pickTwinAndOpposite(matrix, "u1")).toEqual({
      twin: { name: "Beto", pct: 80 },
      opposite: { name: "Caro", pct: 30 },
    });
  });

  it("returns nothing when the row shows no agreement", () => {
    const empty = { users, cells: [{ aId: "u1", bId: "u2", value: 0 }, { aId: "u1", bId: "u3", value: 0 }] };
    expect(pickTwinAndOpposite(empty, "u1")).toEqual({});
  });

  it("gives only a twin when there is a single other person", () => {
    const pair = { users: [users[0]!, users[1]!], cells: [{ aId: "u1", bId: "u2", value: 70 }, { aId: "u2", bId: "u1", value: 70 }] };
    expect(pickTwinAndOpposite(pair, "u1")).toEqual({ twin: { name: "Beto", pct: 70 } });
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

  it("includes the group-stage facts and a dream table in the bundle", () => {
    const now = new Date("2026-06-12T12:00:00.000Z");
    const bundle = computeStats({
      profiles: seedProfiles, predictions: seedPreds, groupPredictions: seedGroupPreds,
      matches: seedMatches, groups: seedGroups, teams: seedTeams,
      currentUserId: "u1", standingsStages: new Set(["groups"]), now,
    });
    const ids = new Set(bundle.facts.map((f) => f.id));
    expect(ids.has("grupo-muerte") && ids.has("grupo-unanime") && ids.has("visionario") && ids.has("colista")).toBe(true);
    expect(Array.isArray(bundle.dreamTable)).toBe(true);
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
    expect(bundle.personal.groupChampions).toEqual([
      { groupLabel: "A", flag: "🇦🇷", name: "Argentina" },
      { groupLabel: "B", flag: "🇧🇷", name: "Brasil" },
    ]);
  });
});

describe("verdict facts", () => {
  const vTeams: Team[] = [
    { id: "arg", name: "Argentina", shortName: "ARG", flag: "🇦🇷" },
    { id: "bra", name: "Brasil", shortName: "BRA", flag: "🇧🇷" },
    { id: "uru", name: "Uruguay", shortName: "URU", flag: "🇺🇾" },
    { id: "chi", name: "Chile", shortName: "CHI", flag: "🇨🇱" },
  ];
  const vProfiles: Profile[] = [
    { id: "u1", displayName: "Ana", email: "a@x.com", approved: true, role: "user" },
    { id: "u2", displayName: "Beto", email: "b@x.com", approved: true, role: "user" },
    { id: "u3", displayName: "Caro", email: "c@x.com", approved: true, role: "user" },
  ];
  function vgrp(userId: string, label: string, order: [string, string, string, string], exactPositions = 0): GroupPrediction {
    return {
      id: `${userId}-${label}`, userId, groupLabel: label,
      firstTeamId: order[0], secondTeamId: order[1], thirdTeamId: order[2], fourthTeamId: order[3],
      points: null, exactPositions,
      createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
    };
  }
  // group A finished arg,bra,uru,chi (real result on the Group object)
  function vgroup(label: string, order: [string, string, string, string], finalized: boolean): Group {
    return {
      groupLabel: label, locksAt: "2026-06-01T00:00:00.000Z",
      firstTeamId: order[0], secondTeamId: order[1], thirdTeamId: order[2], fourthTeamId: order[3],
      resultFinalizedAt: finalized ? "2026-06-10T00:00:00.000Z" : null, resultFinalizedBy: finalized ? "u1" : null,
    };
  }

  it("audaz-premiada credits lone 1st picks that actually finished 1st", () => {
    const gps = [
      vgrp("u1", "A", ["uru", "arg", "bra", "chi"]),
      vgrp("u2", "A", ["arg", "uru", "bra", "chi"]),
      vgrp("u3", "A", ["arg", "uru", "bra", "chi"]),
    ];
    const groups = [vgroup("A", ["uru", "arg", "bra", "chi"], true)];
    const { audazPremiada } = buildVerdictFacts(
      vProfiles, [], gps, [], groups, vTeams,
      new Set(), new Set(), new Set(["A"]), new Set(["A"]),
    );
    expect(audazPremiada.available).toBe(true);
    expect(audazPremiada.winner?.user.displayName).toBe("Ana");
    expect(audazPremiada.winner?.value).toBe(1);
    expect(audazPremiada.winner?.displayValue).toContain("Uruguay");
  });

  it("audaz-premiada shows a 'todavía' headline when no lone pick landed", () => {
    const gps = [
      vgrp("u1", "A", ["chi", "arg", "bra", "uru"]),
      vgrp("u2", "A", ["arg", "uru", "bra", "chi"]),
      vgrp("u3", "A", ["arg", "uru", "bra", "chi"]),
    ];
    const groups = [vgroup("A", ["arg", "uru", "bra", "chi"], true)];
    const { audazPremiada } = buildVerdictFacts(
      vProfiles, [], gps, [], groups, vTeams,
      new Set(), new Set(), new Set(["A"]), new Set(["A"]),
    );
    expect(audazPremiada.available).toBe(true);
    expect(audazPremiada.winner).toBeUndefined();
    expect(audazPremiada.headline).toContain("todavía");
  });

  it("profeta-solitario credits lone exact scorelines that hit", () => {
    const preds: Prediction[] = [
      { ...pred("u1", "m1", 3, 1), exactHit: true },
      { ...pred("u2", "m1", 1, 0), exactHit: false },
      { ...pred("u3", "m1", 1, 0), exactHit: false },
    ];
    const m1 = match("m1", { homeTeamId: "arg", awayTeamId: "bra" });
    const { profetaSolitario } = buildVerdictFacts(
      vProfiles, preds, [], [m1], [], vTeams,
      new Set(["m1"]), new Set(["m1"]), new Set(), new Set(),
    );
    expect(profetaSolitario.available).toBe(true);
    expect(profetaSolitario.winner?.user.displayName).toBe("Ana");
    expect(profetaSolitario.winner?.value).toBe(1);
  });

  it("profeta-solitario ignores shared scorelines even if exact", () => {
    const preds: Prediction[] = [
      { ...pred("u1", "m1", 1, 0), exactHit: true },
      { ...pred("u2", "m1", 1, 0), exactHit: true },
    ];
    const m1 = match("m1");
    const { profetaSolitario } = buildVerdictFacts(
      vProfiles, preds, [], [m1], [], vTeams,
      new Set(["m1"]), new Set(["m1"]), new Set(), new Set(),
    );
    expect(profetaSolitario.winner).toBeUndefined();
  });

  it("visionario-confirmado counts divergent slots the person got right", () => {
    // u1 picks ["uru", "arg", "bra", "chi"]; consensus (u2+u3) is ["arg", "uru", "bra", "chi"].
    // Actual order is ["uru", "arg", "bra", "chi"].
    // u1 diverges from consensus at slots 0 (uru vs arg) and 1 (arg vs uru), and is correct on both.
    const gps = [
      vgrp("u1", "A", ["uru", "arg", "bra", "chi"]),
      vgrp("u2", "A", ["arg", "uru", "bra", "chi"]),
      vgrp("u3", "A", ["arg", "uru", "bra", "chi"]),
    ];
    const groups = [vgroup("A", ["uru", "arg", "bra", "chi"], true)];
    const { visionarioConfirmado } = buildVerdictFacts(
      vProfiles, [], gps, [], groups, vTeams,
      new Set(), new Set(), new Set(["A"]), new Set(["A"]),
    );
    expect(visionarioConfirmado.available).toBe(true);
    expect(visionarioConfirmado.winner?.user.displayName).toBe("Ana");
    expect(visionarioConfirmado.winner?.value).toBe(2);
    expect(visionarioConfirmado.series.find((s) => s.user.id === "u2")?.value).toBe(0);
  });

  it("sorpresa ranks teams that finished higher than the family expected", () => {
    const gps = [
      vgrp("u1", "A", ["arg", "bra", "uru", "chi"]),
      vgrp("u2", "A", ["arg", "bra", "uru", "chi"]),
      vgrp("u3", "A", ["arg", "bra", "chi", "uru"]),
    ];
    const groups = [vgroup("A", ["uru", "arg", "bra", "chi"], true)]; // uru actually 1st
    const { sorpresa } = buildVerdictFacts(
      vProfiles, [], gps, [], groups, vTeams,
      new Set(), new Set(), new Set(["A"]), new Set(["A"]),
    );
    expect(sorpresa.available).toBe(true);
    expect(sorpresa.headline).toContain("Uruguay");
    expect(sorpresa.teamSeries?.[0]).toMatchObject({ teamId: "uru" });
    expect(sorpresa.teamSeries?.[0]?.count).toBeGreaterThan(0);
  });

  it("decepcion ranks teams that finished lower than the family expected", () => {
    const gps = [
      vgrp("u1", "A", ["arg", "bra", "uru", "chi"]),
      vgrp("u2", "A", ["arg", "bra", "uru", "chi"]),
      vgrp("u3", "A", ["arg", "bra", "uru", "chi"]),
    ];
    const groups = [vgroup("A", ["uru", "bra", "chi", "arg"], true)]; // arg actually last
    const { decepcion } = buildVerdictFacts(
      vProfiles, [], gps, [], groups, vTeams,
      new Set(), new Set(), new Set(["A"]), new Set(["A"]),
    );
    expect(decepcion.available).toBe(true);
    expect(decepcion.headline).toContain("Argentina");
    expect(decepcion.teamSeries?.[0]).toMatchObject({ teamId: "arg", count: 3 });
  });

  it("ojo-clinico ranks the lowest average goal-total error (ascending)", () => {
    const m1 = match("m1", { status: "finalized", homeScore: 2, awayScore: 1 });
    const preds = [pred("u1", "m1", 2, 1), pred("u2", "m1", 0, 0)];
    const { ojoClinico } = buildVerdictFacts(
      vProfiles, preds, [], [m1], [], vTeams,
      new Set(["m1"]), new Set(["m1"]), new Set(), new Set(),
    );
    expect(ojoClinico.available).toBe(true);
    expect(ojoClinico.winner?.user.displayName).toBe("Ana");
    expect(ojoClinico.winner?.value).toBe(0);
    expect(ojoClinico.series[0]?.user.id).toBe("u1"); // sorted ascending
  });

  it("manada-sabia reports how often the crowd majority was right", () => {
    const m1 = match("m1", { status: "finalized", homeScore: 2, awayScore: 0 });
    const preds = [pred("u1", "m1", 1, 0), pred("u2", "m1", 2, 0), pred("u3", "m1", 0, 1)];
    const { manadaSabia } = buildVerdictFacts(
      vProfiles, preds, [], [m1], [], vTeams,
      new Set(["m1"]), new Set(["m1"]), new Set(), new Set(),
    );
    expect(manadaSabia.available).toBe(true);
    expect(manadaSabia.headline).toContain("100%");
    expect(manadaSabia.bins?.find((b) => b.label === "La manada acertó")?.count).toBe(1);
  });

  it("rebelde-razon counts against-the-crowd calls that were correct", () => {
    const preds: Prediction[] = [
      { ...pred("u1", "m1", 2, 0), outcomeHit: true },
      { ...pred("u2", "m1", 1, 0), outcomeHit: true },
      { ...pred("u3", "m1", 0, 2), outcomeHit: true }, // contrarian + correct
    ];
    const { rebeldeRazon } = buildVerdictFacts(
      vProfiles, preds, [], [], [], vTeams,
      new Set(["m1"]), new Set(["m1"]), new Set(), new Set(),
    );
    expect(rebeldeRazon.available).toBe(true);
    expect(rebeldeRazon.winner?.user.displayName).toBe("Caro");
    expect(rebeldeRazon.winner?.value).toBe(1);
  });
});
