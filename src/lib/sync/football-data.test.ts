import { describe, expect, it } from "vitest";
import { parseStandings } from "./football-data";

const sample = {
  standings: [
    {
      stage: "GROUP_STAGE",
      type: "TOTAL",
      group: "Group A",
      table: [
        { position: 1, team: { tla: "MEX" }, playedGames: 3 },
        { position: 2, team: { tla: "KOR" }, playedGames: 3 },
        { position: 3, team: { tla: "CZE" }, playedGames: 3 },
        { position: 4, team: { tla: "RSA" }, playedGames: 3 },
      ],
    },
  ],
};

describe("parseStandings", () => {
  it("extracts group label, ordered TLAs, and played counts", () => {
    const [group] = parseStandings(sample);
    expect(group.groupLabel).toBe("A");
    expect(group.positions).toEqual(["MEX", "KOR", "CZE", "RSA"]);
    expect(group.playedByPosition).toEqual([3, 3, 3, 3]);
  });

  it("ignores non-TOTAL standing blocks", () => {
    const withHome = { standings: [{ type: "HOME", group: "Group A", table: [] }, ...sample.standings] };
    expect(parseStandings(withHome)).toHaveLength(1);
  });

  it("orders positions by the table's position field, not array order", () => {
    const shuffled = {
      standings: [
        {
          type: "TOTAL",
          group: "Group A",
          table: [
            { position: 3, team: { tla: "CZE" }, playedGames: 2 },
            { position: 1, team: { tla: "MEX" }, playedGames: 3 },
            { position: 4, team: { tla: "RSA" }, playedGames: 1 },
            { position: 2, team: { tla: "KOR" }, playedGames: 3 },
          ],
        },
      ],
    };
    const [group] = parseStandings(shuffled);
    expect(group.positions).toEqual(["MEX", "KOR", "CZE", "RSA"]);
    expect(group.playedByPosition).toEqual([3, 3, 2, 1]);
  });
});
