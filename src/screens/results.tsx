"use client";

import { CalendarClock } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  formatKickoff,
  getGroupStatus,
  getMatchStatus,
  getTeamFlag,
  getTeamLabel,
} from "@/lib/tournament";
import type { Group, Team } from "@/lib/types";
import { compareGroups, ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

import { useApp } from "@/components/app-context";
import { StageBadge, StatusChip } from "@/components/badges";

export function ResultsScreen() {
  const { matches, predictions, groups, now, teams } = useApp();
  const sortedGroups = [...groups].sort((a, b) => compareGroups(a.groupLabel, b.groupLabel));

  return (
    <section className="grid gap-3.5">
      {sortedGroups.length > 0 && (
        <div className="grid gap-3">
          <h2 className="text-base font-black leading-none">Tabla de grupos</h2>
          <div className="grid gap-3 xl:grid-cols-2">
            {sortedGroups.map((group) => (
              <GroupStandingsResult key={group.groupLabel} group={group} teams={teams} now={now} />
            ))}
          </div>
        </div>
      )}
      <div className={cn(ui.panel, "flex items-end justify-between gap-3 p-4 max-lg:items-start max-lg:flex-col")}>
        <div>
          <p className={ui.label}>Fixture y marcadores</p>
          <h2 className="mt-1 text-3xl font-black leading-none">Resultados</h2>
        </div>
        <span className="text-sm font-black text-app-muted">{matches.length} partidos</span>
      </div>
      <div className="grid gap-3">
        {matches.map((match) => {
          const status = getMatchStatus(match, now);
          const predictionCount = predictions.filter((prediction) => prediction.matchId === match.id).length;
          const homeLabel = getTeamLabel(match.homeTeamId, teams, match.homeSeed);
          const awayLabel = getTeamLabel(match.awayTeamId, teams, match.awaySeed);
          const hasFinalScore = status === "finalized" && match.homeScore !== null && match.awayScore !== null;

          return (
            <Card key={match.id} className={cn(
              ui.panel,
              "grid gap-3.5 p-3.5",
              status === "locked" && "border-app-amber/45",
              status === "finalized" && "border-app-green/45",
            )}>
              <header className="flex items-center justify-between gap-3">
                <StageBadge stage={match.stage} group={match.group} />
                <StatusChip
                  status={status}
                  label={status === "finalized" ? "Finalizado" : status === "locked" ? "Cerrado" : "Abierto"}
                />
              </header>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 max-md:grid-cols-1">
                <TeamResult teamId={match.homeTeamId} seed={match.homeSeed} label={homeLabel} teams={teams} />
                {hasFinalScore ? (
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
              <footer className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 border-t border-app-line pt-3 text-xs font-extrabold text-app-muted max-md:grid-cols-1">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <CalendarClock size={14} />
                  <span className="truncate">{formatKickoff(match.kickoffUtc)}</span>
                </span>
                <span className="min-w-0 truncate max-md:text-left">{match.city ?? "Sede por definir"}</span>
                <span className="whitespace-nowrap">{predictionCount} pronósticos</span>
              </footer>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function GroupStandingsResult({ group, teams, now }: { group: Group; teams: Team[]; now: Date }) {
  const status = getGroupStatus(group, now);
  const order = [group.firstTeamId, group.secondTeamId, group.thirdTeamId, group.fourthTeamId];
  const finalized = status === "finalized";

  return (
    <Card className={cn(ui.panel, "grid gap-3 p-3.5", finalized && "border-app-green/45")}>
      <header className="flex items-center justify-between gap-3">
        <StageBadge stage="groups" group={group.groupLabel} />
        <StatusChip
          status={finalized ? "finalized" : status === "locked" ? "locked" : "open"}
          label={finalized ? "Finalizado" : status === "locked" ? "Cerrado" : "Abierto"}
        />
      </header>
      {finalized ? (
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
      ) : (
        <p className="rounded-md bg-app-surface-2 px-2.5 py-3 text-center text-sm font-bold text-app-muted">
          Resultado pendiente
        </p>
      )}
    </Card>
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
