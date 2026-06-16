import { describe, expect, it } from "vitest";
import type { Group } from "../types";
import type { SyncDb } from "./types";
import { recalcGroupPredictions } from "./recalc";

function finalizedGroup(): Group {
  return {
    groupLabel: "A", locksAt: null,
    firstTeamId: "mex", secondTeamId: "kor", thirdTeamId: "cze", fourthTeamId: "rsa",
    resultFinalizedAt: "2026-06-20T00:00:00.000Z", resultFinalizedBy: null, resultSource: "auto",
  };
}

// Fake SyncDb that returns one perfect group prediction and records updates.
function fakeDb(updates: Record<string, unknown>[]): SyncDb {
  return {
    from(table: string) {
      return {
        select() {
          return {
            in: async () => ({
              data: table === "group_predictions"
                ? [{
                    id: "gp1", user_id: "u1", group_label: "A",
                    first_team_id: "mex", second_team_id: "kor", third_team_id: "cze", fourth_team_id: "rsa",
                    points: null, exact_positions: 0, created_at: "", updated_at: "",
                  }]
                : [],
              error: null,
            }),
          };
        },
        update(values: Record<string, unknown>) {
          updates.push(values);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
}

describe("recalcGroupPredictions", () => {
  it("scores predictions against finalized standings", async () => {
    const updates: Record<string, unknown>[] = [];
    const result = await recalcGroupPredictions(fakeDb(updates), [finalizedGroup()]);
    expect(result.ok).toBe(true);
    expect(updates[0].points).toBe(28); // perfect: 10+8+6+4
    expect(updates[0].exact_positions).toBe(4);
  });

  it("is a no-op when there are no groups", async () => {
    const updates: Record<string, unknown>[] = [];
    const result = await recalcGroupPredictions(fakeDb(updates), []);
    expect(result.ok).toBe(true);
    expect(updates).toEqual([]);
  });

  it("surfaces a DB write failure", async () => {
    const failingDb: SyncDb = {
      from() {
        return {
          select() {
            return {
              in: async () => ({
                data: [{
                  id: "gp1", user_id: "u1", group_label: "A",
                  first_team_id: "mex", second_team_id: "kor", third_team_id: "cze", fourth_team_id: "rsa",
                  points: null, exact_positions: 0, created_at: "", updated_at: "",
                }],
                error: null,
              }),
            };
          },
          update() {
            return { eq: async () => ({ error: { message: "write failed" } }) };
          },
        };
      },
    };
    const result = await recalcGroupPredictions(failingDb, [finalizedGroup()]);
    expect(result).toEqual({ ok: false, message: "write failed" });
  });
});
