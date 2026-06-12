import type {
  Group, GroupPrediction, Match, Prediction, Profile, Stage, Team,
} from "./types";
import { getGroupStatus, getMatchStatus } from "./tournament";

export type ChartKind = "bar" | "histogram" | "line" | "heatmap" | "matrix" | "matchSplit";
export type FactCategory = "optimismo" | "manada" | "punteria" | "fidelidad" | "comportamiento";

export type FactId =
  | "optimista" | "candado" | "scoreline-favorito" | "sin-empates"
  | "rebelde" | "del-monton" | "partido-dividido" | "palpito-solitario"
  | "francotirador" | "racha" | "trampa"
  | "favorito-familia" | "oveja-negra" | "equipo-cabecera"
  | "madrugador" | "ultimo-minuto" | "indeciso";

export type PersonValue = {
  user: Profile;
  value: number;        // numeric, for sorting and plotting
  displayValue: string; // human label shown in chart/table
};

export type Fact = {
  id: FactId;
  category: FactCategory;
  title: string;
  emoji: string;
  blurb: string;
  requires: "predictions" | "results";
  available: boolean;
  unavailableHint?: string;
  chartKind: ChartKind;
  winner?: PersonValue;
  coWinners: PersonValue[]; // [] unless tie
  series: PersonValue[];    // per-person data (empty when unavailable)
  unitSuffix?: string;
};

export type StatsInput = {
  profiles: Profile[];
  predictions: Prediction[];
  groupPredictions: GroupPrediction[];
  matches: Match[];
  groups: Group[];
  teams: Team[];
  currentUserId: string;
  standingsStages: Set<Stage>;
  now: Date;
};

export function revealedMatchIds(matches: Match[], now: Date): Set<string> {
  return new Set(
    matches.filter((m) => getMatchStatus(m, now) !== "open").map((m) => m.id),
  );
}

export function finalizedMatchIds(matches: Match[], now: Date): Set<string> {
  return new Set(
    matches.filter((m) => getMatchStatus(m, now) === "finalized").map((m) => m.id),
  );
}

export function revealedGroupLabels(groups: Group[], now: Date): Set<string> {
  return new Set(
    groups.filter((g) => getGroupStatus(g, now) !== "open").map((g) => g.groupLabel),
  );
}

export const approvedProfiles = (profiles: Profile[]) =>
  profiles.filter((p) => p.approved);

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Picks the top entry by comparator, returning winner + any ties as coWinners.
function pickWinner(series: PersonValue[], better: (a: number, b: number) => boolean) {
  if (series.length === 0) return { winner: undefined, coWinners: [] as PersonValue[] };
  let best = series[0]!;
  for (const s of series) if (better(s.value, best.value)) best = s;
  const coWinners = series.filter((s) => s.value === best.value);
  return { winner: best, coWinners: coWinners.length > 1 ? coWinners : [] };
}

export function buildOptimismFacts(
  profiles: Profile[],
  predictions: Prediction[],
  revealed: Set<string>,
) {
  const approved = approvedProfiles(profiles);
  const revealedPreds = predictions.filter((p) => revealed.has(p.matchId));

  const avgGoals: PersonValue[] = [];
  const drawPct: PersonValue[] = [];
  for (const user of approved) {
    const mine = revealedPreds.filter((p) => p.userId === user.id);
    if (mine.length === 0) continue;
    const goals = mine.reduce((t, p) => t + p.homeScore + p.awayScore, 0) / mine.length;
    const draws = mine.filter((p) => p.homeScore === p.awayScore).length;
    avgGoals.push({ user, value: round1(goals), displayValue: `${round1(goals)} goles/partido` });
    drawPct.push({
      user,
      value: Math.round((draws / mine.length) * 100),
      displayValue: `${Math.round((draws / mine.length) * 100)}% empates`,
    });
  }

  const available = avgGoals.length > 0;
  const hint = "Se revela cuando cierren los partidos";
  const sortDesc = (s: PersonValue[]) => [...s].sort((a, b) => b.value - a.value);
  const sortAsc = (s: PersonValue[]) => [...s].sort((a, b) => a.value - b.value);

  const opt = pickWinner(avgGoals, (a, b) => a > b);
  const can = pickWinner(avgGoals, (a, b) => a < b);
  const noDraw = pickWinner(drawPct, (a, b) => a < b);

  const optimista: Fact = {
    id: "optimista", category: "optimismo", title: "El más optimista", emoji: "🎯",
    blurb: "Quien pronostica más goles por partido", requires: "predictions",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "goles",
    winner: opt.winner, coWinners: opt.coWinners, series: sortDesc(avgGoals),
  };
  const candado: Fact = {
    id: "candado", category: "optimismo", title: "El candado", emoji: "🔒",
    blurb: "El más defensivo: menos goles imaginados", requires: "predictions",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "goles",
    winner: can.winner, coWinners: can.coWinners, series: sortAsc(avgGoals),
  };
  const sinEmpates: Fact = {
    id: "sin-empates", category: "optimismo", title: "Nunca cree en empates", emoji: "🙅",
    blurb: "Menor porcentaje de empates pronosticados", requires: "predictions",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "%",
    winner: noDraw.winner, coWinners: noDraw.coWinners, series: sortAsc(drawPct),
  };

  return { optimista, candado, sinEmpates };
}

