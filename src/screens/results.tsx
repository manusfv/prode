"use client";

import { CalendarClock, ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatKickoff,
  getGroupStatus,
  getMatchStatus,
  getTeamFlag,
  getTeamLabel,
  isGroupProvisional,
  resolveStageTab,
  stageOrder,
  stageToTab,
  tabStages,
} from "@/lib/tournament";
import type { StageTabId } from "@/lib/tournament";
import {
  getDefaultResultStage,
  sortComparison,
} from "@/lib/results";
import type {
  Group,
  GroupPrediction,
  Match,
  Prediction,
  Profile,
  Team,
} from "@/lib/types";
import { compareGroups, ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

import { useApp } from "@/components/app-context";
import { StageBadge, StageTabs, StatusChip } from "@/components/badges";


export function ResultsScreen() {
  const { matches, predictions, groups, groupPredictions, profiles, teams, now, currentUser, resultsStages } = useApp();

  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname()
  
  const getPreferredTab = (): StageTabId => {
    const preferred = getDefaultResultStage(matches, groups, now);
    if (resultsStages.has(preferred)) return stageToTab(preferred);
    return stageToTab(stageOrder.find((stage) => resultsStages.has(stage)) ?? preferred);
  }

  const stageParam = searchParams.get("stage");
  const activeTab: StageTabId = resolveStageTab(stageParam) ?? getPreferredTab();

  const handleStageChange = useCallback((newTab: StageTabId) => {
    const params = new URLSearchParams(searchParams);
    params.set("stage", newTab);
    router.replace(`${pathname}?${params.toString()}`);
  }, [searchParams, router, pathname]);

  // If the active stage stops being revealed (admin toggled off results_open),
  // fall back to a still-revealed stage so a hidden stage's results aren't shown.
  useEffect(() => {
    if (resultsStages.size > 0 && !tabStages(activeTab).some((stage) => resultsStages.has(stage))) {
      const fallback = stageOrder.find((stage) => resultsStages.has(stage));
      if (fallback) handleStageChange(stageToTab(fallback));
    }
  }, [resultsStages, activeTab, handleStageChange]);

  const approvedProfiles = useMemo(
    () => profiles.filter((profile) => profile.approved),
    [profiles],
  );

  const stageMatches = useMemo(
    () => {
      const stages = tabStages(activeTab);
      return matches
        .filter((match) => stages.includes(match.stage))
        .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime());
    },
    [matches, activeTab],
  );

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => compareGroups(a.groupLabel, b.groupLabel)),
    [groups],
  );

  const isGroups = activeTab === "groups";
  const count = isGroups ? sortedGroups.length : stageMatches.length;

  return (
    <section className="grid gap-3.5">
      <StageTabs activeStage={activeTab} enabledStages={resultsStages} onChange={handleStageChange} />

      <div className={cn(ui.panel, "flex items-end justify-between gap-3 p-4 max-lg:flex-col max-lg:items-start")}>
        <div>
          <p className={ui.label}>Fixture y marcadores</p>
          <h2 className="mt-1 text-3xl font-black leading-none">Resultados</h2>
        </div>
        <div className="flex items-center gap-3 max-lg:w-full max-lg:justify-between">
          <span className="text-sm font-black text-app-muted">
            {count} {isGroups ? "grupos" : "partidos"}
          </span>
        </div>
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-2">
        {isGroups
          ? sortedGroups.map((group) => (
              <ResultGroupCard
                key={group.groupLabel}
                group={group}
                teams={teams}
                now={now}
                approvedProfiles={approvedProfiles}
                groupPredictions={groupPredictions.filter((prediction) => prediction.groupLabel === group.groupLabel)}
                currentUserId={currentUser.id}
              />
            ))
          : stageMatches.map((match) => (
              <ResultMatchCard
                key={match.id}
                match={match}
                teams={teams}
                now={now}
                approvedProfiles={approvedProfiles}
                predictions={predictions.filter((prediction) => prediction.matchId === match.id)}
                currentUserId={currentUser.id}
              />
            ))}
      </div>

      {count === 0 && (
        <p className="rounded-lg border border-app-line bg-app-surface-2 px-4 py-6 text-center text-sm font-bold text-app-muted">
          No hay {isGroups ? "grupos" : "partidos"} en esta etapa.
        </p>
      )}
    </section>
  );
}

