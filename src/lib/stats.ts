import type {
  Group, GroupPrediction, Match, Prediction, Profile, Stage, Team,
} from "./types";
import { getGroupStatus, getMatchStatus } from "./tournament";
import { getLeaderboard } from "./standings";

export type ChartKind = "bar" | "histogram" | "line" | "heatmap" | "matrix" | "matchSplit" | "thermometer";
export type FactCategory = "optimismo" | "manada" | "punteria" | "fidelidad" | "comportamiento";

export type FactId =
  | "optimista" | "candado" | "sin-empates"
  | "rebelde" | "del-monton" | "partido-dividido" | "palpito-solitario"
  | "francotirador" | "racha" | "trampa"
  | "mas-querido" | "mas-odiado" | "apuesta-audaz" | "apuesta-segura" | "favorito-familia"
  | "grupo-muerte" | "colista" | "visionario" | "profeta-grupos"
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
  bins?: HistogramBin[];    // histogram data carried on the fact (e.g. per-group contention)
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

export function finalizedGroupLabels(groups: Group[], now: Date): Set<string> {
  return new Set(
    groups.filter((g) => getGroupStatus(g, now) === "finalized").map((g) => g.groupLabel),
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

// For an already-sorted series, the people tied for the top value (only if >1 of them).
function topTies(series: PersonValue[]): PersonValue[] {
  if (series.length === 0) return [];
  const top = series.filter((s) => s.value === series[0]!.value);
  return top.length > 1 ? top : [];
}

// Headline for a team tally that names every team tied for the top count:
// "🇲🇽 México" · "🇲🇽 México y 🇨🇭 Suiza" · "🇲🇽 México, 🇨🇭 Suiza y 1 más".
function topTeamHeadline(tally: TeamTally[]): string | undefined {
  if (tally.length === 0) return undefined;
  const tied = tally.filter((t) => t.count === tally[0]!.count);
  const names = tied.map((t) => `${t.flag} ${t.name}`);
  if (names.length <= 2) return names.join(" y ");
  return `${names.slice(0, 2).join(", ")} y ${names.length - 2} más`;
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
  const hint = "Se revela cuando se cierra el pronóstico de un partido";
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
  const hint = "Se revela cuando se cierra el pronóstico de un partido";
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
  const hint = "Se revela a medida que se cargan los resultados";
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

  const hint = "Se revela cuando cierra el grupo";

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
  const matchHint = "Se revela cuando se cierra el pronóstico de un partido";

  const loved = lovedTeams[0];
  const masQuerido: Fact = {
    id: "mas-querido", category: "fidelidad", title: "El más querido", emoji: "💚",
    blurb: "El equipo que más veces pronosticaron como ganador", requires: "predictions",
    available: Boolean(loved), unavailableHint: matchHint, chartKind: "thermometer", unitSuffix: "triunfos",
    headline: topTeamHeadline(lovedTeams),
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
    headline: topTeamHeadline(hatedTeams),
    winner: hated
      ? { user: approved[0]!, value: hated.count, displayValue: `${hated.count} ${hated.count === 1 ? "derrota" : "derrotas"} pronosticadas` }
      : undefined,
    coWinners: [], series: [], teamSeries: hatedTeams,
  };

  // favorito-familia: the team most backed to top its group (the old "termómetro" graph, now a stat).
  const favorito = termometro[0];
  const favoritoFamilia: Fact = {
    id: "favorito-familia", category: "fidelidad", title: "El favorito de la familia", emoji: "👑",
    blurb: "El equipo más bancado para salir 1º de su grupo", requires: "predictions",
    available: Boolean(favorito), unavailableHint: hint, chartKind: "thermometer", unitSuffix: "votos",
    headline: topTeamHeadline(termometro),
    winner: favorito
      ? { user: approved[0]!, value: favorito.count, displayValue: `${favorito.count} ${favorito.count === 1 ? "voto" : "votos"} para salir 1º` }
      : undefined,
    coWinners: [], series: [], teamSeries: termometro,
  };

  // apuesta-audaz: per person, their single boldest 1st-place pick (the fewest others share).
  // apuesta-segura: per person, how much their 1st-place picks agree with everyone else ON
  // AVERAGE — the true inverse of boldness (a "plays it safe" spectrum, not just "who backed
  // the favorite"), so it differentiates people instead of collapsing onto one team.
  const denom = approved.length - 1; // max possible "others" sharing a pick
  const audaz: PersonValue[] = [];
  const segura: PersonValue[] = [];
  for (const user of approved) {
    const mine = revealed.filter((g) => g.userId === user.id);
    if (mine.length === 0) continue;
    let boldPick: { teamId: string; others: number } | null = null;
    let shareSum = 0;
    for (const g of mine) {
      const others = revealed.filter(
        (o) => o.groupLabel === g.groupLabel && o.userId !== user.id && o.firstTeamId === g.firstTeamId,
      ).length;
      if (boldPick === null || others < boldPick.others) boldPick = { teamId: g.firstTeamId!, others };
      shareSum += others;
    }
    if (boldPick) {
      const t = teamById.get(boldPick.teamId);
      const boldness = denom - boldPick.others; // alone with the pick => max
      const shareText = boldPick.others === 0
        ? "nadie más la eligió"
        : `${boldPick.others} ${boldPick.others === 1 ? "más la eligió" : "más la eligieron"}`;
      audaz.push({ user, value: boldness, displayValue: `${t?.flag ?? ""} ${t?.name ?? boldPick.teamId} · ${shareText}` });
    }
    const avgPct = denom > 0 ? Math.round((shareSum / mine.length / denom) * 100) : 0;
    segura.push({ user, value: avgPct, displayValue: `${avgPct}% de coincidencia promedio` });
  }
  audaz.sort((a, b) => b.value - a.value);
  segura.sort((a, b) => b.value - a.value);
  const apuestaAudaz: Fact = {
    id: "apuesta-audaz", category: "fidelidad", title: "La apuesta más audaz", emoji: "🎲",
    blurb: "El pronóstico de 1º de grupo que menos gente comparte", requires: "predictions",
    available: audaz.length > 0, unavailableHint: hint, chartKind: "bar", unitSuffix: "",
    winner: audaz[0], coWinners: topTies(audaz), series: audaz,
  };
  const apuestaSegura: Fact = {
    id: "apuesta-segura", category: "fidelidad", title: "La apuesta más segura", emoji: "🛡️",
    blurb: "Quien arma los 1º de grupo más en sintonía con la familia", requires: "predictions",
    available: segura.length > 0, unavailableHint: hint, chartKind: "bar", unitSuffix: "%",
    winner: segura[0], coWinners: topTies(segura), series: segura,
  };

  return { masQuerido, masOdiado, favoritoFamilia, apuestaAudaz, apuestaSegura, termometro };
}

export type DreamTableRow = { groupLabel: string; teamId: string; name: string; flag: string; votes: number; total: number };

const GROUP_HINT = "Se revela cuando cierra el grupo";
const GROUP_RESULT_HINT = "Se revela cuando se cargan los resultados de los grupos";

/** Stats mined from the full group-stage rankings (1º–4º order + exact positions). */
export function buildGroupRankingFacts(
  profiles: Profile[],
  groupPredictions: GroupPrediction[],
  teams: Team[],
  revealedGroups: Set<string>,
  finalizedGroups: Set<string>,
) {
  const approved = approvedProfiles(profiles);
  const approvedIds = new Set(approved.map((p) => p.id));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const teamName = (id: string | null) => (id ? teamById.get(id)?.name ?? id : "");
  const teamFlag = (id: string | null) => (id ? teamById.get(id)?.flag ?? "🏳️" : "🏳️");
  const toTally = (counts: Map<string, number>): TeamTally[] =>
    [...counts.entries()]
      .map(([teamId, count]) => ({ teamId, name: teamName(teamId), flag: teamFlag(teamId), count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const slots: Array<keyof GroupPrediction> = ["firstTeamId", "secondTeamId", "thirdTeamId", "fourthTeamId"];
  const revealed = groupPredictions.filter(
    (g) => revealedGroups.has(g.groupLabel) && approvedIds.has(g.userId) && g.firstTeamId,
  );

  const byGroup = new Map<string, GroupPrediction[]>();
  for (const g of revealed) {
    const list = byGroup.get(g.groupLabel) ?? [];
    list.push(g);
    byGroup.set(g.groupLabel, list);
  }

  // Modal (most-voted) team per (group, slot) + per-group contention. Needs ≥2 pickers.
  const modalAt = new Map<string, string>(); // `${group}:${slotIndex}` -> teamId
  const contentionByGroup = new Map<string, number>();
  for (const [label, picks] of byGroup) {
    if (picks.length < 2) continue;
    let disagreement = 0;
    slots.forEach((slot, i) => {
      const tally = new Map<string, number>();
      for (const p of picks) {
        const teamId = p[slot] as string | null;
        if (teamId) tally.set(teamId, (tally.get(teamId) ?? 0) + 1);
      }
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1] || teamName(a[0]).localeCompare(teamName(b[0])))[0];
      if (top) modalAt.set(`${label}:${i}`, top[0]);
      disagreement += 1 - (top?.[1] ?? 0) / picks.length;
    });
    contentionByGroup.set(label, disagreement / slots.length);
  }

  // 1 · Grupo de la muerte.
  const contentionBins: HistogramBin[] = [...contentionByGroup.entries()]
    .map(([label, c]) => ({ label, count: Math.round(c * 100) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const worst = contentionBins[0];
  const grupoMuerte: Fact = {
    id: "grupo-muerte", category: "manada", title: "Grupo de la muerte", emoji: "🪦",
    blurb: "El grupo donde la familia menos se pone de acuerdo", requires: "predictions",
    available: Boolean(worst), unavailableHint: GROUP_HINT, chartKind: "histogram",
    headline: worst ? `Grupo ${worst.label}` : undefined,
    winner: worst ? { user: approved[0]!, value: worst.count, displayValue: `${worst.count}% de desacuerdo` } : undefined,
    coWinners: [], series: [], bins: contentionBins,
  };

  // 2 · Colista cantado — most-predicted 4th place.
  const lastCounts = new Map<string, number>();
  for (const g of revealed) if (g.fourthTeamId) lastCounts.set(g.fourthTeamId, (lastCounts.get(g.fourthTeamId) ?? 0) + 1);
  const colistaTally = toTally(lastCounts);
  const buried = colistaTally[0];
  const colista: Fact = {
    id: "colista", category: "fidelidad", title: "El colista cantado", emoji: "⚰️",
    blurb: "El equipo que la familia más entierra en el fondo del grupo", requires: "predictions",
    available: Boolean(buried), unavailableHint: GROUP_HINT, chartKind: "thermometer", unitSuffix: "votos",
    headline: topTeamHeadline(colistaTally),
    winner: buried ? { user: approved[0]!, value: buried.count, displayValue: `${buried.count} ${buried.count === 1 ? "voto" : "votos"} al fondo` } : undefined,
    coWinners: [], series: [], teamSeries: colistaTally,
  };

  // 4 · El visionario — full-order divergence from the family consensus.
  const divergence: PersonValue[] = [];
  for (const user of approved) {
    const mine = revealed.filter((g) => g.userId === user.id);
    if (mine.length === 0) continue;
    let diff = 0;
    for (const g of mine) {
      slots.forEach((slot, i) => {
        const modal = modalAt.get(`${g.groupLabel}:${i}`);
        const teamId = g[slot] as string | null;
        if (modal && teamId && teamId !== modal) diff += 1;
      });
    }
    divergence.push({ user, value: diff, displayValue: `${diff} ${diff === 1 ? "casillero distinto" : "casilleros distintos"}` });
  }
  divergence.sort((a, b) => b.value - a.value);
  const visionario: Fact = {
    id: "visionario", category: "manada", title: "El visionario", emoji: "👁️",
    blurb: "Quien arma los grupos más distinto a todos", requires: "predictions",
    available: divergence.length > 0, unavailableHint: GROUP_HINT, chartKind: "bar", unitSuffix: "",
    winner: divergence[0], coWinners: topTies(divergence), series: divergence,
  };

  // 3 · El profeta de los grupos — exact positions across finalized groups.
  const profetaScore: PersonValue[] = [];
  for (const user of approved) {
    const mine = groupPredictions.filter((g) => g.userId === user.id && finalizedGroups.has(g.groupLabel));
    if (mine.length === 0) continue;
    const total = mine.reduce((t, g) => t + (g.exactPositions ?? 0), 0);
    profetaScore.push({ user, value: total, displayValue: `${total} ${total === 1 ? "acierto" : "aciertos"} de orden` });
  }
  profetaScore.sort((a, b) => b.value - a.value);
  const profeta: Fact = {
    id: "profeta-grupos", category: "punteria", title: "El profeta de los grupos", emoji: "🔮",
    blurb: "Quien más veces clavó el orden de un grupo", requires: "results",
    available: profetaScore.length > 0, unavailableHint: GROUP_RESULT_HINT, chartKind: "bar", unitSuffix: "",
    winner: profetaScore[0], coWinners: topTies(profetaScore), series: profetaScore,
  };

  // 9 · La tabla soñada — consensus 1st place per locked group.
  const dreamTable: DreamTableRow[] = [];
  for (const [label, picks] of byGroup) {
    const tally = new Map<string, number>();
    for (const p of picks) if (p.firstTeamId) tally.set(p.firstTeamId, (tally.get(p.firstTeamId) ?? 0) + 1);
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1] || teamName(a[0]).localeCompare(teamName(b[0])))[0];
    if (!top) continue;
    dreamTable.push({ groupLabel: label, teamId: top[0], name: teamName(top[0]), flag: teamFlag(top[0]), votes: top[1], total: picks.length });
  }
  dreamTable.sort((a, b) => a.groupLabel.localeCompare(b.groupLabel));

  return { grupoMuerte, colista, visionario, profeta, dreamTable };
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
  const hint = "Se revela cuando se cierra el pronóstico de un partido";
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
  groupsPicked?: number;
  groupChampions?: { groupLabel: string; flag: string; name: string }[];
  twin?: { name: string; pct: number };
  opposite?: { name: string; pct: number };
};

function buildPersonalCard(
  predictions: Prediction[],
  currentUserId: string,
  groupAvgGoals: number | undefined,
  finalized: Set<string>,
  groupPredictions: GroupPrediction[],
  teams: Team[],
): PersonalCard {
  const mine = predictions.filter((p) => p.userId === currentUserId);
  const myGroups = groupPredictions.filter((g) => g.userId === currentUserId && g.firstTeamId);
  if (mine.length === 0 && myGroups.length === 0) return { hasData: false };

  // My own group picks are personal data — show them immediately, no locks needed.
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const groupsPicked = myGroups.length || undefined;
  const groupChampions = myGroups.length
    ? [...myGroups]
        .sort((a, b) => a.groupLabel.localeCompare(b.groupLabel))
        .map((g) => ({
          groupLabel: g.groupLabel,
          flag: teamById.get(g.firstTeamId!)?.flag ?? "🏳️",
          name: teamById.get(g.firstTeamId!)?.name ?? g.firstTeamId!,
        }))
    : undefined;

  if (mine.length === 0) return { hasData: true, groupAvgGoals, groupsPicked, groupChampions };

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
  return { hasData: true, favoriteScoreline, avgGoals, groupAvgGoals, exactPct, groupsPicked, groupChampions };
}

/** From the similarity matrix, the current user's most- and least-similar family member. */
export function pickTwinAndOpposite(
  similarity: SimilarityMatrix,
  currentUserId: string,
): { twin?: { name: string; pct: number }; opposite?: { name: string; pct: number } } {
  const nameById = new Map(similarity.users.map((u) => [u.id, u.displayName]));
  const myCells = similarity.cells
    .filter((c) => c.aId === currentUserId)
    .sort((a, b) => b.value - a.value || (nameById.get(a.bId) ?? "").localeCompare(nameById.get(b.bId) ?? ""));
  if (myCells.length === 0 || myCells[0]!.value === 0) return {};
  const top = myCells[0]!;
  const bottom = myCells[myCells.length - 1]!;
  const twin = { name: nameById.get(top.bId) ?? "", pct: top.value };
  const opposite = myCells.length >= 2 ? { name: nameById.get(bottom.bId) ?? "", pct: bottom.value } : undefined;
  return opposite ? { twin, opposite } : { twin };
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

export type AccuracyBreakdownRow = { user: Profile; exact: number; outcome: number; miss: number; total: number };

/** Per-person split of finalized predictions into exacto / acierto de resultado / errado. */
export function buildAccuracyBreakdown(
  profiles: Profile[],
  predictions: Prediction[],
  finalized: Set<string>,
): AccuracyBreakdownRow[] {
  const approved = approvedProfiles(profiles);
  const rows: AccuracyBreakdownRow[] = [];
  for (const user of approved) {
    const mine = predictions.filter((p) => p.userId === user.id && finalized.has(p.matchId));
    if (mine.length === 0) continue;
    let exact = 0, outcome = 0, miss = 0;
    for (const p of mine) {
      if (p.exactHit) exact += 1;
      else if (p.outcomeHit) outcome += 1;
      else miss += 1;
    }
    rows.push({ user, exact, outcome, miss, total: mine.length });
  }
  return rows.sort((a, b) => b.exact - a.exact || b.outcome - a.outcome);
}

/** How many revealed (locked) matches each person actually predicted. Privacy-safe: locked only. */
export function buildParticipation(
  profiles: Profile[],
  predictions: Prediction[],
  revealed: Set<string>,
): { rows: PersonValue[]; total: number } {
  const approved = approvedProfiles(profiles);
  const total = revealed.size;
  const rows: PersonValue[] = approved
    .map((user) => {
      const count = predictions.filter((p) => p.userId === user.id && revealed.has(p.matchId)).length;
      return { user, value: count, displayValue: `${count} de ${total}` };
    })
    .sort((a, b) => b.value - a.value);
  return { rows, total };
}

/** Distribution of predicted goal margins across revealed predictions. */
export function buildGoalMargin(
  predictions: Prediction[],
  revealed: Set<string>,
): { bins: HistogramBin[]; total: number } {
  const buckets = new Map<string, number>();
  let total = 0;
  for (const p of predictions) {
    if (!revealed.has(p.matchId)) continue;
    const margin = Math.abs(p.homeScore - p.awayScore);
    const label = margin === 0 ? "Empate" : margin >= 4 ? "4+" : `${margin} gol${margin > 1 ? "es" : ""}`;
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
    total += 1;
  }
  const order = ["Empate", "1 gol", "2 goles", "3 goles", "4+"];
  const bins: HistogramBin[] = order
    .filter((l) => buckets.has(l))
    .map((label) => ({ label, count: buckets.get(label)! }));
  return { bins, total };
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
  accuracyBreakdown: AccuracyBreakdownRow[];
  participation: { rows: PersonValue[]; total: number };
  goalMargin: { bins: HistogramBin[]; total: number };
  dreamTable: DreamTableRow[];
  dividedMatchId?: string;
  trampaMatchId?: string;
};

export function computeStats(input: StatsInput): StatsBundle {
  const { profiles, predictions, groupPredictions, matches, groups, teams, currentUserId, standingsStages, now } = input;
  const revealed = revealedMatchIds(matches, now);
  const finalized = finalizedMatchIds(matches, now);
  const revealedGroups = revealedGroupLabels(groups, now);
  const finalizedGroups = finalizedGroupLabels(groups, now);

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
  const accuracyBreakdown = buildAccuracyBreakdown(profiles, predictions, finalized);
  const participation = buildParticipation(profiles, predictions, revealed);
  const goalMargin = buildGoalMargin(predictions, revealed);
  const groupRanking = buildGroupRankingFacts(profiles, groupPredictions, teams, revealedGroups, finalizedGroups);
  const twinOpposite = pickTwinAndOpposite(similarity, currentUserId);

  const facts: Fact[] = [
    optimism.optimista, optimism.candado, optimism.sinEmpates,
    consensus.rebelde, consensus.delMonton, consensus.partidoDividido,
    groupRanking.grupoMuerte, groupRanking.visionario,
    accuracy.francotirador, accuracy.racha, accuracy.trampa, groupRanking.profeta,
    loyalty.masQuerido, loyalty.masOdiado, loyalty.favoritoFamilia,
    loyalty.apuestaAudaz, loyalty.apuestaSegura, groupRanking.colista,
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
    personal: { ...buildPersonalCard(predictions, currentUserId, groupAvgGoals, finalized, groupPredictions, teams), ...twinOpposite },
    facts,
    termometro: loyalty.termometro,
    scoreline,
    similarity,
    pointsRace,
    pointsTotals,
    accuracyBreakdown,
    participation,
    goalMargin,
    dreamTable: groupRanking.dreamTable,
    dividedMatchId: consensus.dividedMatchId,
    trampaMatchId: accuracy.trampaMatchId,
  };
}
