"use server";

import { revalidatePath } from "next/cache";
import { isValidDisplayName } from "@/lib/account";
import { parseMatchCsv } from "@/lib/csv";
import {
  canSaveGroupPrediction,
  canSavePrediction,
  scoreGroupPredictionOrNull,
  scorePrediction,
} from "@/lib/scoring";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { inferWinner } from "@/lib/tournament";
import type {
  Group,
  GroupPrediction,
  Match,
  MatchLifecycleStatus,
  Prediction,
  Profile,
  Stage,
  StageFlag,
  StageVisibility,
} from "@/lib/types";

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

type SavePredictionInput = {
  matchId: string;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
};

type FinalizeMatchInput = {
  matchId: string;
  status: MatchLifecycleStatus;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
};

type CreateMatchInput = {
  matchNo: number | null;
  stage: Stage;
  groupLabel: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeSeed: string | null;
  awaySeed: string | null;
  kickoffUtc: string;
  venue: string | null;
  city: string | null;
};

type ImportMatchesCsvInput = {
  csv: string;
};

type SaveGroupPredictionInput = {
  groupLabel: string;
  firstTeamId: string | null;
  secondTeamId: string | null;
  thirdTeamId: string | null;
  fourthTeamId: string | null;
};

type SaveGroupStandingsInput = {
  groupLabel: string;
  firstTeamId: string;
  secondTeamId: string;
  thirdTeamId: string;
  fourthTeamId: string;
  finalize: boolean;
};

type UpdateGroupLocksInput = {
  groupLabel: string;
  locksAt: string | null;
};

export async function savePredictionAction(input: SavePredictionInput) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const user = await getCurrentUserId(supabase);
  if (!user.ok) return user;

  const [profileResult, matchResult, stagesResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.userId).single(),
    supabase.from("matches").select("*").eq("id", input.matchId).single(),
    supabase.from("stages").select("stage, predictions_open").eq("predictions_open", "open"),
  ]);

  if (profileResult.error) return { ok: false, message: profileResult.error.message };
  if (matchResult.error) return { ok: false, message: matchResult.error.message };
  if (stagesResult.error) return { ok: false, message: stagesResult.error.message };

  const profile = mapProfile(profileResult.data);
  const match = mapMatch(matchResult.data);
  const draft = {
    homeScore: input.homeScore,
    awayScore: input.awayScore,
    winnerTeamId: input.winnerTeamId,
  };

  const permission = canSavePrediction({
    match,
    draft,
    profile,
    openStages: new Set((stagesResult.data as Array<{ stage: Stage }>).map((stage) => stage.stage)),
  });

  if (!permission.ok) return { ok: false, message: permission.reason };

  const winnerTeamId = inferWinner(match, draft);

  const { error } = await supabase.from("predictions").upsert(
    {
      user_id: user.userId,
      match_id: input.matchId,
      home_score: input.homeScore,
      away_score: input.awayScore,
      winner_team_id: winnerTeamId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,match_id" },
  );

  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  return { ok: true, message: "Pronóstico guardado." };
}

export async function saveGroupPredictionAction(input: SaveGroupPredictionInput) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const user = await getCurrentUserId(supabase);
  if (!user.ok) return user;

  const [profileResult, groupResult, stagesResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.userId).single(),
    supabase.from("groups").select("*").eq("group_label", input.groupLabel).single(),
    supabase.from("stages").select("stage, predictions_open").eq("predictions_open", "open"),
  ]);

  if (profileResult.error) return { ok: false, message: profileResult.error.message };
  if (groupResult.error) return { ok: false, message: groupResult.error.message };
  if (stagesResult.error) return { ok: false, message: stagesResult.error.message };

  const profile = mapProfile(profileResult.data);
  const group = mapGroup(groupResult.data);
  const draft = {
    order: [
      input.firstTeamId,
      input.secondTeamId,
      input.thirdTeamId,
      input.fourthTeamId,
    ] as [string | null, string | null, string | null, string | null],
  };

  const permission = canSaveGroupPrediction({
    group,
    draft,
    profile,
    openStages: new Set((stagesResult.data as Array<{ stage: Stage }>).map((stage) => stage.stage)),
  });

  if (!permission.ok) return { ok: false, message: permission.reason };

  const { error } = await supabase.from("group_predictions").upsert(
    {
      user_id: user.userId,
      group_label: input.groupLabel,
      first_team_id: input.firstTeamId,
      second_team_id: input.secondTeamId,
      third_team_id: input.thirdTeamId,
      fourth_team_id: input.fourthTeamId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,group_label" },
  );

  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  return { ok: true, message: "Pronóstico guardado." };
}

