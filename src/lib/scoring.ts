import type { Match, Prediction, PredictionDraft, Profile, Stage } from "./types";
import { getMatchStatus, inferWinner, needsAdvancer } from "./tournament";

export type ScoreResult = {
  points: number;
  exactHit: boolean;
  outcomeHit: boolean;
};

export function scorePrediction(match: Match, prediction: Prediction): ScoreResult {
  if (
    match.homeScore === null ||
    match.awayScore === null ||
    prediction.homeScore === null ||
    prediction.awayScore === null
  ) {
    return { points: 0, exactHit: false, outcomeHit: false };
  }

  const exactHit =
    prediction.homeScore === match.homeScore &&
    prediction.awayScore === match.awayScore;

  if (exactHit) {
    return { points: 3, exactHit: true, outcomeHit: true };
  }

  const predictedOutcome = getOutcome(
    prediction.homeScore,
    prediction.awayScore,
    prediction.winnerTeamId,
  );
  const officialOutcome = getOutcome(match.homeScore, match.awayScore, match.winnerTeamId);
  const outcomeHit = predictedOutcome !== null && predictedOutcome === officialOutcome;

  return { points: outcomeHit ? 1 : 0, exactHit: false, outcomeHit };
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

  if (needsAdvancer(match, draft) && !draft.winnerTeamId) {
    return { ok: false, reason: "Elegí quién clasifica." };
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

export function getPredictionWinner(match: Match, draft: PredictionDraft) {
  return inferWinner(match, draft);
}

function getOutcome(homeScore: number, awayScore: number, winnerTeamId: string | null) {
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return winnerTeamId ? `winner:${winnerTeamId}` : "draw";
}
