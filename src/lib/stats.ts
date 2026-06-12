import type {
  Group, GroupPrediction, Match, Prediction, Profile, Stage, Team,
} from "./types";
import { getGroupStatus, getMatchStatus } from "./tournament";
import { getLeaderboard } from "./standings";

export type ChartKind = "bar" | "histogram" | "line" | "heatmap" | "matrix" | "matchSplit" | "thermometer";
export type FactCategory = "optimismo" | "manada" | "punteria" | "fidelidad" | "comportamiento";

export type FactId =
  | "optimista" | "candado" | "scoreline-favorito" | "sin-empates"
  | "rebelde" | "del-monton" | "partido-dividido" | "palpito-solitario"
  | "francotirador" | "racha" | "trampa"
  | "favorito-familia" | "oveja-negra" | "mas-querido" | "mas-odiado" | "apuesta-audaz"
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
  headline?: string;        // overrides the winner's name in the card (e.g. a team, not a person)
  teamSeries?: TeamTally[]; // team-based chart data (for thermometer-style facts)
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

export function buildAccuracyFacts(
  profiles: Profile[],
  predictions: Prediction[],
  matches: Match[],
  finalized: Set<string>,
) {
  const approved = approvedProfiles(profiles);
  const kickoffById = new Map(matches.map((m) => [m.id, m.kickoffUtc]));

  const exactPct: PersonValue[] = [];
  const streak: PersonValue[] = [];
  for (const user of approved) {
    const mine = predictions
      .filter((p) => p.userId === user.id && finalized.has(p.matchId))
      .sort((a, b) =>
        (kickoffById.get(a.matchId) ?? "").localeCompare(kickoffById.get(b.matchId) ?? ""),
      );
    if (mine.length === 0) continue;
    const exact = mine.filter((p) => p.exactHit).length;
    const pct = Math.round((exact / mine.length) * 100);
    exactPct.push({ user, value: pct, displayValue: `${pct}% exactos` });

    let best = 0;
    let run = 0;
    for (const p of mine) {
      run = p.outcomeHit ? run + 1 : 0;
      if (run > best) best = run;
    }
    streak.push({ user, value: best, displayValue: `${best} seguidos` });
  }

  // La trampa: finalized match with lowest share of correct outcomes.
  let trampaMatchId: string | undefined;
  let worstShare = 2;
  for (const matchId of finalized) {
    const forMatch = predictions.filter((p) => p.matchId === matchId);
    if (forMatch.length === 0) continue;
    const correct = forMatch.filter((p) => p.outcomeHit).length;
    const share = correct / forMatch.length;
    if (share < worstShare) { worstShare = share; trampaMatchId = matchId; }
  }

  const available = exactPct.length > 0;
  const hint = "Se revela cuando haya resultados cargados";
  const fr = pickWinner(exactPct, (a, b) => a > b);
  const ra = pickWinner(streak, (a, b) => a > b);

  const francotirador: Fact = {
    id: "francotirador", category: "punteria", title: "El francotirador", emoji: "🎯",
    blurb: "Mejor porcentaje de resultados exactos", requires: "results",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "%",
    winner: fr.winner, coWinners: fr.coWinners,
    series: [...exactPct].sort((a, b) => b.value - a.value),
  };
  const racha: Fact = {
    id: "racha", category: "punteria", title: "Racha caliente", emoji: "🔥",
    blurb: "Más aciertos de resultado seguidos", requires: "results",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "",
    winner: ra.winner, coWinners: ra.coWinners,
    series: [...streak].sort((a, b) => b.value - a.value),
  };
  const trampa: Fact = {
    id: "trampa", category: "punteria", title: "La trampa", emoji: "🪤",
    blurb: "El partido que casi todos erraron", requires: "results",
    available: Boolean(trampaMatchId), unavailableHint: hint, chartKind: "matchSplit",
    winner: undefined, coWinners: [], series: [],
  };

  return { francotirador, racha, trampa, trampaMatchId };
}

export type TeamTally = { teamId: string; name: string; flag: string; count: number };