export async function deleteGroupPredictionAction(input: { groupLabel: string }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const user = await getCurrentUserId(supabase);
  if (!user.ok) return user;

  const { error } = await supabase
    .from("group_predictions")
    .delete()
    .eq("user_id", user.userId)
    .eq("group_label", input.groupLabel);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  return { ok: true, message: "Pronóstico borrado." };
}

export async function saveGroupStandingsAction(input: SaveGroupStandingsInput) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const admin = await requireAdmin(supabase);
  if (!admin.ok) return admin;

  const order = [input.firstTeamId, input.secondTeamId, input.thirdTeamId, input.fourthTeamId];
  if (order.some((teamId) => !teamId)) {
    return { ok: false, message: "Ordená los cuatro equipos." };
  }
  if (new Set(order).size !== 4) {
    return { ok: false, message: "No repitas equipos." };
  }

  const now = new Date().toISOString();
  const { data: groupRow, error: updateError } = await supabase
    .from("groups")
    .update({
      first_team_id: input.firstTeamId,
      second_team_id: input.secondTeamId,
      third_team_id: input.thirdTeamId,
      fourth_team_id: input.fourthTeamId,
      result_finalized_at: input.finalize ? now : null,
      result_finalized_by: input.finalize ? admin.userId : null,
      updated_at: now,
    })
    .eq("group_label", input.groupLabel)
    .select("*")
    .single();

  if (updateError) return { ok: false, message: updateError.message };

  const recalculation = await recalculateGroupPredictionsForGroups(supabase, [mapGroup(groupRow)]);
  if (!recalculation.ok) return recalculation;

  revalidatePath("/");
  return {
    ok: true,
    message: input.finalize ? "Resultado del grupo finalizado." : "Posiciones provisionales guardadas.",
  };
}

export async function updateGroupLocksAtAction(input: UpdateGroupLocksInput) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const admin = await requireAdmin(supabase);
  if (!admin.ok) return admin;

  let locksAt: string | null = null;
  if (input.locksAt) {
    const parsed = new Date(input.locksAt);
    if (Number.isNaN(parsed.getTime())) return { ok: false, message: "La fecha de cierre no es válida." };
    locksAt = parsed.toISOString();
  }

  const { error } = await supabase
    .from("groups")
    .update({ locks_at: locksAt, updated_at: new Date().toISOString() })
    .eq("group_label", input.groupLabel);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  return { ok: true, message: "Cierre del grupo actualizado." };
}

export async function approveProfileAction(profileId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const admin = await requireAdmin(supabase);
  if (!admin.ok) return admin;

  const { error } = await supabase
    .from("profiles")
    .update({ approved: true, updated_at: new Date().toISOString() })
    .eq("id", profileId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  return { ok: true, message: "Usuario aprobado." };
}

export async function updateDisplayNameAction(displayName: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const user = await getCurrentUserId(supabase);
  if (!user.ok) return user;

  if (!isValidDisplayName(displayName)) {
    return { ok: false, message: "El nombre no puede estar vacío." };
  }

  const trimmed = displayName.trim();

  const { error: rpcError } = await supabase.rpc("update_my_display_name", { new_name: trimmed });
  if (rpcError) return { ok: false, message: rpcError.message };

  const { error: metaError } = await supabase.auth.updateUser({ data: { display_name: trimmed } });
  if (metaError) return { ok: false, message: metaError.message };

  revalidatePath("/");
  return { ok: true, message: "Nombre actualizado." };
}

type UpdateStageFlagInput = {
  stage: Stage;
  flag: StageFlag;
  value: StageVisibility;
};

const STAGE_FLAG_COLUMN: Record<StageFlag, "predictions_open" | "results_open" | "standings_open"> = {
  predictions: "predictions_open",
  results: "results_open",
  standings: "standings_open",
};

const STAGE_FLAG_MESSAGE: Record<StageVisibility, string> = {
  open: "Etapa abierta.",
  admin: "Etapa en vista previa (solo admin).",
  closed: "Etapa cerrada.",
};

export async function updateStageFlagAction(input: UpdateStageFlagInput) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const admin = await requireAdmin(supabase);
  if (!admin.ok) return admin;

  const column = STAGE_FLAG_COLUMN[input.flag];
  const update: Record<string, unknown> = { [column]: input.value };
  if (input.flag === "predictions") {
    const opened = input.value === "open";
    update.opened_at = opened ? new Date().toISOString() : null;
    update.opened_by = opened ? admin.userId : null;
  }

  const { error } = await supabase.from("stages").update(update).eq("stage", input.stage);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  return { ok: true, message: STAGE_FLAG_MESSAGE[input.value] };
}

