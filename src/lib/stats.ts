import type {
  Group, GroupPrediction, Match, Prediction, Profile, Stage, Team,
} from "./types";
import { getGroupStatus, getMatchStatus } from "./tournament";
import { getLeaderboard } from "./standings";

export type ChartKind = "bar" | "histogram" | "line" | "heatmap" | "matrix" | "matchSplit" | "thermometer";
export type FactCategory = "optimismo" | "manada" | "punteria" | "fidelidad" | "veredicto" | "rachas";

export type FactId =
  | "optimista" | "candado" | "sin-empates"
  | "rebelde" | "del-monton" | "partido-dividido" | "palpito-solitario"
  | "francotirador" | "racha" | "trampa"
  | "mas-querido" | "mas-odiado" | "apuesta-audaz" | "apuesta-segura" | "favorito-familia"
  | "grupo-muerte" | "grupo-unanime" | "colista" | "visionario" | "profeta-grupos"
  | "madrugador" | "ultimo-minuto" | "indeciso"
  | "audaz-premiada" | "rebelde-razon" | "profeta-solitario" | "visionario-confirmado"
  | "sorpresa" | "decepcion" | "ojo-clinico" | "metodo-paga" | "manada-sabia" | "grupo-cantado"
  | "sequia" | "en-llamas" | "en-sequia";

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
  winnerSummary?: string;   // overrides the winner's value line when tied winners differ (e.g. distinct picks)
  teamSeries?: TeamTally[]; // team-based chart data (for thermometer-style facts)
  bins?: HistogramBin[];    // histogram data carried on the fact (e.g. per-group contention)
  valueDetail?: string;     // phrase appended to the value in the chart hover tooltip ("de desacuerdo")
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

// "A" · "A y B" · "A, B y 1 más" · "A, B y 2 más" …
function formatList(items: string[]): string {
  if (items.length <= 2) return items.join(" y ");
  return `${items.slice(0, 2).join(", ")} y ${items.length - 2} más`;
}

// Headline for a team tally that names every team tied for the top count:
// "🇲🇽 México" · "🇲🇽 México y 🇨🇭 Suiza" · "🇲🇽 México, 🇨🇭 Suiza y 1 más".
function topTeamHeadline(tally: TeamTally[]): string | undefined {
  if (tally.length === 0) return undefined;
  const tied = tally.filter((t) => t.count === tally[0]!.count);
  return formatList(tied.map((t) => `${t.flag} ${t.name}`));
}

const GROUP_SLOTS: Array<keyof GroupPrediction> = ["firstTeamId", "secondTeamId", "thirdTeamId", "fourthTeamId"];

// Family consensus team per `${groupLabel}:${slotIndex}`. Needs ≥2 pickers in the
// group (a lone picker has no "consensus"). Ties broken by team name.
export function modalGroupPositions(
  revealed: GroupPrediction[],
  teamName: (id: string) => string,
): Map<string, string> {
  const byGroup = new Map<string, GroupPrediction[]>();
  for (const g of revealed) {
    const list = byGroup.get(g.groupLabel) ?? [];
    list.push(g);
    byGroup.set(g.groupLabel, list);
  }
  const modal = new Map<string, string>();
  for (const [label, picks] of byGroup) {
    if (picks.length < 2) continue;
    GROUP_SLOTS.forEach((slot, i) => {
      const tally = new Map<string, number>();
      for (const p of picks) {
        const teamId = p[slot] as string | null;
        if (teamId) tally.set(teamId, (tally.get(teamId) ?? 0) + 1);
      }
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1] || teamName(a[0]).localeCompare(teamName(b[0])))[0];
      if (top) modal.set(`${label}:${i}`, top[0]);
    });
  }
  return modal;
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
    id: "sin-empates", category: "optimismo", title: "El que nunca cree en empates", emoji: "🙅",
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

export function crowdOutcomeByMatch(predictions: Prediction[], revealed: Set<string>) {
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

  const francotirador: Fact = {
    id: "francotirador", category: "punteria", title: "El francotirador", emoji: "🎯",
    blurb: "Mejor porcentaje de resultados exactos", requires: "results",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "%",
    winner: fr.winner, coWinners: fr.coWinners,
    series: [...exactPct].sort((a, b) => b.value - a.value),
  };
  const trampa: Fact = {
    id: "trampa", category: "punteria", title: "La trampa", emoji: "🪤",
    blurb: "El partido que casi todos erraron", requires: "results",
    available: Boolean(trampaMatchId), unavailableHint: hint, chartKind: "matchSplit",
    winner: undefined, coWinners: [], series: [],
  };

  return { francotirador, trampa, trampaMatchId };
}

