import type {
  Group,
  GroupPrediction,
  GroupPredictionDraft,
  Match,
  Prediction,
  PredictionDraft,
  Profile,
  Stage,
} from "./types";
import { getGroupStatus, getMatchStatus, hasGroupOrder } from "./tournament";

// Per-stage knockout points: [outcome, exact]. Groups use position scoring
// (GROUP_POSITION_POINTS) and have no per-match predictions, so their entry is 0/0.
export const STAGE_POINTS: Record<Stage, { outcome: number; exact: number }> = {
  groups: { outcome: 0, exact: 0 },
  round32: { outcome: 10, exact: 25 },
  round16: { outcome: 30, exact: 50 },
  quarter: { outcome: 60, exact: 80 },
  semi: { outcome: 90, exact: 110 },
  third: { outcome: 120, exact: 150 },
  final: { outcome: 120, exact: 150 },
};

export type ScoreResult = {
  points: number;
  exactHit: boolean;
  outcomeHit: boolean;
};

// Points awarded for placing the team that actually finishes in each position
// (1st, 2nd, 3rd, 4th) into the matching slot. Max 28 per group.
export const GROUP_POSITION_POINTS = [10, 8, 6, 4] as const;

export type GroupScoreResult = {
  points: number;
  exactPositions: number;
};

export function scoreGroupPrediction(
  group: Group,
  prediction: GroupPrediction,
): GroupScoreResult {
  const actual = [
    group.firstTeamId,
    group.secondTeamId,
    group.thirdTeamId,
    group.fourthTeamId,
  ];
  if (actual.some((teamId) => teamId === null)) {
    return { points: 0, exactPositions: 0 };
  }

  const predicted = [
    prediction.firstTeamId,
    prediction.secondTeamId,
    prediction.thirdTeamId,
    prediction.fourthTeamId,
  ];

  let points = 0;
  let exactPositions = 0;
  for (let i = 0; i < 4; i += 1) {
    if (predicted[i] && predicted[i] === actual[i]) {
      points += GROUP_POSITION_POINTS[i];
      exactPositions += 1;
    }
  }

  return { points, exactPositions };
}

/**
 * Scores a group-position prediction against the group's current order, whether
 * that order is provisional or finalized. Returns null points when the order is
 * incomplete (mirrors how the leaderboard treats unscored predictions).
 */
export function scoreGroupPredictionOrNull(
  group: Group,
  prediction: GroupPrediction,
): { points: number | null; exactPositions: number } {
  if (!hasGroupOrder(group)) return { points: null, exactPositions: 0 };
  return scoreGroupPrediction(group, prediction);
}

export function scorePrediction(match: Match, prediction: Prediction): ScoreResult {
  if (
    match.homeScore === null ||
    match.awayScore === null ||
    prediction.homeScore === null ||
    prediction.awayScore === null
  ) {
    return { points: 0, exactHit: false, outcomeHit: false };
  }

  const { outcome, exact } = STAGE_POINTS[match.stage];

  const exactHit =
    prediction.homeScore === match.homeScore &&
    prediction.awayScore === match.awayScore;

  if (exactHit) {
    return { points: exact, exactHit: true, outcomeHit: true };
  }

  const predictedOutcome = getOutcome(prediction.homeScore, prediction.awayScore);
  const officialOutcome = getOutcome(match.homeScore, match.awayScore);
  const outcomeHit = predictedOutcome === officialOutcome;

  return { points: outcomeHit ? outcome : 0, exactHit: false, outcomeHit };
}

export function canSavePrediction({
  match,
  draft,
  profile,
  openStages,
  now = new Date(),
}: {
  match: Match;
  draft: PredictionDraft;
  profile: Profile;
  openStages: Set<Stage>;
  now?: Date;
}) {
  if (!profile.approved) {
    return { ok: false, reason: "Tu usuario todavía no está aprobado." };
  }

  if (!openStages.has(match.stage)) {
    return { ok: false, reason: "La etapa todavía no está abierta." };
  }

  if (getMatchStatus(match, now) !== "open") {
    return { ok: false, reason: "El partido ya está cerrado." };
  }

  if (!match.homeTeamId || !match.awayTeamId) {
    return { ok: false, reason: "Los equipos todavía no están definidos." };
  }

  if (draft.homeScore === null || draft.awayScore === null) {
    return { ok: false, reason: "Completá ambos resultados." };
  }

  if (draft.homeScore < 0 || draft.awayScore < 0) {
    return { ok: false, reason: "Los goles no pueden ser negativos." };
  }

  return { ok: true, reason: "Listo para guardar." };
}

export function canSaveGroupPrediction({
  group,
  draft,
  profile,
  openStages,
  now = new Date(),
}: {
  group: Group;
  draft: GroupPredictionDraft;
  profile: Profile;
  openStages: Set<Stage>;
  now?: Date;
}) {
  if (!profile.approved) {
    return { ok: false, reason: "Tu usuario todavía no está aprobado." };
  }

  if (!openStages.has("groups")) {
    return { ok: false, reason: "La etapa todavía no está abierta." };
  }

  if (getGroupStatus(group, now) !== "open") {
    return { ok: false, reason: "El grupo ya está cerrado." };
  }

  // Partial orders are allowed (saved slot by slot); only reject duplicates.
  const filled = draft.order.filter((teamId): teamId is string => Boolean(teamId));
  if (new Set(filled).size !== filled.length) {
    return { ok: false, reason: "No repitas equipos." };
  }

  return { ok: true, reason: "Listo para guardar." };
}

export function scoreAllForMatch(match: Match, predictions: Prediction[]) {
  return predictions.map((prediction) => {
    if (prediction.matchId !== match.id) return prediction;
    const score = scorePrediction(match, prediction);
    return { ...prediction, ...score };
  });
}

function getOutcome(homeScore: number, awayScore: number) {
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "draw";
}
