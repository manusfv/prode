import type { Group } from "../types";
import { resolveTeamId } from "./tla";
import type { FeedStanding, GroupStandingResult } from "./types";

export function matchStandings(
  feed: FeedStanding[],
  groups: Group[],
  knownIds: Set<string>,
): { results: GroupStandingResult[]; unmatched: string[] } {
  const groupByLabel = new Map(groups.map((g) => [g.groupLabel, g]));
  const results: GroupStandingResult[] = [];
  const unmatched: string[] = [];

  for (const standing of feed) {
    const group = groupByLabel.get(standing.groupLabel);
    if (!group) continue;
    if (group.resultSource === "admin") continue; // ownership: never overwrite a human

    const ids = standing.positions.map((tla) => resolveTeamId(tla, knownIds));
    const badIndex = ids.findIndex((id) => id === null);
    if (badIndex !== -1 || ids.length !== 4) {
      if (badIndex !== -1) unmatched.push(`${standing.groupLabel}:${standing.positions[badIndex]}`);
      continue;
    }

    results.push({
      groupLabel: standing.groupLabel,
      firstTeamId: ids[0] as string,
      secondTeamId: ids[1] as string,
      thirdTeamId: ids[2] as string,
      fourthTeamId: ids[3] as string,
      complete: standing.playedByPosition.length === 4 && standing.playedByPosition.every((p) => p === 3),
    });
  }

  return { results, unmatched };
}