export async function createMatchAction(input: CreateMatchInput) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const admin = await requireAdmin(supabase);
  if (!admin.ok) return admin;

  if (!input.kickoffUtc) return { ok: false, message: "Definí fecha y hora del partido." };

  const parsedKickoff = new Date(input.kickoffUtc);
  if (Number.isNaN(parsedKickoff.getTime())) return { ok: false, message: "La fecha del partido no es válida." };

  if (input.homeTeamId && input.awayTeamId && input.homeTeamId === input.awayTeamId) {
    return { ok: false, message: "Los equipos no pueden ser iguales." };
  }

  let matchNo = input.matchNo;
  if (!matchNo) {
    const { data, error } = await supabase
      .from("matches")
      .select("match_no")
      .order("match_no", { ascending: false })
      .limit(1);

    if (error) return { ok: false, message: error.message };
    matchNo = ((data?.[0]?.match_no as number | undefined) ?? 0) + 1;
  }

  const { error } = await supabase.from("matches").insert({
    match_no: matchNo,
    stage: input.stage,
    group_label: input.groupLabel,
    home_team_id: input.homeTeamId,
    away_team_id: input.awayTeamId,
    home_seed: input.homeSeed,
    away_seed: input.awaySeed,
    kickoff_utc: parsedKickoff.toISOString(),
    venue: input.venue,
    city: input.city,
    status: "open",
    updated_at: new Date().toISOString(),
    updated_by: admin.userId,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  return { ok: true, message: "Partido agregado." };
}

export async function deleteMatchAction(matchId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const admin = await requireAdmin(supabase);
  if (!admin.ok) return admin;

  const { error } = await supabase
    .from("matches")
    .delete()
    .eq("id", matchId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  return { ok: true, message: "Partido eliminado junto con sus pronósticos." };
}

export async function importMatchesCsvAction(input: ImportMatchesCsvInput) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const admin = await requireAdmin(supabase);
  if (!admin.ok) return admin;

  let rows: ReturnType<typeof parseMatchCsv>;
  try {
    rows = parseMatchCsv(input.csv);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "El CSV no es válido." };
  }

  if (rows.length === 0) return { ok: false, message: "El CSV no tiene partidos para importar." };

  // Group matches are no longer stored as fixtures; their rows only seed the
  // per-group lock time (the earliest kickoff of the group).
  const groupRows = rows.filter((row) => row.stage === "groups" && row.groupLabel);
  const matchRows = rows.filter((row) => row.stage !== "groups");

  if (matchRows.length > 0) {
    const { error } = await supabase.from("matches").upsert(
      matchRows.map((row) => ({
        match_no: row.matchNo,
        stage: row.stage,
        group_label: null,
        home_team_id: row.homeTeamId,
        away_team_id: row.awayTeamId,
        home_seed: row.homeTeamId ? null : row.homeSeed,
        away_seed: row.awayTeamId ? null : row.awaySeed,
        kickoff_utc: row.kickoffUtc,
        venue: row.venue,
        city: row.city,
        status: row.status,
        home_score: row.homeScore,
        away_score: row.awayScore,
        winner_team_id: row.winnerTeamId,
        finalized_at: row.status === "finalized" ? new Date().toISOString() : null,
        finalized_by: row.status === "finalized" ? admin.userId : null,
        updated_at: new Date().toISOString(),
        updated_by: admin.userId,
      })),
      { onConflict: "match_no" },
    );

    if (error) return { ok: false, message: error.message };
  }

  if (groupRows.length > 0) {
    const locksByGroup = new Map<string, string>();
    for (const row of groupRows) {
      const groupLabel = row.groupLabel as string;
      const current = locksByGroup.get(groupLabel);
      if (!current || row.kickoffUtc < current) locksByGroup.set(groupLabel, row.kickoffUtc);
    }

    const { error } = await supabase.from("groups").upsert(
      Array.from(locksByGroup.entries()).map(([groupLabel, locksAt]) => ({
        group_label: groupLabel,
        locks_at: locksAt,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "group_label" },
    );

    if (error) return { ok: false, message: error.message };
  }

  const recalculation = await recalculateAllPoints(supabase);
  if (!recalculation.ok) return recalculation;

  revalidatePath("/");
  return {
    ok: true,
    message: `${matchRows.length} cruces importados, ${groupRows.length} filas de grupos usadas para fechas de cierre. ${recalculation.updated} puntajes recalculados.`,
  };
}

export async function recalculatePointsAction() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const admin = await requireAdmin(supabase);
  if (!admin.ok) return admin;

  const result = await recalculateAllPoints(supabase);
  if (!result.ok) return result;

  revalidatePath("/");
  return { ok: true, message: `${result.updated} puntajes recalculados.` };
}

export async function finalizeMatchAction(input: FinalizeMatchInput) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const admin = await requireAdmin(supabase);
  if (!admin.ok) return admin;

  const { data: matchRow, error: matchError } = await supabase
    .from("matches")
    .select("*")
    .eq("id", input.matchId)
    .single();

  if (matchError) return { ok: false, message: matchError.message };

  const finalizedAt = input.status === "finalized" ? new Date().toISOString() : null;
  const finalizedBy = input.status === "finalized" ? admin.userId : null;
  const match = mapMatch({
    ...matchRow,
    status: input.status,
    home_score: input.homeScore,
    away_score: input.awayScore,
    winner_team_id: input.winnerTeamId,
    finalized_at: finalizedAt,
    finalized_by: finalizedBy,
  });

  const { error: updateError } = await supabase
    .from("matches")
    .update({
      status: input.status,
      home_score: input.homeScore,
      away_score: input.awayScore,
      winner_team_id: input.winnerTeamId,
      finalized_at: match.finalizedAt,
      finalized_by: finalizedBy,
      updated_at: new Date().toISOString(),
      updated_by: admin.userId,
    })
    .eq("id", input.matchId);

  if (updateError) return { ok: false, message: updateError.message };

  if (input.status !== "finalized") {
    const recalculation = await recalculatePredictionsForMatches(supabase, [match]);
    if (!recalculation.ok) return recalculation;

    revalidatePath("/");
    return { ok: true, message: input.status === "live" ? "Partido en juego." : "Partido abierto." };
  }

  const recalculation = await recalculatePredictionsForMatches(supabase, [match]);
  if (!recalculation.ok) return recalculation;

  revalidatePath("/");
  return { ok: true, message: "Resultado finalizado." };
}

