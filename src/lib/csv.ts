import type { Match, MatchLifecycleStatus, Stage } from "./types";

export const matchCsvHeaders = [
  "match_no",
  "stage",
  "group_label",
  "home_team_id",
  "away_team_id",
  "home_seed",
  "away_seed",
  "kickoff_utc",
  "venue",
  "city",
  "status",
  "home_score",
  "away_score",
  "winner_team_id",
] as const;

export type MatchCsvRow = {
  matchNo: number;
  stage: Stage;
  groupLabel: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeSeed: string | null;
  awaySeed: string | null;
  kickoffUtc: string;
  venue: string | null;
  city: string | null;
  status: MatchLifecycleStatus;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeamId: string | null;
};

const stages: Set<Stage> = new Set(["groups", "round32", "round16", "quarter", "semi", "third", "final"]);
const statuses: Set<MatchLifecycleStatus> = new Set(["open", "live", "finalized"]);

export function parseMatchCsv(text: string): MatchCsvRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const [headers, ...dataRows] = rows;
  const headerIndex = new Map(headers.map((header, index) => [header.trim(), index]));
  const requiredHeaders = ["match_no", "stage", "kickoff_utc"];
  const missingHeader = requiredHeaders.find((header) => !headerIndex.has(header));
  if (missingHeader) throw new Error(`Falta la columna ${missingHeader}.`);

  return dataRows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row, index) => {
      const line = index + 2;
      const matchNo = parseRequiredInteger(getCell(row, headerIndex, "match_no"), "match_no", line);
      const stage = parseStage(getCell(row, headerIndex, "stage"), line);
      const status = parseStatus(getCell(row, headerIndex, "status") || "open", line);
      const kickoffUtc = getCell(row, headerIndex, "kickoff_utc").trim();
      const parsedKickoff = new Date(kickoffUtc);

      if (!kickoffUtc || Number.isNaN(parsedKickoff.getTime())) {
        throw new Error(`La fecha kickoff_utc no es válida en la línea ${line}.`);
      }

      return {
        matchNo,
        stage,
        groupLabel: optionalCell(row, headerIndex, "group_label"),
        homeTeamId: optionalCell(row, headerIndex, "home_team_id"),
        awayTeamId: optionalCell(row, headerIndex, "away_team_id"),
        homeSeed: optionalCell(row, headerIndex, "home_seed"),
        awaySeed: optionalCell(row, headerIndex, "away_seed"),
        kickoffUtc: parsedKickoff.toISOString(),
        venue: optionalCell(row, headerIndex, "venue"),
        city: optionalCell(row, headerIndex, "city"),
        status,
        homeScore: parseOptionalInteger(optionalCell(row, headerIndex, "home_score"), "home_score", line),
        awayScore: parseOptionalInteger(optionalCell(row, headerIndex, "away_score"), "away_score", line),
        winnerTeamId: optionalCell(row, headerIndex, "winner_team_id"),
      };
    });
}

export function matchesToCsv(matches: Match[]) {
  const rows = matches
    .slice()
    .sort((a, b) => a.matchNo - b.matchNo)
    .map((match) => [
      String(match.matchNo),
      match.stage,
      match.group ?? "",
      match.homeTeamId ?? "",
      match.awayTeamId ?? "",
      match.homeSeed ?? "",
      match.awaySeed ?? "",
      match.kickoffUtc,
      match.venue ?? "",
      match.city ?? "",
      match.status ?? "open",
      match.homeScore === null ? "" : String(match.homeScore),
      match.awayScore === null ? "" : String(match.awayScore),
      match.winnerTeamId ?? "",
    ]);

  return stringifyCsv([matchCsvHeaders.slice(), ...rows]);
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (quoted) {
      if (char === '"' && nextChar === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (quoted) throw new Error("El CSV tiene comillas sin cerrar.");
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function stringifyCsv(rows: string[][]) {
  return `${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}\n`;
}

function escapeCsvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function getCell(row: string[], headerIndex: Map<string, number>, header: string) {
  const index = headerIndex.get(header);
  return index === undefined ? "" : row[index] ?? "";
}

function optionalCell(row: string[], headerIndex: Map<string, number>, header: string) {
  const value = getCell(row, headerIndex, header).trim();
  return value === "" ? null : value;
}

function parseRequiredInteger(value: string, column: string, line: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`La columna ${column} debe ser un entero positivo en la línea ${line}.`);
  }
  return parsed;
}

function parseOptionalInteger(value: string | null, column: string, line: number) {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`La columna ${column} debe ser un entero no negativo en la línea ${line}.`);
  }
  return parsed;
}

function parseStage(value: string, line: number) {
  if (stages.has(value as Stage)) return value as Stage;
  throw new Error(`La etapa no es válida en la línea ${line}.`);
}

function parseStatus(value: string, line: number) {
  if (statuses.has(value as MatchLifecycleStatus)) return value as MatchLifecycleStatus;
  throw new Error(`El estado no es válido en la línea ${line}.`);
}