function ResultMatchCard({
  match,
  teams,
  now,
  approvedProfiles,
  predictions,
  currentUserId,
}: {
  match: Match;
  teams: Team[];
  now: Date;
  approvedProfiles: Profile[];
  predictions: Prediction[];
  currentUserId: string;
}) {
  const status = getMatchStatus(match, now);
  const finalized = status === "finalized" && match.homeScore !== null && match.awayScore !== null;
  const homeLabel = getTeamLabel(match.homeTeamId, teams, match.homeSeed);
  const awayLabel = getTeamLabel(match.awayTeamId, teams, match.awaySeed);

  const entries = useMemo(
    () =>
      sortComparison(approvedProfiles, predictions, {
        userIdOf: (prediction) => prediction.userId,
        pointsOf: (prediction) => prediction.points ?? 0,
        exactOf: (prediction) => (prediction.exactHit ? 1 : 0),
        finalized,
      }),
    [approvedProfiles, predictions, finalized],
  );

  const submitted = entries.filter((entry) => entry.prediction).length;
  const exactCount = entries.filter((entry) => entry.prediction?.exactHit).length;

  return (
    <Card className={cn(
      ui.panel,
      "grid gap-3.5 p-3.5",
      status === "locked" && "border-app-amber/45",
      status === "finalized" && "border-app-green/45",
    )}>
      <header className="flex items-center justify-between gap-3">
        <StageBadge stage={match.stage} group={match.group} />
        <StatusChip
          status={status}
          label={finalized ? "Finalizado" : status === "locked" ? "Cerrado" : "Abierto"}
        />
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 max-md:grid-cols-1">
        <TeamResult teamId={match.homeTeamId} seed={match.homeSeed} label={homeLabel} teams={teams} />
        {finalized ? (
          <strong className="min-w-24 rounded-lg border border-app-green/25 bg-app-green/10 px-3 py-2.5 text-center text-2xl font-black leading-none text-app-green">
            {match.homeScore}-{match.awayScore}
          </strong>
        ) : (
          <span className={cn(
            "inline-flex min-h-10 min-w-24 items-center justify-center rounded-lg border border-app-line bg-app-surface-2 px-3 text-center text-xs font-black uppercase text-app-muted",
            status === "open" && "min-w-11 border-transparent bg-transparent text-sm",
            status === "locked" && "border-app-amber/30 bg-app-amber/10 text-app-amber",
          )}>
            {status === "locked" ? "Resultado pendiente" : "vs"}
          </span>
        )}
        <TeamResult teamId={match.awayTeamId} seed={match.awaySeed} label={awayLabel} teams={teams} align="right" />
      </div>

      {status === "open" ? (
        <footer className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 border-t border-app-line pt-3 text-xs font-extrabold text-app-muted max-md:grid-cols-1">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <CalendarClock size={14} />
            <span className="truncate">{formatKickoff(match.kickoffUtc)}</span>
          </span>
          {match.city && <span className="min-w-0 truncate">{match.city}</span>}
        </footer>
      ) : (
        <Collapsible
          summary={
            finalized
              ? `${submitted} de ${approvedProfiles.length} · ${exactCount} exactos`
              : `${submitted} de ${approvedProfiles.length} cargados`
          }
        >
          {entries.map((entry) => (
            <PredictionComparisonRow
              key={entry.profile.id}
              profile={entry.profile}
              prediction={entry.prediction}
              showPoints={finalized}
              isCurrentUser={entry.profile.id === currentUserId}
            />
          ))}
        </Collapsible>
      )}
    </Card>
  );
}

