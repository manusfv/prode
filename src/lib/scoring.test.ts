import { describe, expect, it } from "vitest";
import type { Match, Prediction, Profile } from "./types";
import { canSavePrediction, scorePrediction } from "./scoring";
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
