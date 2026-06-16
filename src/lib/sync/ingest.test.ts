import { describe, expect, it } from "vitest";
import type { GroupStandingResult } from "./types";
import { ingestStandings } from "./ingest";

type Call = { values: Record<string, unknown>; eqColumn: string; eqValue: string };

function fakeDb(calls: Call[]) {
  return {
    from() {
      return {
        select() { return { in: async () => ({ data: [], error: null }) }; },
        update(values: Record<string, unknown>) {
          return { eq: async (eqColumn: string, eqValue: string) => { calls.push({ values, eqColumn, eqValue }); return { error: null }; } };
        },
      };
    },
  };
}

const complete: GroupStandingResult = {
  groupLabel: "A", firstTeamId: "mex", secondTeamId: "kor", thirdTeamId: "cze", fourthTeamId: "rsa", complete: true,
};

describe("ingestStandings", () => {
  it("writes positions, stamps source=auto, and finalizes a complete group", async () => {
    const calls: Call[] = [];
    const result = await ingestStandings(fakeDb(calls), [complete]);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].eqColumn).toBe("group_label");
    expect(calls[0].eqValue).toBe("A");
    expect(calls[0].values.first_team_id).toBe("mex");
    expect(calls[0].values.result_source).toBe("auto");
    expect(calls[0].values.result_finalized_at).not.toBeNull();
  });

  it("leaves result_finalized_at null for an incomplete group", async () => {
    const calls: Call[] = [];
    await ingestStandings(fakeDb(calls), [{ ...complete, complete: false }]);
    expect(calls[0].values.result_finalized_at).toBeNull();
  });
});
