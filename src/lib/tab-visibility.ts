import type { Group, Match, Stage, StageState } from "./types";
import { getStagesWithContent } from "./results";

export function getPredictionsStages(stages: StageState[]): Set<Stage> {
  return new Set(stages.filter((stage) => stage.predictionsOpen).map((stage) => stage.stage));
}

export function getStandingsStages(stages: StageState[]): Set<Stage> {
  return new Set(stages.filter((stage) => stage.standingsOpen).map((stage) => stage.stage));
}

/** Stages whose results are revealed: admin flag AND finalized content present. */
export function getResultsStages(stages: StageState[], matches: Match[], groups: Group[]): Set<Stage> {
  const content = getStagesWithContent(matches, groups);
  return new Set(
    stages.filter((stage) => stage.resultsOpen && content.has(stage.stage)).map((stage) => stage.stage),
  );
}