export function buildTeamLoyaltyFacts(
  profiles: Profile[],
  groupPredictions: GroupPrediction[],
  predictions: Prediction[],
  matches: Match[],
  teams: Team[],
  revealedGroups: Set<string>,
  revealedMatches: Set<string>,
) {
  const approved = approvedProfiles(profiles);
  const approvedIds = new Set(approved.map((p) => p.id));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const toTally = (counts: Map<string, number>): TeamTally[] =>
    [...counts.entries()]
      .map(([teamId, count]) => ({
        teamId,
        name: teamById.get(teamId)?.name ?? teamId,
        flag: teamById.get(teamId)?.flag ?? "🏳️",
        count,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const revealed = groupPredictions.filter(
    (g) => revealedGroups.has(g.groupLabel) && approvedIds.has(g.userId) && g.firstTeamId,
  );

  const counts = new Map<string, number>();
  for (const g of revealed) counts.set(g.firstTeamId!, (counts.get(g.firstTeamId!) ?? 0) + 1);
  const termometro = toTally(counts);

  const available = termometro.length > 0;
  const hint = "Se revela cuando cierren los grupos";

  const top = termometro[0];
  const favoritoFamilia: Fact = {
    id: "favorito-familia", category: "fidelidad", title: "El favorito de la familia", emoji: "👑",
    blurb: "El equipo que más veces sale 1º en los pronósticos", requires: "predictions",
    available, unavailableHint: hint, chartKind: "thermometer", unitSuffix: "votos",
    headline: top ? `${top.flag} ${top.name}` : undefined,
    winner: top
      ? { user: approved[0]!, value: top.count, displayValue: `${top.count} ${top.count === 1 ? "voto" : "votos"}` }
      : undefined,
    coWinners: [], series: [], teamSeries: termometro,
  };

  const lone = [...termometro].reverse().find((t) => t.count === 1);
  const ovejaNegra: Fact = {
    id: "oveja-negra", category: "fidelidad", title: "La oveja negra", emoji: "🐐",
    blurb: "Un equipo en el que cree una sola persona", requires: "predictions",
    available: Boolean(lone), unavailableHint: hint, chartKind: "thermometer", unitSuffix: "votos",
    headline: lone ? `${lone.flag} ${lone.name}` : undefined,
    winner: lone
      ? { user: approved[0]!, value: 1, displayValue: "La banca una sola persona" }
      : undefined,
    coWinners: [], series: [], teamSeries: termometro,
  };

  // mas-querido / mas-odiado: across revealed match predictions, count how many
  // times each team was predicted to win vs. lose.
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  for (const p of predictions) {
    if (!revealedMatches.has(p.matchId) || !approvedIds.has(p.userId)) continue;
    const m = matchById.get(p.matchId);
    if (!m || !m.homeTeamId || !m.awayTeamId) continue;
    const outcome = predictedOutcome(p.homeScore, p.awayScore);
    if (outcome === "home") {
      wins.set(m.homeTeamId, (wins.get(m.homeTeamId) ?? 0) + 1);
      losses.set(m.awayTeamId, (losses.get(m.awayTeamId) ?? 0) + 1);
    } else if (outcome === "away") {
      wins.set(m.awayTeamId, (wins.get(m.awayTeamId) ?? 0) + 1);
      losses.set(m.homeTeamId, (losses.get(m.homeTeamId) ?? 0) + 1);
    }
  }
  const lovedTeams = toTally(wins);
  const hatedTeams = toTally(losses);
  const matchHint = "Se revela cuando cierren los partidos";

  const loved = lovedTeams[0];
  const masQuerido: Fact = {
    id: "mas-querido", category: "fidelidad", title: "El más querido", emoji: "💚",
    blurb: "El equipo que más veces pronosticaron como ganador", requires: "predictions",
    available: Boolean(loved), unavailableHint: matchHint, chartKind: "thermometer", unitSuffix: "triunfos",
    headline: loved ? `${loved.flag} ${loved.name}` : undefined,
    winner: loved
      ? { user: approved[0]!, value: loved.count, displayValue: `${loved.count} ${loved.count === 1 ? "victoria" : "victorias"} pronosticadas` }
      : undefined,
    coWinners: [], series: [], teamSeries: lovedTeams,
  };

  const hated = hatedTeams[0];
  const masOdiado: Fact = {
    id: "mas-odiado", category: "fidelidad", title: "El más odiado", emoji: "💔",
    blurb: "El equipo que más veces pronosticaron como perdedor", requires: "predictions",
    available: Boolean(hated), unavailableHint: matchHint, chartKind: "thermometer", unitSuffix: "derrotas",
    headline: hated ? `${hated.flag} ${hated.name}` : undefined,
    winner: hated
      ? { user: approved[0]!, value: hated.count, displayValue: `${hated.count} ${hated.count === 1 ? "derrota" : "derrotas"} pronosticadas` }
      : undefined,
    coWinners: [], series: [], teamSeries: hatedTeams,
  };

  // apuesta-audaz: per person, their 1st-place group pick that the fewest others share.
  const audaz: PersonValue[] = [];
  for (const user of approved) {
    const mine = revealed.filter((g) => g.userId === user.id);
    if (mine.length === 0) continue;
    let best: { teamId: string; others: number } | null = null;
    for (const g of mine) {
      const others = revealed.filter(
        (o) => o.groupLabel === g.groupLabel && o.userId !== user.id && o.firstTeamId === g.firstTeamId,
      ).length;
      if (best === null || others < best.others) best = { teamId: g.firstTeamId!, others };
    }
    if (!best) continue;
    const t = teamById.get(best.teamId);
    const boldness = (approved.length - 1) - best.others; // alone with the pick => max
    const shareText = best.others === 0
      ? "nadie más la eligió"
      : `${best.others} ${best.others === 1 ? "más la eligió" : "más la eligieron"}`;
    audaz.push({ user, value: boldness, displayValue: `${t?.flag ?? ""} ${t?.name ?? best.teamId} · ${shareText}` });
  }
  audaz.sort((a, b) => b.value - a.value);
  const boldest = audaz[0];
  const apuestaAudaz: Fact = {
    id: "apuesta-audaz", category: "fidelidad", title: "La apuesta más audaz", emoji: "🎲",
    blurb: "El pronóstico de 1º de grupo que menos gente comparte", requires: "predictions",
    available: audaz.length > 0, unavailableHint: hint, chartKind: "bar", unitSuffix: "",
    winner: boldest, coWinners: [], series: audaz,
  };

  return { favoritoFamilia, ovejaNegra, masQuerido, masOdiado, apuestaAudaz, termometro };
}

export function buildBehaviorFacts(
  profiles: Profile[],
  predictions: Prediction[],
  matches: Match[],
  revealed: Set<string>,
) {
  const approved = approvedProfiles(profiles);
  const kickoffById = new Map(matches.map((m) => [m.id, m.kickoffUtc]));

  const leadHours: PersonValue[] = [];
  const edits: PersonValue[] = [];
  for (const user of approved) {
    const mine = predictions.filter((p) => p.userId === user.id && revealed.has(p.matchId));
    if (mine.length === 0) continue;
    let totalLead = 0;
    let edited = 0;
    for (const p of mine) {
      const kickoff = kickoffById.get(p.matchId);
      if (kickoff) {
        const hrs = (new Date(kickoff).getTime() - new Date(p.updatedAt).getTime()) / 3_600_000;
        totalLead += hrs;
      }
      if (new Date(p.updatedAt).getTime() > new Date(p.createdAt).getTime()) edited += 1;
    }
    const avgLead = Math.round(totalLead / mine.length);
    leadHours.push({ user, value: avgLead, displayValue: `${avgLead} h de anticipación` });
    edits.push({ user, value: edited, displayValue: `${edited} ediciones` });
  }

  const available = leadHours.length > 0;
  const hint = "Se revela cuando cierren los partidos";
  const mad = pickWinner(leadHours, (a, b) => a > b);
  const last = pickWinner(leadHours, (a, b) => a < b);
  const ind = pickWinner(edits, (a, b) => a > b);

  const madrugador: Fact = {
    id: "madrugador", category: "comportamiento", title: "El madrugador", emoji: "🌅",
    blurb: "Carga sus pronósticos con más anticipación", requires: "predictions",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "h",
    winner: mad.winner, coWinners: mad.coWinners,
    series: [...leadHours].sort((a, b) => b.value - a.value),
  };
  const ultimoMinuto: Fact = {
    id: "ultimo-minuto", category: "comportamiento", title: "El del último minuto", emoji: "⏰",
    blurb: "Carga sobre la hora del cierre", requires: "predictions",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "h",
    winner: last.winner, coWinners: last.coWinners,
    series: [...leadHours].sort((a, b) => a.value - b.value),
  };
  const indeciso: Fact = {
    id: "indeciso", category: "comportamiento", title: "El indeciso", emoji: "🤔",
    blurb: "El que más veces cambió de opinión", requires: "predictions",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "",
    winner: ind.winner, coWinners: ind.coWinners,
    series: [...edits].sort((a, b) => b.value - a.value),
  };

  return { madrugador, ultimoMinuto, indeciso };
}

export type SimilarityCell = { aId: string; bId: string; value: number };
export type SimilarityMatrix = { users: Profile[]; cells: SimilarityCell[] };

export function buildSimilarityMatrix(
  profiles: Profile[],
  predictions: Prediction[],
  revealed: Set<string>,
): SimilarityMatrix {
  const users = approvedProfiles(profiles);
  const outcomeByUserMatch = new Map<string, Map<string, Outcome>>();
  for (const p of predictions) {
    if (!revealed.has(p.matchId)) continue;
    const m = outcomeByUserMatch.get(p.userId) ?? new Map<string, Outcome>();
    m.set(p.matchId, predictedOutcome(p.homeScore, p.awayScore));
    outcomeByUserMatch.set(p.userId, m);
  }
  const cells: SimilarityCell[] = [];
  for (const a of users) {
    for (const b of users) {
      if (a.id === b.id) continue;
      const ma = outcomeByUserMatch.get(a.id);
      const mb = outcomeByUserMatch.get(b.id);
      if (!ma || !mb) { cells.push({ aId: a.id, bId: b.id, value: 0 }); continue; }
      let shared = 0;
      let agree = 0;
      for (const [matchId, oa] of ma) {
        const ob = mb.get(matchId);
        if (ob === undefined) continue;
        shared += 1;
        if (oa === ob) agree += 1;
      }
      cells.push({ aId: a.id, bId: b.id, value: shared ? Math.round((agree / shared) * 100) : 0 });
    }
  }
  return { users, cells };
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

export type PersonalCard = {
  hasData: boolean;
  favoriteScoreline?: string;
  avgGoals?: number;
  groupAvgGoals?: number;
  exactPct?: number;
};

function buildPersonalCard(
  predictions: Prediction[],
  currentUserId: string,
  groupAvgGoals: number | undefined,
  finalized: Set<string>,
): PersonalCard {
  const mine = predictions.filter((p) => p.userId === currentUserId);
  if (mine.length === 0) return { hasData: false };
  const counts = new Map<string, number>();
  for (const p of mine) {
    const key = `${p.homeScore}-${p.awayScore}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const favoriteScoreline = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const avgGoals = round1(mine.reduce((t, p) => t + p.homeScore + p.awayScore, 0) / mine.length);
  const finals = mine.filter((p) => finalized.has(p.matchId));
  const exactPct = finals.length
    ? Math.round((finals.filter((p) => p.exactHit).length / finals.length) * 100)
    : undefined;
  return { hasData: true, favoriteScoreline, avgGoals, groupAvgGoals, exactPct };
}

const ES_MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** "2026-06-10" -> "10 Jun" (locale-independent). */
function formatDayLabel(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  return `${Number(d)} ${ES_MONTHS[Number(m) - 1] ?? m}`;
}

export type PointsRace = {
  data: Array<Record<string, number | string>>;
  keys: string[]; // one line per approved person (display name)
};

/** Cumulative match points per person across the dates matches were played. */
export function buildPointsRace(
  profiles: Profile[],
  predictions: Prediction[],
  matches: Match[],
  finalized: Set<string>,
): PointsRace {
  const approved = approvedProfiles(profiles);
  const finalMatches = matches
    .filter((m) => finalized.has(m.id))
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
  if (finalMatches.length === 0 || approved.length === 0) return { data: [], keys: [] };

  const dateKeys: string[] = [];
  const byDate = new Map<string, Match[]>();
  for (const m of finalMatches) {
    const key = m.kickoffUtc.slice(0, 10);
    if (!byDate.has(key)) { byDate.set(key, []); dateKeys.push(key); }
    byDate.get(key)!.push(m);
  }

  const pointsByUserMatch = new Map<string, number>();
  for (const p of predictions) pointsByUserMatch.set(`${p.userId}:${p.matchId}`, p.points ?? 0);

  const cumulative = new Map<string, number>(approved.map((u) => [u.id, 0]));
  const data = dateKeys.map((key) => {
    for (const m of byDate.get(key)!) {
      for (const u of approved) {
        cumulative.set(u.id, cumulative.get(u.id)! + (pointsByUserMatch.get(`${u.id}:${m.id}`) ?? 0));
      }
    }
    const row: Record<string, number | string> = { stage: formatDayLabel(key) };
    for (const u of approved) row[u.displayName] = cumulative.get(u.id)!;
    return row;
  });

  return { data, keys: approved.map((u) => u.displayName) };
}

export type StatsBundle = {
  hero: { goalsDreamed: number; predictionsLoaded: number; groupExactPct: number; dividedMatchId?: string };
  personal: PersonalCard;
  facts: Fact[];
  termometro: TeamTally[];
  scoreline: ReturnType<typeof buildScorelineHistogram>;
  similarity: SimilarityMatrix;
  pointsRace: PointsRace;
  pointsTotals: PersonValue[];
  dividedMatchId?: string;
  trampaMatchId?: string;
};

export function computeStats(input: StatsInput): StatsBundle {
  const { profiles, predictions, groupPredictions, matches, groups, teams, currentUserId, standingsStages, now } = input;
  const revealed = revealedMatchIds(matches, now);
  const finalized = finalizedMatchIds(matches, now);
  const revealedGroups = revealedGroupLabels(groups, now);

  const optimism = buildOptimismFacts(profiles, predictions, revealed);
  const consensus = buildConsensusFacts(profiles, predictions, revealed);
  const accuracy = buildAccuracyFacts(profiles, predictions, matches, finalized);
  const loyalty = buildTeamLoyaltyFacts(profiles, groupPredictions, predictions, matches, teams, revealedGroups, revealed);
  const behavior = buildBehaviorFacts(profiles, predictions, matches, revealed);
  const scoreline = buildScorelineHistogram(predictions, revealed);
  const similarity = buildSimilarityMatrix(profiles, predictions, revealed);
  const pointsRace = buildPointsRace(profiles, predictions, matches, finalized);
  const pointsTotals: PersonValue[] = getLeaderboard({ profiles, predictions, groupPredictions, matches, standingsStages })
    .map((row) => ({ user: row.user, value: row.points, displayValue: `${row.points} pts` }));

  const facts: Fact[] = [
    optimism.optimista, optimism.candado, optimism.sinEmpates,
    {
      id: "scoreline-favorito", category: "optimismo", title: "Scoreline favorito", emoji: "📊",
      blurb: "El resultado más pronosticado por la familia", requires: "predictions",
      available: scoreline.total > 0, unavailableHint: "Se revela cuando cierren los partidos",
      chartKind: "histogram",
      winner: scoreline.mode
        ? { user: profiles[0]!, value: scoreline.mode.count, displayValue: `${scoreline.mode.label} (${scoreline.mode.count}x)` }
        : undefined,
      coWinners: [], series: [],
    },
    consensus.rebelde, consensus.delMonton, consensus.partidoDividido,
    accuracy.francotirador, accuracy.racha, accuracy.trampa,
    loyalty.favoritoFamilia, loyalty.ovejaNegra, loyalty.masQuerido, loyalty.masOdiado, loyalty.apuestaAudaz,
    behavior.madrugador, behavior.ultimoMinuto, behavior.indeciso,
  ];

  const groupAvgGoals = optimism.optimista.series.length
    ? round1(optimism.optimista.series.reduce((t, s) => t + s.value, 0) / optimism.optimista.series.length)
    : undefined;

  const revealedPreds = predictions.filter((p) => revealed.has(p.matchId));
  const finalizedPreds = predictions.filter((p) => finalized.has(p.matchId));
  const hero = {
    goalsDreamed: predictions.reduce((t, p) => t + p.homeScore + p.awayScore, 0),
    predictionsLoaded: revealedPreds.length,
    groupExactPct: finalizedPreds.length
      ? Math.round((finalizedPreds.filter((p) => p.exactHit).length / finalizedPreds.length) * 100)
      : 0,
    dividedMatchId: consensus.dividedMatchId,
  };

  return {
    hero,
    personal: buildPersonalCard(predictions, currentUserId, groupAvgGoals, finalized),
    facts,
    termometro: loyalty.termometro,
    scoreline,
    similarity,
    pointsRace,
    pointsTotals,
    dividedMatchId: consensus.dividedMatchId,
    trampaMatchId: accuracy.trampaMatchId,
  };
}
