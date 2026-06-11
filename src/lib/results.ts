import type { Group, Match, Stage } from "./types";

export function getStagesWithContent(matches: Match[], groups: Group[]): Set<Stage> {
  const set = new Set<Stage>();
  for (const match of matches) {
    set.add(match.stage);
  }
  if (groups.length > 0) {
    set.add("groups");
  }
  return set;
}