async function recalculateAllPoints(supabase: SupabaseServerClient) {
  const [matchesResult, groupsResult] = await Promise.all([
    supabase.from("matches").select("*"),
    supabase.from("groups").select("*"),
  ]);

  if (matchesResult.error) return { ok: false as const, message: matchesResult.error.message };
  if (groupsResult.error) return { ok: false as const, message: groupsResult.error.message };

  const matchRecalc = await recalculatePredictionsForMatches(
    supabase,
    matchesResult.data.map(mapMatch),
  );
  if (!matchRecalc.ok) return matchRecalc;

  const groupRecalc = await recalculateGroupPredictionsForGroups(
    supabase,
    groupsResult.data.map(mapGroup),
  );
  if (!groupRecalc.ok) return groupRecalc;

  return { ok: true as const, updated: matchRecalc.updated + groupRecalc.updated };
}

async function recalculateGroupPredictionsForGroups(
  supabase: SupabaseServerClient,
  groups: Group[],
) {
  if (groups.length === 0) return { ok: true as const, updated: 0 };

  const { data: predictionRows, error: predictionError } = await supabase
    .from("group_predictions")
    .select("*")
    .in("group_label", groups.map((group) => group.groupLabel));

  if (predictionError) return { ok: false as const, message: predictionError.message };

  const groupByLabel = new Map(groups.map((group) => [group.groupLabel, group]));
  const updatedAt = new Date().toISOString();
  const updates = predictionRows
    .map((predictionRow) => {
      const prediction = mapGroupPrediction(predictionRow);
      const group = groupByLabel.get(prediction.groupLabel);
      if (!group) return null;

      const score = scoreGroupPredictionOrNull(group, prediction);

      return supabase
        .from("group_predictions")
        .update({
          points: score.points,
          exact_positions: score.exactPositions,
          updated_at: updatedAt,
        })
        .eq("id", prediction.id);
    })
    .filter((update): update is NonNullable<typeof update> => update !== null);

  const results = await Promise.all(updates);
  const error = results.find((result) => result.error)?.error;
  if (error) return { ok: false as const, message: error.message };

  return { ok: true as const, updated: updates.length };
}

