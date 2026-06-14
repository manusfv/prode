import type { Group, Match, Stage, StageState, StageVisibility } from "./types";
import { getStagesWithContent } from "./results";

/** A phase is visible when open to all, or admin-only and the viewer is an admin. */
function isVisible(visibility: StageVisibility, isAdmin: boolean): boolean {
  return visibility === "open" || (visibility === "admin" && isAdmin);
}

export function getPredictionsStages(stages: StageState[], isAdmin: boolean): Set<Stage> {
  return new Set(
    stages.filter((stage) => isVisible(stage.predictionsOpen, isAdmin)).map((stage) => stage.stage),
  );
}

/** Stages whose predictions are editable: only fully open, never admin-only preview. */
export function getEditablePredictionsStages(stages: StageState[]): Set<Stage> {
  return new Set(stages.filter((stage) => stage.predictionsOpen === "open").map((stage) => stage.stage));
}

export function getStandingsStages(stages: StageState[], isAdmin: boolean): Set<Stage> {
  return new Set(
    stages.filter((stage) => isVisible(stage.standingsOpen, isAdmin)).map((stage) => stage.stage),
  );
}

/** Stages whose results are revealed: visible to viewer AND finalized content present. */
export function getResultsStages(
  stages: StageState[],
  matches: Match[],
  groups: Group[],
  isAdmin: boolean,
): Set<Stage> {
  const content = getStagesWithContent(matches, groups);
  return new Set(
    stages
      .filter((stage) => isVisible(stage.resultsOpen, isAdmin) && content.has(stage.stage))
      .map((stage) => stage.stage),
  );
}
