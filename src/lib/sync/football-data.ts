import type { FeedStanding } from "./types";

type StandingRow = { position: number; team: { tla: string }; playedGames: number };
type StandingBlock = { type: string; group: string | null; table: StandingRow[] };
type StandingsResponse = { standings: StandingBlock[] };

export function parseStandings(json: unknown): FeedStanding[] {
  const blocks = (json as StandingsResponse).standings ?? [];
  return blocks
    .filter((block) => block.type === "TOTAL" && block.group)
    .map((block) => {
      const sorted = [...block.table].sort((a, b) => a.position - b.position);
      return {
        groupLabel: (block.group as string).replace(/^Group\s+/, ""),
        positions: sorted.map((row) => row.team.tla),
        playedByPosition: sorted.map((row) => row.playedGames),
      };
    });
}

const STANDINGS_URL = "https://api.football-data.org/v4/competitions/WC/standings";

export async function fetchStandings(token: string): Promise<FeedStanding[]> {
  const response = await fetch(STANDINGS_URL, { headers: { "X-Auth-Token": token } });
  if (!response.ok) {
    throw new Error(`football-data standings ${response.status}: ${await response.text()}`);
  }
  return parseStandings(await response.json());
}