function ResultGroupCard({
  group,
  teams,
  now,
  approvedProfiles,
  groupPredictions,
  currentUserId,
}: {
  group: Group;
  teams: Team[];
  now: Date;
  approvedProfiles: Profile[];
  groupPredictions: GroupPrediction[];
  currentUserId: string;
}) {
  const status = getGroupStatus(group, now);
  const finalized = status === "finalized";
  const provisional = isGroupProvisional(group);
  const revealOrder = finalized || provisional;
  const order = [group.firstTeamId, group.secondTeamId, group.thirdTeamId, group.fourthTeamId];

  const entries = useMemo(
    () =>
      sortComparison(approvedProfiles, groupPredictions, {
        userIdOf: (prediction) => prediction.userId,
        pointsOf: (prediction) => prediction.points ?? 0,
        exactOf: (prediction) => prediction.exactPositions,
        finalized: revealOrder,
      }),
    [approvedProfiles, groupPredictions, revealOrder],
  );

  const submitted = entries.filter((entry) => entry.prediction).length;

  return (
    <Card className={cn(
      ui.panel,
      "grid gap-3 p-3.5",
      status === "locked" && "border-app-amber/45",
      finalized && "border-app-green/45",
    )}>
      <header className="flex items-center justify-between gap-3">
        <StageBadge stage="groups" group={group.groupLabel} />
        <StatusChip
          status={status}
          label={finalized ? "Finalizado" : provisional ? "Provisional" : status === "locked" ? "Cerrado" : "Abierto"}
        />
      </header>

      {revealOrder ? (
        <div className="grid gap-1.5">
          <ol className="grid gap-1.5">
            {order.map((teamId, index) => (
              <li
                key={index}
                className="grid grid-cols-[28px_36px_minmax(0,1fr)] items-center gap-2.5 rounded-md bg-app-surface-2 px-2.5 py-2"
              >
                <span className="text-sm font-black text-app-muted">{index + 1}°</span>
                <span className="text-lg">{getTeamFlag(teamId, teams)}</span>
                <strong className="truncate text-sm font-black">{getTeamLabel(teamId, teams)}</strong>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="rounded-md bg-app-surface-2 px-2.5 py-3 text-center text-sm font-bold text-app-muted">
          Resultado pendiente
        </p>
      )}

      {status !== "open" && (
        <Collapsible summary={`${submitted} de ${approvedProfiles.length} cargados`}>
          {entries.map((entry) => (
            <GroupComparisonRow
              key={entry.profile.id}
              profile={entry.profile}
              prediction={entry.prediction}
              teams={teams}
              showPoints={revealOrder}
              actualOrder={order}
              isCurrentUser={entry.profile.id === currentUserId}
            />
          ))}
        </Collapsible>
      )}
    </Card>
  );
}

function Collapsible({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-app-line pt-3">
      <Button
        variant="ghost"
        size="sm"
        className="flex h-auto w-full items-center justify-between gap-3 p-0 text-xs font-extrabold text-app-blue hover:bg-transparent"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="inline-flex items-center gap-1.5">
          <ChevronDown size={15} className={cn("transition-transform", !open && "-rotate-90")} />
          {open ? "Ocultar pronósticos" : "Ver pronósticos"}
        </span>
        <span className="font-extrabold text-app-muted">{summary}</span>
      </Button>
      {open && <div className="mt-2 grid gap-1.5">{children}</div>}
    </div>
  );
}

function PredictionComparisonRow({
  profile,
  prediction,
  showPoints,
  isCurrentUser,
}: {
  profile: Profile;
  prediction?: Prediction;
  showPoints: boolean;
  isCurrentUser: boolean;
}) {
  return (
    <div className={cn(
      "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-md bg-app-surface-2 px-2.5 py-2",
      isCurrentUser && "outline outline-1 outline-app-brand",
    )}>
      <strong className="truncate text-sm font-black">
        {profile.displayName}{isCurrentUser ? " (vos)" : ""}
      </strong>
      {prediction ? (
        <span className="inline-flex items-center gap-2">
          <span className="text-sm font-bold tabular-nums">
            {prediction.homeScore}-{prediction.awayScore}
          </span>
          {showPoints && <PointsPill points={prediction.points ?? 0} />}
        </span>
      ) : (
        <span className="text-sm font-bold text-app-muted">Sin pronóstico</span>
      )}
    </div>
  );
}

function GroupComparisonRow({
  profile,
  prediction,
  teams,
  showPoints,
  actualOrder,
  isCurrentUser,
}: {
  profile: Profile;
  prediction?: GroupPrediction;
  teams: Team[];
  showPoints: boolean;
  actualOrder: (string | null)[];
  isCurrentUser: boolean;
}) {
  const shortName = (teamId: string | null) =>
    teamId ? (teams.find((team) => team.id === teamId)?.shortName ?? getTeamLabel(teamId, teams)) : "?";

  const predictedOrder = prediction
    ? [prediction.firstTeamId, prediction.secondTeamId, prediction.thirdTeamId, prediction.fourthTeamId]
    : [];
  // Per-slot ✓/✗ only for the current user, once the order is revealed.
  const markSlots = isCurrentUser && showPoints;

  return (
    <div className={cn(
      "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-md bg-app-surface-2 px-2.5 py-2",
      isCurrentUser && "outline outline-1 outline-app-brand",
    )}>
      <strong className="truncate text-sm font-black">
        {profile.displayName}{isCurrentUser ? " (vos)" : ""}
      </strong>
      {prediction ? (
        <span className="inline-flex items-center gap-2">
          {markSlots ? (
            <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-bold">
              {predictedOrder.map((teamId, index) => {
                const hit = teamId != null && teamId === actualOrder[index];
                return (
                  <span key={index} className="inline-flex items-center gap-0.5">
                    {index > 0 && <span className="text-app-muted">·</span>}
                    <span className={hit ? "text-app-green" : "text-app-red"}>{shortName(teamId)}</span>
                    <span className={hit ? "text-app-green" : "text-app-red"}>{hit ? "✓" : "✗"}</span>
                  </span>
                );
              })}
            </span>
          ) : (
            <span className="truncate text-xs font-bold text-app-muted">
              {predictedOrder.map(shortName).join(" · ")}
            </span>
          )}
          {showPoints && (
            <span className="inline-flex items-center gap-1">
              <PointsPill points={prediction.points ?? 0} />
              <span className="text-xs font-black text-app-muted">{prediction.exactPositions}/4</span>
            </span>
          )}
        </span>
      ) : (
        <span className="text-sm font-bold text-app-muted">Sin pronóstico</span>
      )}
    </div>
  );
}

function PointsPill({ points }: { points: number }) {
  return (
    <span className={cn(
      "min-w-10 rounded-full px-2 py-0.5 text-center text-xs font-black",
      points >= 3
        ? "bg-app-green/15 text-app-green"
        : points >= 1
          ? "bg-app-amber/15 text-app-amber"
          : "bg-app-surface text-app-muted",
    )}>
      +{points}
    </span>
  );
}

function TeamResult({
  teamId,
  seed,
  label,
  teams,
  align = "left",
}: {
  teamId: string | null;
  seed?: string;
  label: string;
  teams: Team[];
  align?: "left" | "right";
}) {
  return (
    <div className={cn(
      "grid min-w-0 items-center gap-x-2",
      align === "right"
        ? "grid-cols-[minmax(0,1fr)_36px] text-right max-md:grid-cols-[36px_minmax(0,1fr)] max-md:text-left"
        : "grid-cols-[36px_minmax(0,1fr)]",
    )}>
      <span className={cn(
        "row-span-2 grid size-9 place-items-center rounded-md border border-app-line bg-app-surface-2 text-lg",
        align === "right" && "col-start-2 max-md:col-start-1",
      )}>{getTeamFlag(teamId, teams)}</span>
      <strong className={cn(
        "truncate font-black",
        align === "right" && "col-start-1 max-md:col-start-2",
      )}>{label}</strong>
      <small className={cn(
        "truncate text-xs font-bold text-app-muted",
        align === "right" ? "col-start-1 max-md:col-start-2" : "col-start-2",
      )}>{teamId ? teams.find((team) => team.id === teamId)?.shortName : seed}</small>
    </div>
  );
}
