import type { Group, Match, Profile, Stage } from "./types";
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

export type ComparisonEntry<P> = { profile: Profile; prediction: P | undefined };

export function sortComparison<P>(
  profiles: Profile[],
  predictions: P[],
  options: {
    userIdOf: (prediction: P) => string;
    pointsOf: (prediction: P) => number;
    exactOf: (prediction: P) => number;
    finalized: boolean;
  },
): ComparisonEntry<P>[] {
  const byUser = new Map(predictions.map((prediction) => [options.userIdOf(prediction), prediction]));
  const entries: ComparisonEntry<P>[] = profiles.map((profile) => ({
    profile,
    prediction: byUser.get(profile.id),
  }));

  return entries.sort((a, b) => {
    const aPrediction = a.prediction;
    const bPrediction = b.prediction;
    const aHas = aPrediction !== undefined;
    const bHas = bPrediction !== undefined;
    if (aHas !== bHas) {
      return aHas ? -1 : 1;
    }
    if (aPrediction !== undefined && bPrediction !== undefined && options.finalized) {
      const pointsDiff = options.pointsOf(bPrediction) - options.pointsOf(aPrediction);
      if (pointsDiff !== 0) {
        return pointsDiff;
      }
      const exactDiff = options.exactOf(bPrediction) - options.exactOf(aPrediction);
      if (exactDiff !== 0) {
        return exactDiff;
      }
    }
    return a.profile.displayName.localeCompare(b.profile.displayName, "es");
  });
}
