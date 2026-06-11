import type { Group, Match, Stage } from "./types";
import { getMatchStatus, stageOrder } from "./tournament";

export function getDefaultResultStage(matches: Match[], groups: Group[], now: Date): Stage {
  const finalizedStages = new Set<Stage>();
  for (const match of matches) {
    if (getMatchStatus(match, now) === "finalized") {
      finalizedStages.add(match.stage);
    }
  }
  if (groups.some((group) => group.resultFinalizedAt)) {
    finalizedStages.add("groups");
  }

  for (let i = stageOrder.length - 1; i >= 0; i -= 1) {
    if (finalizedStages.has(stageOrder[i])) {
      return stageOrder[i];
    }
  }

  const content = getStagesWithContent(matches, groups);
  for (const stage of stageOrder) {
    if (content.has(stage)) {
      return stage;
    }
  }

  return "groups";
}

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