async function recalculatePredictionsForMatches(supabase: SupabaseServerClient, matches: Match[]) {
  if (matches.length === 0) return { ok: true as const, updated: 0 };

  const { data: predictionRows, error: predictionError } = await supabase
    .from("predictions")
    .select("*")
    .in("match_id", matches.map((match) => match.id));

  if (predictionError) return { ok: false as const, message: predictionError.message };

  const matchById = new Map(matches.map((match) => [match.id, match]));
  const updatedAt = new Date().toISOString();
  const updates = predictionRows.map((predictionRow) => {
    const prediction = mapPrediction(predictionRow);
    const match = matchById.get(prediction.matchId);
    if (!match) return null;

    const score = match.status === "finalized"
      ? scorePrediction(match, prediction)
      : { points: null, exactHit: false, outcomeHit: false };

    return supabase
      .from("predictions")
      .update({
        points: score.points,
        exact_hit: score.exactHit,
        outcome_hit: score.outcomeHit,
        updated_at: updatedAt,
      })
      .eq("id", prediction.id);
  }).filter((update): update is NonNullable<typeof update> => update !== null);

  const results = await Promise.all(updates);
  const error = results.find((result) => result.error)?.error;
  if (error) return { ok: false as const, message: error.message };

  return { ok: true as const, updated: updates.length };
}

async function getCurrentUserId(supabase: SupabaseServerClient) {
  const { data, error } = await supabase.auth.getUser();
  if (error) return { ok: false as const, message: error.message };
  if (!data.user) return { ok: false as const, message: "Iniciá sesión para continuar." };

  return { ok: true as const, userId: data.user.id };
}

async function requireAdmin(supabase: SupabaseServerClient) {
  const user = await getCurrentUserId(supabase);
  if (!user.ok) return user;

  const { data, error } = await supabase.from("profiles").select("role, approved").eq("id", user.userId).single();
  if (error) return { ok: false as const, message: error.message };
  if (!data.approved || data.role !== "admin") return { ok: false as const, message: "Necesitás permisos de admin." };

  return user;
}

function mapProfile(row: {
  id: string;
  email: string;
  display_name: string;
  approved: boolean;
  role: "user" | "admin";
}): Profile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    approved: row.approved,
    role: row.role,
  };
}

function mapMatch(row: {
  id: string;
  match_no: number;
  stage: Stage;
  group_label: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_seed: string | null;
  away_seed: string | null;
  kickoff_utc: string;
  venue: string | null;
  city: string | null;
  status?: MatchLifecycleStatus | null;
  home_score: number | null;
  away_score: number | null;
  winner_team_id: string | null;
  finalized_at: string | null;
  finalized_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
}): Match {
  return {
    id: row.id,
    matchNo: row.match_no,
    stage: row.stage,
    group: row.group_label ?? undefined,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    homeSeed: row.home_seed ?? undefined,
    awaySeed: row.away_seed ?? undefined,
    kickoffUtc: row.kickoff_utc,
    venue: row.venue ?? undefined,
    city: row.city ?? undefined,
    status: row.status ?? undefined,
    homeScore: row.home_score,
    awayScore: row.away_score,
    winnerTeamId: row.winner_team_id,
    finalizedAt: row.finalized_at,
    finalizedBy: row.finalized_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function mapPrediction(row: {
  id: string;
  user_id: string;
  match_id: string;
  home_score: number;
  away_score: number;
  winner_team_id: string | null;
  points: number | null;
  exact_hit: boolean;
  outcome_hit: boolean;
  created_at: string;
  updated_at: string;
}): Prediction {
  return {
    id: row.id,
    userId: row.user_id,
    matchId: row.match_id,
    homeScore: row.home_score,
    awayScore: row.away_score,
    winnerTeamId: row.winner_team_id,
    points: row.points,
    exactHit: row.exact_hit,
    outcomeHit: row.outcome_hit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapGroup(row: {
  group_label: string;
  locks_at: string | null;
  first_team_id: string | null;
  second_team_id: string | null;
  third_team_id: string | null;
  fourth_team_id: string | null;
  result_finalized_at: string | null;
  result_finalized_by: string | null;
}): Group {
  return {
    groupLabel: row.group_label,
    locksAt: row.locks_at,
    firstTeamId: row.first_team_id,
    secondTeamId: row.second_team_id,
    thirdTeamId: row.third_team_id,
    fourthTeamId: row.fourth_team_id,
    resultFinalizedAt: row.result_finalized_at,
    resultFinalizedBy: row.result_finalized_by,
  };
}

function mapGroupPrediction(row: {
  id: string;
  user_id: string;
  group_label: string;
  first_team_id: string | null;
  second_team_id: string | null;
  third_team_id: string | null;
  fourth_team_id: string | null;
  points: number | null;
  exact_positions: number;
  created_at: string;
  updated_at: string;
}): GroupPrediction {
  return {
    id: row.id,
    userId: row.user_id,
    groupLabel: row.group_label,
    firstTeamId: row.first_team_id,
    secondTeamId: row.second_team_id,
    thirdTeamId: row.third_team_id,
    fourthTeamId: row.fourth_team_id,
    points: row.points,
    exactPositions: row.exact_positions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
