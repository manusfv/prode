"use server";

import { revalidatePath } from "next/cache";
import { canSavePrediction, scorePrediction } from "@/lib/scoring";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { inferWinner } from "@/lib/tournament";
import type { Match, MatchLifecycleStatus, Prediction, Profile, Stage } from "@/lib/types";

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

type UpdateStageInput = {
  stage: Stage;
  open: boolean;
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

export async function savePredictionAction(input: SavePredictionInput) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const user = await getCurrentUserId(supabase);
  if (!user.ok) return user;

  const [profileResult, matchResult, stagesResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.userId).single(),
    supabase.from("matches").select("*").eq("id", input.matchId).single(),
    supabase.from("stages").select("stage, open").eq("open", true),
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

export async function updateStageOpenAction(input: UpdateStageInput) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const admin = await requireAdmin(supabase);
  if (!admin.ok) return admin;

  const { error } = await supabase
    .from("stages")
    .update({
      open: input.open,
      opened_at: input.open ? new Date().toISOString() : null,
      opened_by: input.open ? admin.userId : null,
    })
    .eq("stage", input.stage);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  return { ok: true, message: input.open ? "Etapa habilitada." : "Etapa deshabilitada." };
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
    revalidatePath("/");
    return { ok: true, message: input.status === "live" ? "Partido en juego." : "Partido abierto." };
  }

  const { data: predictionRows, error: predictionError } = await supabase
    .from("predictions")
    .select("*")
    .eq("match_id", input.matchId);

  if (predictionError) return { ok: false, message: predictionError.message };

  await Promise.all(
    predictionRows.map((predictionRow) => {
      const prediction = mapPrediction(predictionRow);
      const score = scorePrediction(match, prediction);
      return supabase
        .from("predictions")
        .update({
          points: score.points,
          exact_hit: score.exactHit,
          outcome_hit: score.outcomeHit,
          updated_at: new Date().toISOString(),
        })
        .eq("id", prediction.id);
    }),
  );

  revalidatePath("/");
  return { ok: true, message: "Resultado finalizado." };
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
