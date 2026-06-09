import { describe, expect, it } from "vitest";
import type { Group, GroupPrediction, Match, Prediction, Profile } from "./types";
import {
  canSaveGroupPrediction,
  canSavePrediction,
  scoreGroupPrediction,
  scorePrediction,
} from "./scoring";
import { formatKickoff, getMatchStatus } from "./tournament";

const profile: Profile = {
  id: "u1",
  displayName: "Manu",
  email: "manu@example.com",
  approved: true,
  role: "user",
};

const groupMatch: Match = {
  id: "m1",
  matchNo: 1,
  stage: "groups",
  group: "A",
  homeTeamId: "arg",
  awayTeamId: "mex",
  kickoffUtc: "2026-06-12T22:00:00.000Z",
  city: "Ciudad de México",
  venue: "Estadio Azteca",
  homeScore: 2,
  awayScore: 1,
  winnerTeamId: null,
  finalizedAt: "2026-06-12T23:55:00.000Z",
  finalizedBy: "admin",
  updatedAt: null,
  updatedBy: null,
};

const knockoutMatch: Match = {
  ...groupMatch,
  id: "m2",
  stage: "round16",
  group: undefined,
  homeScore: 1,
  awayScore: 1,
  winnerTeamId: "arg",
};

function prediction(overrides: Partial<Prediction>): Prediction {
  return {
    id: "p1",
    userId: "u1",
    matchId: "m1",
    homeScore: 0,
    awayScore: 0,
    winnerTeamId: null,
    points: null,
    exactHit: false,
    outcomeHit: false,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("scorePrediction", () => {
  it("gives 3 points for exact score", () => {
    expect(scorePrediction(groupMatch, prediction({ homeScore: 2, awayScore: 1 }))).toEqual({
      points: 3,
      exactHit: true,
      outcomeHit: true,
    });
  });

  it("gives 1 point for correct group-stage outcome", () => {
    expect(scorePrediction(groupMatch, prediction({ homeScore: 3, awayScore: 0 }))).toEqual({
      points: 1,
      exactHit: false,
      outcomeHit: true,
    });
  });

  it("gives 0 points for a wrong prediction", () => {
    expect(scorePrediction(groupMatch, prediction({ homeScore: 0, awayScore: 1 }))).toEqual({
      points: 0,
      exactHit: false,
      outcomeHit: false,
    });
  });

  it("scores knockout advancer when tied", () => {
    expect(
      scorePrediction(
        knockoutMatch,
        prediction({ matchId: "m2", homeScore: 2, awayScore: 2, winnerTeamId: "arg" }),
      ),
    ).toEqual({
      points: 1,
      exactHit: false,
      outcomeHit: true,
    });
  });
});

describe("canSavePrediction", () => {
  it("requires an advancer for tied knockout predictions", () => {
    expect(
      canSavePrediction({
        match: { ...knockoutMatch, finalizedAt: null, homeScore: null, awayScore: null },
        draft: { homeScore: 1, awayScore: 1, winnerTeamId: null },
        profile,
        openStages: new Set(["round16"]),
        now: new Date("2026-06-10T00:00:00.000Z"),
      }),
    ).toEqual({ ok: false, reason: "Elegí quién clasifica." });
  });

  it("rejects locked match writes", () => {
    expect(
      canSavePrediction({
        match: { ...groupMatch, finalizedAt: null, homeScore: null, awayScore: null },
        draft: { homeScore: 1, awayScore: 0, winnerTeamId: null },
        profile,
        openStages: new Set(["groups"]),
        now: new Date("2026-06-13T00:00:00.000Z"),
      }),
    ).toEqual({ ok: false, reason: "El partido ya está cerrado." });
  });

  it("rejects unapproved users", () => {
    expect(
      canSavePrediction({
        match: { ...groupMatch, finalizedAt: null, homeScore: null, awayScore: null },
        draft: { homeScore: 1, awayScore: 0, winnerTeamId: null },
        profile: { ...profile, approved: false },
        openStages: new Set(["groups"]),
        now: new Date("2026-06-10T00:00:00.000Z"),
      }),
    ).toEqual({ ok: false, reason: "Tu usuario todavía no está aprobado." });
  });
});

const finalizedGroup: Group = {
  groupLabel: "A",
  locksAt: "2026-06-11T22:00:00.000Z",
  firstTeamId: "arg",
  secondTeamId: "mex",
  thirdTeamId: "pol",
  fourthTeamId: "ksa",
  resultFinalizedAt: "2026-06-25T00:00:00.000Z",
  resultFinalizedBy: "admin",
};

function groupPrediction(overrides: Partial<GroupPrediction>): GroupPrediction {
  return {
    id: "gp1",
    userId: "u1",
    groupLabel: "A",
    firstTeamId: "arg",
    secondTeamId: "mex",
    thirdTeamId: "pol",
    fourthTeamId: "ksa",
    points: null,
    exactPositions: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("scoreGroupPrediction", () => {
  it("awards full 28 points for a perfect group", () => {
    expect(scoreGroupPrediction(finalizedGroup, groupPrediction({}))).toEqual({
      points: 28,
      exactPositions: 4,
    });
  });

  it("awards 10 points for only the 1st place correct", () => {
    expect(
      scoreGroupPrediction(
        finalizedGroup,
        groupPrediction({ secondTeamId: "pol", thirdTeamId: "ksa", fourthTeamId: "mex" }),
      ),
    ).toEqual({ points: 10, exactPositions: 1 });
  });

  it("awards 16 points for 1st and 3rd correct", () => {
    expect(
      scoreGroupPrediction(
        finalizedGroup,
        groupPrediction({ secondTeamId: "ksa", fourthTeamId: "mex" }),
      ),
    ).toEqual({ points: 16, exactPositions: 2 });
  });

  it("scores 0 when the group result is not finalized", () => {
    expect(
      scoreGroupPrediction({ ...finalizedGroup, firstTeamId: null }, groupPrediction({})),
    ).toEqual({ points: 0, exactPositions: 0 });
  });
});

describe("canSaveGroupPrediction", () => {
  const openGroup: Group = {
    ...finalizedGroup,
    resultFinalizedAt: null,
    resultFinalizedBy: null,
  };

  it("accepts a partial order", () => {
    expect(
      canSaveGroupPrediction({
        group: openGroup,
        draft: { order: ["arg", "mex", "pol", null] },
        profile,
        openStages: new Set(["groups"]),
        now: new Date("2026-06-10T00:00:00.000Z"),
      }),
    ).toEqual({ ok: true, reason: "Listo para guardar." });
  });

  it("rejects repeated teams", () => {
    expect(
      canSaveGroupPrediction({
        group: openGroup,
        draft: { order: ["arg", "arg", "pol", "ksa"] },
        profile,
        openStages: new Set(["groups"]),
        now: new Date("2026-06-10T00:00:00.000Z"),
      }),
    ).toEqual({ ok: false, reason: "No repitas equipos." });
  });

  it("rejects writes after the group locks", () => {
    expect(
      canSaveGroupPrediction({
        group: openGroup,
        draft: { order: ["arg", "mex", "pol", "ksa"] },
        profile,
        openStages: new Set(["groups"]),
        now: new Date("2026-06-12T00:00:00.000Z"),
      }),
    ).toEqual({ ok: false, reason: "El grupo ya está cerrado." });
  });

  it("accepts a complete, distinct, on-time order", () => {
    expect(
      canSaveGroupPrediction({
        group: openGroup,
        draft: { order: ["arg", "mex", "pol", "ksa"] },
        profile,
        openStages: new Set(["groups"]),
        now: new Date("2026-06-10T00:00:00.000Z"),
      }),
    ).toEqual({ ok: true, reason: "Listo para guardar." });
  });
});

describe("getMatchStatus", () => {
  it("auto-closes open matches after kickoff", () => {
    expect(
      getMatchStatus(
        { ...groupMatch, status: "open", finalizedAt: null, updatedAt: null, updatedBy: null },
        new Date("2026-06-12T21:59:00.000Z"),
      ),
    ).toBe("open");

    expect(
      getMatchStatus(
        { ...groupMatch, status: "open", finalizedAt: null, updatedAt: null, updatedBy: null },
        new Date("2026-06-12T22:00:00.000Z"),
      ),
    ).toBe("locked");
  });

  it("allows an admin open override after kickoff", () => {
    expect(
      getMatchStatus(
        {
          ...groupMatch,
          status: "open",
          finalizedAt: null,
          updatedAt: "2026-06-12T22:10:00.000Z",
          updatedBy: "admin",
        },
        new Date("2026-06-12T22:20:00.000Z"),
      ),
    ).toBe("open");
  });

  it("keeps live and finalized statuses explicit", () => {
    expect(getMatchStatus({ ...groupMatch, status: "live", finalizedAt: null })).toBe("locked");
    expect(getMatchStatus({ ...groupMatch, status: "finalized" })).toBe("finalized");
  });
});

describe("formatKickoff", () => {
  it("formats kickoff times in the app timezone", () => {
    const kickoff = formatKickoff("2026-06-07T10:00:00.000Z");

    expect(kickoff).toContain("07:00");
    expect(kickoff).not.toMatch(/\u00a0|\u202f/);
  });
});