export type Outcome = "home" | "away" | "draw";

export function predictedOutcome(home: number, away: number): Outcome {
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

function crowdOutcomeByMatch(predictions: Prediction[], revealed: Set<string>) {
  const byMatch = new Map<string, Map<Outcome, number>>();
  for (const p of predictions) {
    if (!revealed.has(p.matchId)) continue;
    const tally = byMatch.get(p.matchId) ?? new Map<Outcome, number>();
    const o = predictedOutcome(p.homeScore, p.awayScore);
    tally.set(o, (tally.get(o) ?? 0) + 1);
    byMatch.set(p.matchId, tally);
  }
  const crowd = new Map<string, Outcome>();
  for (const [matchId, tally] of byMatch) {
    let best: Outcome = "home";
    let bestN = -1;
    for (const o of ["home", "away", "draw"] as Outcome[]) {
      const n = tally.get(o) ?? 0;
      if (n > bestN) { bestN = n; best = o; }
    }
    crowd.set(matchId, best);
  }
  return { crowd, byMatch };
}

export function buildConsensusFacts(
  profiles: Profile[],
  predictions: Prediction[],
  revealed: Set<string>,
) {
  const approved = approvedProfiles(profiles);
  const { crowd, byMatch } = crowdOutcomeByMatch(predictions, revealed);

  const contrarianRate: PersonValue[] = [];
  for (const user of approved) {
    const mine = predictions.filter((p) => p.userId === user.id && revealed.has(p.matchId));
    if (mine.length === 0) continue;
    const against = mine.filter(
      (p) => predictedOutcome(p.homeScore, p.awayScore) !== crowd.get(p.matchId),
    ).length;
    const pct = Math.round((against / mine.length) * 100);
    contrarianRate.push({ user, value: pct, displayValue: `${pct}% contra la mayoría` });
  }

  // Most divided match = highest entropy of outcome distribution.
  let dividedMatchId: string | undefined;
  let bestEntropy = -1;
  for (const [matchId, tally] of byMatch) {
    const total = [...tally.values()].reduce((t, n) => t + n, 0);
    if (total < 2) continue;
    let entropy = 0;
    for (const n of tally.values()) {
      const pr = n / total;
      if (pr > 0) entropy -= pr * Math.log2(pr);
    }
    if (entropy > bestEntropy) { bestEntropy = entropy; dividedMatchId = matchId; }
  }

  const available = contrarianRate.length > 0;
  const hint = "Se revela cuando cierren los partidos";
  const reb = pickWinner(contrarianRate, (a, b) => a > b);
  const mon = pickWinner(contrarianRate, (a, b) => a < b);

  const rebelde: Fact = {
    id: "rebelde", category: "manada", title: "El rebelde", emoji: "🤘",
    blurb: "El que más se aparta de la mayoría", requires: "predictions",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "%",
    winner: reb.winner, coWinners: reb.coWinners,
    series: [...contrarianRate].sort((a, b) => b.value - a.value),
  };
  const delMonton: Fact = {
    id: "del-monton", category: "manada", title: "El del montón", emoji: "🐑",
    blurb: "El que más vota con la mayoría", requires: "predictions",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "%",
    winner: mon.winner, coWinners: mon.coWinners,
    series: [...contrarianRate].sort((a, b) => a.value - b.value),
  };
  const partidoDividido: Fact = {
    id: "partido-dividido", category: "manada", title: "El partido más dividido", emoji: "⚖️",
    blurb: "Donde la familia está más repartida", requires: "predictions",
    available: Boolean(dividedMatchId), unavailableHint: hint, chartKind: "matchSplit",
    winner: undefined, coWinners: [], series: [],
  };

  return { rebelde, delMonton, partidoDividido, dividedMatchId };
}

export type HistogramBin = { label: string; count: number };

export function buildScorelineHistogram(predictions: Prediction[], revealed: Set<string>) {
  const counts = new Map<string, number>();
  let total = 0;
  for (const p of predictions) {
    if (!revealed.has(p.matchId)) continue;
    const key = `${p.homeScore}-${p.awayScore}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total += 1;
  }
  const bins: HistogramBin[] = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { bins, total, mode: bins[0] };
}