export function buildStreakFacts(
  profiles: Profile[],
  predictions: Prediction[],
  matches: Match[],
  finalized: Set<string>,
) {
  const approved = approvedProfiles(profiles);
  const kickoffById = new Map(matches.map((m) => [m.id, m.kickoffUtc]));

  const bestHit: PersonValue[] = [];
  const bestMiss: PersonValue[] = [];
  const curHit: PersonValue[] = [];
  const curMiss: PersonValue[] = [];
  for (const user of approved) {
    const mine = predictions
      .filter((p) => p.userId === user.id && finalized.has(p.matchId))
      .sort((a, b) => (kickoffById.get(a.matchId) ?? "").localeCompare(kickoffById.get(b.matchId) ?? ""));
    if (mine.length === 0) continue;
    let bH = 0, bM = 0, rH = 0, rM = 0;
    for (const p of mine) {
      if (p.outcomeHit) { rH += 1; rM = 0; } else { rM += 1; rH = 0; }
      if (rH > bH) bH = rH;
      if (rM > bM) bM = rM;
    }
    bestHit.push({ user, value: bH, displayValue: `${bH} al hilo` });
    bestMiss.push({ user, value: bM, displayValue: `${bM} errados al hilo` });
    curHit.push({ user, value: rH, displayValue: rH > 0 ? `${rH} al hilo (en curso)` : "sin racha activa" });
    curMiss.push({ user, value: rM, displayValue: rM > 0 ? `${rM} errados (en curso)` : "sin sequía activa" });
  }
  const hint = "Se revela a medida que se cargan los resultados";

  const streakFact = (id: FactId, title: string, emoji: string, blurb: string, series: PersonValue[]): Fact => {
    const sorted = [...series].sort((a, b) => b.value - a.value);
    const max = sorted[0]?.value ?? 0;
    return {
      id, category: "rachas", title, emoji, blurb, requires: "results",
      available: sorted.length > 0, unavailableHint: hint, chartKind: "bar", unitSuffix: "",
      winner: max > 0 ? sorted[0] : undefined,
      coWinners: max > 0 ? topTies(sorted) : [],
      series: sorted,
      headline: max > 0 ? undefined : "Sin rachas todavía",
    };
  };

  return {
    rachaCaliente: streakFact("racha", "La racha caliente", "🔥", "Más aciertos de resultado al hilo", bestHit),
    sequia: streakFact("sequia", "La sequía", "🏜️", "La peor racha de errores al hilo", bestMiss),
    enLlamas: streakFact("en-llamas", "En llamas", "⚡", "La racha de aciertos más larga en curso", curHit),
    enSequia: streakFact("en-sequia", "En sequía", "🥶", "La peor racha de errores en curso", curMiss),
  };
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
  const audazRaw: { user: Profile; boldness: number; others: number; teamLabel: string }[] = [];
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
      audazRaw.push({
        user,
        boldness: denom - boldPick.others, // alone with the pick => max
        others: boldPick.others,
        teamLabel: `${t?.flag ?? ""} ${t?.name ?? boldPick.teamId}`,
      });
    }
    const avgPct = denom > 0 ? Math.round((shareSum / mine.length / denom) * 100) : 0;
    segura.push({ user, value: avgPct, displayValue: `${avgPct}% de coincidencia promedio` });
  }
  audazRaw.sort((a, b) => b.boldness - a.boldness);
  segura.sort((a, b) => b.value - a.value);
  // "N more chose it" — plural form covers a tied summary naming several teams.
  const shareText = (others: number, plural: boolean) =>
    others === 0
      ? plural ? "nadie más las eligió" : "nadie más la eligió"
      : `${others} ${others === 1 ? "más la eligió" : "más la eligieron"}`;
  const audaz: PersonValue[] = audazRaw.map((r) => ({
    user: r.user,
    value: r.boldness,
    displayValue: `${r.teamLabel} · ${shareText(r.others, false)}`,
  }));
  // Several people can tie for boldest while each backed a DIFFERENT lone pick.
  // Summarize every tied team so the card doesn't pin one person's pick on all.
  const audazTop = audazRaw.filter((r) => r.boldness === audazRaw[0]?.boldness);
  const audazSummary =
    audazTop.length > 1
      ? `${formatList(audazTop.map((r) => r.teamLabel))} · ${shareText(audazTop[0]!.others, true)}`
      : undefined;
  const apuestaAudaz: Fact = {
    id: "apuesta-audaz", category: "fidelidad", title: "La apuesta más audaz", emoji: "🎲",
    blurb: "El pronóstico de 1º de grupo que menos gente comparte", requires: "predictions",
    available: audaz.length > 0, unavailableHint: hint, chartKind: "bar", unitSuffix: "",
    winner: audaz[0], coWinners: topTies(audaz), series: audaz, winnerSummary: audazSummary,
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
    id: "grupo-muerte", category: "manada", title: "El grupo de la muerte", emoji: "🪦",
    blurb: "El grupo donde la familia menos se pone de acuerdo", requires: "predictions",
    available: Boolean(worst), unavailableHint: GROUP_HINT, chartKind: "histogram", unitSuffix: "%",
    headline: worst ? `Grupo ${worst.label}` : undefined,
    winner: worst ? { user: approved[0]!, value: worst.count, displayValue: `${worst.count}% de desacuerdo` } : undefined,
    coWinners: [], series: [], bins: contentionBins, valueDetail: "de desacuerdo",
  };

  // 1b · El grupo más unánime — inverse of grupo de la muerte (highest agreement).
  const agreementBins: HistogramBin[] = [...contentionByGroup.entries()]
    .map(([label, c]) => ({ label, count: Math.round((1 - c) * 100) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const mostUnanimous = agreementBins[0];
  const grupoUnanime: Fact = {
    id: "grupo-unanime", category: "manada", title: "El grupo cantado", emoji: "🎵",
    blurb: "El grupo donde la familia más se pone de acuerdo", requires: "predictions",
    available: Boolean(mostUnanimous), unavailableHint: GROUP_HINT, chartKind: "histogram", unitSuffix: "%",
    headline: mostUnanimous ? `Grupo ${mostUnanimous.label}` : undefined,
    winner: mostUnanimous ? { user: approved[0]!, value: mostUnanimous.count, displayValue: `${mostUnanimous.count}% de acuerdo` } : undefined,
    coWinners: [], series: [], bins: agreementBins, valueDetail: "de acuerdo",
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
    id: "visionario", category: "manada", title: "El supuesto visionario", emoji: "👁️",
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

  return { grupoMuerte, grupoUnanime, colista, visionario, profeta, dreamTable };
}

const VERDICT_GROUP_HINT = "Se revela cuando se cargan los resultados de los grupos";
const VERDICT_MATCH_HINT = "Se revela a medida que se cargan los resultados";

export function buildVerdictFacts(
  profiles: Profile[],
  predictions: Prediction[],
  groupPredictions: GroupPrediction[],
  matches: Match[],
  groups: Group[],
  teams: Team[],
  revealedMatches: Set<string>,
  finalizedMatches: Set<string>,
  revealedGroups: Set<string>,
  finalizedGroups: Set<string>,
) {
  const approved = approvedProfiles(profiles);
  const approvedIds = new Set(approved.map((p) => p.id));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const teamName = (id: string) => teamById.get(id)?.name ?? id;
  const teamLabel = (id: string) => `${teamById.get(id)?.flag ?? "🏳️"} ${teamName(id)}`;
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const groupByLabel = new Map(groups.map((g) => [g.groupLabel, g]));
  const actualOrder = (g: Group) => [g.firstTeamId, g.secondTeamId, g.thirdTeamId, g.fourthTeamId];

  const revealedGp = groupPredictions.filter(
    (g) => revealedGroups.has(g.groupLabel) && approvedIds.has(g.userId) && g.firstTeamId,
  );

  // ---- 1 · Apuesta audaz premiada ----
  // Per person, count their lone 1st picks (no other approved person picked that
  // team 1st in that group) that fall in a finalized group AND actually finished 1st.
  const premiada: PersonValue[] = [];
  for (const user of approved) {
    const mine = revealedGp.filter((g) => g.userId === user.id && finalizedGroups.has(g.groupLabel));
    if (mine.length === 0) continue;
    let hits = 0;
    let firstHitTeam: string | null = null;
    let lastTeam: string | null = null;
    let lastPos: number | null = null;
    for (const g of mine) {
      const others = revealedGp.filter(
        (o) => o.groupLabel === g.groupLabel && o.userId !== user.id && o.firstTeamId === g.firstTeamId,
      ).length;
      if (others > 0) continue; // not a lone pick
      lastTeam = g.firstTeamId!;
      const order = actualOrder(groupByLabel.get(g.groupLabel)!);
      lastPos = order.indexOf(g.firstTeamId!) + 1;
      if (order[0] === g.firstTeamId) { hits += 1; if (!firstHitTeam) firstHitTeam = g.firstTeamId!; }
    }
    if (lastTeam === null) continue; // had no lone picks in finalized groups
    const displayValue =
      hits === 0 ? `${teamLabel(lastTeam)} · quedó ${lastPos}º`
      : hits === 1 ? `${teamLabel(firstHitTeam!)} · salió 1º ✅`
      : `${hits} picks solitarios clavados`;
    premiada.push({ user, value: hits, displayValue });
  }
  premiada.sort((a, b) => b.value - a.value);
  const premiadaMax = premiada[0]?.value ?? 0;
  const audazPremiada: Fact = {
    id: "audaz-premiada", category: "veredicto", title: "La apuesta audaz premiada", emoji: "🎯",
    blurb: "El que se la jugó solo a un 1º de grupo… y la clavó.", requires: "results",
    available: premiada.length > 0, unavailableHint: VERDICT_GROUP_HINT, chartKind: "bar", unitSuffix: "",
    winner: premiadaMax > 0 ? premiada[0] : undefined,
    coWinners: premiadaMax > 0 ? topTies(premiada) : [],
    series: premiada,
    headline: premiadaMax > 0 ? undefined : "Nadie clavó su pick solitario...",
  };

  // ---- 2 · El rebelde tenía razón ----
  const { crowd } = crowdOutcomeByMatch(predictions, revealedMatches);
  const rebelHits: PersonValue[] = [];
  for (const user of approved) {
    const mine = predictions.filter(
      (p) => p.userId === user.id && finalizedMatches.has(p.matchId),
    );
    let contrarian = 0;
    let correct = 0;
    for (const p of mine) {
      if (predictedOutcome(p.homeScore, p.awayScore) === crowd.get(p.matchId)) continue;
      contrarian += 1;
      if (p.outcomeHit) correct += 1;
    }
    if (contrarian === 0) continue;
    rebelHits.push({ user, value: correct, displayValue: `${correct} de ${contrarian} a contramano` });
  }
  rebelHits.sort((a, b) => b.value - a.value);
  const rebeldeRazon: Fact = {
    id: "rebelde-razon", category: "veredicto", title: "El rebelde tenía razón", emoji: "✊",
    blurb: "Fue contra la familia… y los partidos le dieron la razón.", requires: "results",
    available: rebelHits.length > 0, unavailableHint: VERDICT_MATCH_HINT, chartKind: "bar", unitSuffix: "",
    winner: rebelHits[0], coWinners: topTies(rebelHits), series: rebelHits,
  };

  // ---- 3 · El profeta solitario ----
  // Per finalized match, scorelines predicted by exactly one approved person; if
  // that lone prediction was an exact hit, credit the person.
  const loneExact = new Map<string, { count: number; firstLabel: string | null }>();
  for (const matchId of finalizedMatches) {
    const forMatch = predictions.filter((p) => approvedIds.has(p.userId) && p.matchId === matchId);
    const byScore = new Map<string, Prediction[]>();
    for (const p of forMatch) {
      const key = `${p.homeScore}-${p.awayScore}`;
      const list = byScore.get(key) ?? [];
      list.push(p);
      byScore.set(key, list);
    }
    for (const [key, list] of byScore) {
      if (list.length !== 1) continue;
      const p = list[0]!;
      if (!p.exactHit) continue;
      const m = matchById.get(matchId);
      const label = m ? `${key} en ${teamName(m.homeTeamId ?? "")}–${teamName(m.awayTeamId ?? "")}` : key;
      const cur = loneExact.get(p.userId) ?? { count: 0, firstLabel: null };
      cur.count += 1;
      if (!cur.firstLabel) cur.firstLabel = label;
      loneExact.set(p.userId, cur);
    }
  }
  const profeta: PersonValue[] = approved
    .filter((u) => predictions.some((p) => p.userId === u.id && finalizedMatches.has(p.matchId)))
    .map((user) => {
      const e = loneExact.get(user.id);
      const count = e?.count ?? 0;
      const displayValue = count === 0 ? "Sin exactos en soledad"
        : count === 1 ? e!.firstLabel!
        : `${count} exactos en soledad`;
      return { user, value: count, displayValue };
    })
    .sort((a, b) => b.value - a.value);
  const profetaMax = profeta[0]?.value ?? 0;
  const profetaSolitario: Fact = {
    id: "profeta-solitario", category: "veredicto", title: "El profeta solitario", emoji: "🦅",
    blurb: "El único que cantó ese resultado exacto… y entró.", requires: "results",
    available: profeta.length > 0, unavailableHint: VERDICT_MATCH_HINT, chartKind: "bar", unitSuffix: "",
    winner: profetaMax > 0 ? profeta[0] : undefined,
    coWinners: profetaMax > 0 ? topTies(profeta) : [],
    series: profeta,
    headline: profetaMax > 0 ? undefined : "Nadie clavó un exacto en soledad… todavía",
  };

  // ---- 4 · El visionario confirmado ----
  const modal = modalGroupPositions(revealedGp, teamName);
  const visionDiv: PersonValue[] = [];
  for (const user of approved) {
    const mine = revealedGp.filter((g) => g.userId === user.id && finalizedGroups.has(g.groupLabel));
    if (mine.length === 0) continue;
    let correctDivergent = 0;
    for (const g of mine) {
      const order = actualOrder(groupByLabel.get(g.groupLabel)!);
      GROUP_SLOTS.forEach((slot, i) => {
        const mineTeam = g[slot] as string | null;
        const consensus = modal.get(`${g.groupLabel}:${i}`);
        if (mineTeam && consensus && mineTeam !== consensus && mineTeam === order[i]) correctDivergent += 1;
      });
    }
    visionDiv.push({
      user, value: correctDivergent,
      displayValue: `${correctDivergent} ${correctDivergent === 1 ? "casillero" : "casilleros"} que clavaste contra la corriente`,
    });
  }
  visionDiv.sort((a, b) => b.value - a.value);
  const visionarioConfirmado: Fact = {
    id: "visionario-confirmado", category: "veredicto", title: "El visionario confirmado", emoji: "🔮",
    blurb: "Armó los grupos distinto a todos… y le salió bien.", requires: "results",
    available: visionDiv.length > 0, unavailableHint: VERDICT_GROUP_HINT, chartKind: "bar", unitSuffix: "",
    winner: visionDiv[0], coWinners: topTies(visionDiv), series: visionDiv,
  };

  // ---- 5 · La sorpresa / 6 · La decepción (shared expectation vs reality) ----
  // For each team in a finalized group: expectedPos = rounded avg of positions the
  // family assigned it across revealed picks; actualPos = real finishing slot.
  type TeamGap = { teamId: string; name: string; flag: string; gained: number };
  const overachievers: TeamGap[] = [];
  const underachievers: TeamGap[] = [];
  for (const label of finalizedGroups) {
    const group = groupByLabel.get(label);
    if (!group) continue;
    const order = actualOrder(group);
    const picks = revealedGp.filter((g) => g.groupLabel === label);
    for (let actualIdx = 0; actualIdx < order.length; actualIdx += 1) {
      const teamId = order[actualIdx];
      if (!teamId) continue;
      const positions: number[] = [];
      for (const p of picks) {
        const slot = [p.firstTeamId, p.secondTeamId, p.thirdTeamId, p.fourthTeamId].indexOf(teamId);
        if (slot >= 0) positions.push(slot + 1);
      }
      if (positions.length === 0) continue;
      const expectedPos = Math.round(positions.reduce((t, n) => t + n, 0) / positions.length);
      const actualPos = actualIdx + 1;
      const gap = expectedPos - actualPos; // positive = finished higher than expected
      const t = teamById.get(teamId);
      const entry = { teamId, name: teamName(teamId), flag: t?.flag ?? "🏳️", gained: Math.abs(gap) };
      if (gap > 0) overachievers.push(entry);
      else if (gap < 0) underachievers.push(entry);
    }
  }
  const sortGap = (rows: TeamGap[]) =>
    [...rows].sort((a, b) => b.gained - a.gained || a.name.localeCompare(b.name))
      .map((r) => ({ teamId: r.teamId, name: r.name, flag: r.flag, count: r.gained } as TeamTally));
  const sorpresaSeries = sortGap(overachievers);
  const sorpresa: Fact = {
    id: "sorpresa", category: "veredicto", title: "La sorpresa de la familia", emoji: "🚀",
    blurb: "El equipo que la familia subestimó y terminó más arriba.", requires: "results",
    available: finalizedGroups.size > 0, unavailableHint: VERDICT_GROUP_HINT, chartKind: "thermometer", unitSuffix: "puestos",
    headline: sorpresaSeries.length > 0 ? topTeamHeadline(sorpresaSeries) : "La familia la vio venir: sin sorpresas",
    winner: sorpresaSeries[0]
      ? { user: approved[0]!, value: sorpresaSeries[0].count, displayValue: `subió ${sorpresaSeries[0].count} ${sorpresaSeries[0].count === 1 ? "puesto" : "puestos"}` }
      : undefined,
    coWinners: [], series: [], teamSeries: sorpresaSeries, valueDetail: "mejor de lo esperado",
  };

  const decepcionSeries = sortGap(underachievers);
  const decepcion: Fact = {
    id: "decepcion", category: "veredicto", title: "La decepción de la familia", emoji: "🥀",
    blurb: "El equipo que la familia bancó y quedó más abajo de lo cantado.", requires: "results",
    available: finalizedGroups.size > 0, unavailableHint: VERDICT_GROUP_HINT, chartKind: "thermometer", unitSuffix: "puestos",
    headline: decepcionSeries.length > 0 ? topTeamHeadline(decepcionSeries) : "Ningún fiasco: todos cumplieron",
    winner: decepcionSeries[0]
      ? { user: approved[0]!, value: decepcionSeries[0].count, displayValue: `cayó ${decepcionSeries[0].count} ${decepcionSeries[0].count === 1 ? "puesto" : "puestos"}` }
      : undefined,
    coWinners: [], series: [], teamSeries: decepcionSeries, valueDetail: "peor de lo esperado",
  };

  // ---- 7 · El ojo clínico (goal-volume realism) ----
  const goalError: PersonValue[] = [];
  for (const user of approved) {
    const mine = predictions.filter((p) => p.userId === user.id && finalizedMatches.has(p.matchId));
    const scored = mine.filter((p) => {
      const m = matchById.get(p.matchId);
      return m && m.homeScore !== null && m.awayScore !== null;
    });
    if (scored.length === 0) continue;
    let totalErr = 0;
    for (const p of scored) {
      const m = matchById.get(p.matchId)!;
      totalErr += Math.abs((p.homeScore + p.awayScore) - (m.homeScore! + m.awayScore!));
    }
    const avg = round1(totalErr / scored.length);
    goalError.push({ user, value: avg, displayValue: `${avg} goles de error promedio` });
  }
  const ojoWin = pickWinner(goalError, (a, b) => a < b);
  const ojoClinico: Fact = {
    id: "ojo-clinico", category: "veredicto", title: "El ojo clínico", emoji: "🔬",
    blurb: "Quien mejor le calcula el ritmo goleador a los partidos.", requires: "results",
    available: goalError.length > 0, unavailableHint: VERDICT_MATCH_HINT, chartKind: "bar", unitSuffix: "goles",
    winner: ojoWin.winner, coWinners: ojoWin.coWinners,
    series: [...goalError].sort((a, b) => a.value - b.value),
  };

  // ---- 8 · ¿La manada sabía? (family-level: crowd majority correctness) ----
  let manadaHits = 0;
  let manadaTotal = 0;
  for (const matchId of finalizedMatches) {
    const m = matchById.get(matchId);
    if (!m || m.homeScore === null || m.awayScore === null) continue;
    const majority = crowd.get(matchId);
    if (!majority) continue;
    manadaTotal += 1;
    if (majority === predictedOutcome(m.homeScore, m.awayScore)) manadaHits += 1;
  }
  const manadaPct = manadaTotal > 0 ? Math.round((manadaHits / manadaTotal) * 100) : 0;
  const manadaSabia: Fact = {
    id: "manada-sabia", category: "veredicto", title: "¿La manada sabía?", emoji: "🐑",
    blurb: "Cuando la familia votó en masa, ¿tenía razón?", requires: "results",
    available: manadaTotal > 0, unavailableHint: VERDICT_MATCH_HINT, chartKind: "histogram", unitSuffix: "",
    headline: `La mayoría acertó ${manadaPct}% de los partidos`,
    winner: manadaTotal > 0
      ? { user: approved[0]!, value: manadaPct, displayValue: `${manadaHits} de ${manadaTotal} partidos` }
      : undefined,
    coWinners: [], series: [],
    bins: [
      { label: "La manada acertó", count: manadaHits },
      { label: "La manada falló", count: manadaTotal - manadaHits },
    ],
  };

  // ---- 9 · El grupo cantado ¿se cumplió? ----
  // Per finalized group with consensus, how many of the 4 slots the family's
  // modal order matched reality. Headline = the most-agreed group + its score.
  const cantadoBins: HistogramBin[] = [];
  let cantadoBest: { label: string; matched: number; agreement: number } | null = null;
  for (const label of finalizedGroups) {
    const group = groupByLabel.get(label);
    const picks = revealedGp.filter((g) => g.groupLabel === label);
    if (!group || picks.length < 2) continue;
    const order = actualOrder(group);
    let matched = 0;
    let agreeSum = 0;
    GROUP_SLOTS.forEach((_, i) => {
      const consensus = modal.get(`${label}:${i}`);
      if (consensus && consensus === order[i]) matched += 1;
      // agreement = share of pickers on the modal team at this slot
      const slot = GROUP_SLOTS[i]!;
      const votes = picks.filter((p) => (p[slot] as string | null) === consensus).length;
      agreeSum += consensus ? votes / picks.length : 0;
    });
    cantadoBins.push({ label, count: matched });
    const agreement = agreeSum / GROUP_SLOTS.length;
    if (!cantadoBest || agreement > cantadoBest.agreement) cantadoBest = { label, matched, agreement };
  }
  cantadoBins.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const grupoCantado: Fact = {
    id: "grupo-cantado", category: "veredicto", title: "El grupo cantado ¿se cumplió?", emoji: "🎵",
    blurb: "El grupo más cantado por la familia, ¿salió como dijeron?", requires: "results",
    available: cantadoBins.length > 0, unavailableHint: VERDICT_GROUP_HINT, chartKind: "histogram", unitSuffix: "",
    headline: cantadoBest ? `Grupo ${cantadoBest.label}: la familia cantó ${cantadoBest.matched}/4` : undefined,
    winner: cantadoBest
      ? { user: approved[0]!, value: cantadoBest.matched, displayValue: `${cantadoBest.matched} de 4 aciertos` }
      : undefined,
    coWinners: [], series: [], bins: cantadoBins, valueDetail: "de 4 aciertos",
  };

  // ---- 10 · ¿El método paga? (lead-time bucket vs exact-hit accuracy) ----
  const kickoffById = new Map(matches.map((m) => [m.id, m.kickoffUtc]));
  type Habit = { lead: number; exactPct: number };
  const habits: Habit[] = [];
  for (const user of approved) {
    const revealedMine = predictions.filter((p) => p.userId === user.id && revealedMatches.has(p.matchId));
    const finalMine = predictions.filter((p) => p.userId === user.id && finalizedMatches.has(p.matchId));
    if (revealedMine.length === 0 || finalMine.length === 0) continue;
    let totalLead = 0;
    for (const p of revealedMine) {
      const kickoff = kickoffById.get(p.matchId);
      if (kickoff) totalLead += (new Date(kickoff).getTime() - new Date(p.updatedAt).getTime()) / 3_600_000;
    }
    const lead = totalLead / revealedMine.length;
    const exactPct = Math.round((finalMine.filter((p) => p.exactHit).length / finalMine.length) * 100);
    habits.push({ lead, exactPct });
  }
  habits.sort((a, b) => a.lead - b.lead);
  let metodoPaga: Fact;
  if (habits.length < 2) {
    metodoPaga = {
      id: "metodo-paga", category: "veredicto", title: "¿El método paga?", emoji: "⏱️",
      blurb: "¿Cargar temprano o sobre la hora rinde más puntería?", requires: "results",
      available: false, unavailableHint: VERDICT_MATCH_HINT, chartKind: "histogram", unitSuffix: "%",
      winner: undefined, coWinners: [], series: [],
    };
  } else {
    const sorted = [...habits].map((h) => h.lead).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
    const early = habits.filter((h) => h.lead >= median);
    const late = habits.filter((h) => h.lead < median);
    const avg = (rows: Habit[]) => rows.length ? Math.round(rows.reduce((t, h) => t + h.exactPct, 0) / rows.length) : 0;
    const earlyPct = avg(early);
    const latePct = avg(late);
    metodoPaga = {
      id: "metodo-paga", category: "veredicto", title: "¿El método paga?", emoji: "⏱️",
      blurb: "¿Cargar temprano o sobre la hora rinde más puntería?", requires: "results",
      available: true, unavailableHint: VERDICT_MATCH_HINT, chartKind: "histogram", unitSuffix: "%",
      headline: earlyPct >= latePct ? "Cargar temprano paga" : "Mejor sobre la hora",
      winner: { user: approved[0]!, value: Math.max(earlyPct, latePct), displayValue: `${Math.max(earlyPct, latePct)}% de exactos` },
      coWinners: [], series: [],
      bins: [
        { label: "Madrugadores", count: earlyPct },
        { label: "Último minuto", count: latePct },
      ],
    };
  }

  return { audazPremiada, rebeldeRazon, profetaSolitario, visionarioConfirmado, sorpresa, decepcion, ojoClinico, manadaSabia, grupoCantado, metodoPaga };
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
  const streak = buildStreakFacts(profiles, predictions, matches, finalized);
  const loyalty = buildTeamLoyaltyFacts(profiles, groupPredictions, predictions, matches, teams, revealedGroups, revealed);
  const scoreline = buildScorelineHistogram(predictions, revealed);
  const similarity = buildSimilarityMatrix(profiles, predictions, revealed);
  const pointsRace = buildPointsRace(profiles, predictions, matches, finalized);
  const pointsTotals: PersonValue[] = getLeaderboard({ profiles, predictions, groupPredictions, matches, groups, standingsStages })
    .map((row) => ({ user: row.user, value: row.points, displayValue: `${row.points} pts` }));
  const accuracyBreakdown = buildAccuracyBreakdown(profiles, predictions, finalized);
  const participation = buildParticipation(profiles, predictions, revealed);
  const goalMargin = buildGoalMargin(predictions, revealed);
  const groupRanking = buildGroupRankingFacts(profiles, groupPredictions, teams, revealedGroups, finalizedGroups);
  const verdict = buildVerdictFacts(
    profiles, predictions, groupPredictions, matches, groups, teams,
    revealed, finalized, revealedGroups, finalizedGroups,
  );
  const twinOpposite = pickTwinAndOpposite(similarity, currentUserId);

  const facts: Fact[] = [
    optimism.optimista, optimism.candado, optimism.sinEmpates,
    consensus.rebelde, consensus.delMonton, consensus.partidoDividido,
    groupRanking.grupoMuerte, groupRanking.grupoUnanime, groupRanking.visionario,
    accuracy.francotirador, accuracy.trampa, groupRanking.profeta,
    streak.rachaCaliente,
    streak.sequia, streak.enLlamas, streak.enSequia,
    loyalty.masQuerido, loyalty.masOdiado, loyalty.favoritoFamilia,
    loyalty.apuestaAudaz, loyalty.apuestaSegura, groupRanking.colista,
    verdict.audazPremiada,
    verdict.rebeldeRazon,
    verdict.profetaSolitario,
    verdict.visionarioConfirmado,
    verdict.sorpresa,
    verdict.decepcion,
    verdict.ojoClinico,
    verdict.manadaSabia,
    verdict.grupoCantado,
    verdict.metodoPaga,
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
