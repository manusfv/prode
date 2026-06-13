"use client";

import { Combobox } from "@base-ui/react/combobox";
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Minus,
  PanelRightOpen,
  Plus,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  formatKickoff,
  formatRelativeTime,
  getGroupStatus,
  getLockCopy,
  getMatchStatus,
  getTeamFlag,
  getTeamLabel,
  needsAdvancer,
  stageLabels,
  stageOrder,
  stepScore,
} from "@/lib/tournament";
import type {
  Group,
  GroupPrediction,
  Match,
  Prediction,
  PredictionDraft,
  Profile,
  Stage,
  Team,
} from "@/lib/types";
import { compareGroups, ui } from "@/lib/ui-tokens";
import { getLeaderboard, type LeaderboardRow } from "@/lib/standings";
import { cn } from "@/lib/utils";

import { StatsTeaser } from "@/components/stats/stats-teaser";
import { useApp } from "@/components/app-context";
import { SaveStatus, StageBadge, StageTabs, StatusChip } from "@/components/badges";

function isGroupPredictionComplete(prediction?: GroupPrediction): boolean {
  return Boolean(
    prediction &&
      prediction.firstTeamId &&
      prediction.secondTeamId &&
      prediction.thirdTeamId &&
      prediction.fourthTeamId,
  );
}

export function PredictionsScreen() {
  const {
    currentUser,
    matches,
    predictions,
    groups,
    groupPredictions,
    profiles,
    teams,
    now,
    saveState,
    openStages,
    standingsStages,
    updatePrediction,
    updateGroupPrediction,
    openPredictionDrawer,
  } = useApp();
  const router = useRouter();
  const [activeStage, setActiveStage] = useState<Stage>(() => {
    return stageOrder.find((stage) => openStages.has(stage)) ?? "groups";
  });
  const [missingOnly, setMissingOnly] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [drawerGroup, setDrawerGroup] = useState<Group | null>(null);

  const currentPredictionMap = useMemo(() => {
    return new Map(
      predictions
        .filter((prediction) => prediction.userId === currentUser.id)
        .map((prediction) => [prediction.matchId, prediction]),
    );
  }, [currentUser, predictions]);

  const currentGroupPredictionMap = useMemo(() => {
    return new Map(
      groupPredictions
        .filter((prediction) => prediction.userId === currentUser.id)
        .map((prediction) => [prediction.groupLabel, prediction]),
    );
  }, [currentUser, groupPredictions]);

  const visibleMatches = useMemo(() => {
    return matches
      .filter((match) => match.stage === activeStage)
      .filter((match) => !missingOnly || !currentPredictionMap.has(match.id))
      .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime());
  }, [activeStage, currentPredictionMap, matches, missingOnly]);

  const groupOptions = useMemo(() => {
    return groups.map((group) => group.groupLabel).sort(compareGroups);
  }, [groups]);

  const visibleGroups = useMemo(() => {
    return groups
      .filter((group) => selectedGroups.length === 0 || selectedGroups.includes(group.groupLabel))
      .filter(
        (group) =>
          !missingOnly || !isGroupPredictionComplete(currentGroupPredictionMap.get(group.groupLabel)),
      )
      .sort((a, b) => compareGroups(a.groupLabel, b.groupLabel));
  }, [currentGroupPredictionMap, groups, missingOnly, selectedGroups]);

  const lastModifiedAt = useMemo(() => {
    let latest: string | null = null;
    const consider = (iso: string) => {
      if (!latest || new Date(iso).getTime() > new Date(latest).getTime()) latest = iso;
    };
    if (activeStage === "groups") {
      for (const prediction of currentGroupPredictionMap.values()) consider(prediction.updatedAt);
    } else {
      const stageMatchIds = new Set(
        matches.filter((match) => match.stage === activeStage).map((match) => match.id),
      );
      for (const prediction of currentPredictionMap.values()) {
        if (stageMatchIds.has(prediction.matchId)) consider(prediction.updatedAt);
      }
    }
    return latest;
  }, [activeStage, currentGroupPredictionMap, currentPredictionMap, matches]);

  const leaderboard = useMemo(
    () => getLeaderboard({ predictions, profiles, groupPredictions, matches, standingsStages }),
    [predictions, profiles, groupPredictions, matches, standingsStages],
  );
  const me = leaderboard.find((row) => row.user.id === currentUser.id);
  const missingMatches = matches.filter(
    (match) =>
      getMatchStatus(match, now) === "open" &&
      openStages.has(match.stage) &&
      match.homeTeamId &&
      match.awayTeamId &&
      !currentPredictionMap.has(match.id),
  ).length;
  const missingGroups = groups.filter(
    (group) =>
      getGroupStatus(group, now) === "open" &&
      openStages.has("groups") &&
      !isGroupPredictionComplete(currentGroupPredictionMap.get(group.groupLabel)),
  ).length;
  const missingCount = missingMatches + missingGroups;

  return (
    <section className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-4 max-lg:grid-cols-1">
      <div className="min-w-0">
        <div className="mb-6 grid gap-3">
          <StageTabs activeStage={activeStage} enabledStages={openStages} onChange={setActiveStage} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 max-lg:w-full">
              {activeStage === "groups" && (
                <GroupFilter options={groupOptions} selected={selectedGroups} onChange={setSelectedGroups} />
              )}
              <Button
                variant={missingOnly ? "default" : "outline"}
                className={cn(ui.control, missingOnly && "border-app-brand bg-app-brand text-app-brand-fg hover:bg-app-brand", "max-lg:w-full")}
                onClick={() => setMissingOnly((value) => !value)}
              >
                Faltan ({missingCount})
              </Button>
            </div>
            <div className="flex items-center gap-2.5 max-lg:w-full max-lg:justify-between">
              {lastModifiedAt && (
                <span className="text-xs font-bold text-app-muted">
                  Última modificación: {formatRelativeTime(lastModifiedAt, now)}
                </span>
              )}
              <SaveStatus state={saveState} />
            </div>
          </div>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          {activeStage === "groups"
            ? visibleGroups.map((group) => (
                <GroupStandingsCard
                  key={group.groupLabel}
                  group={group}
                  teams={teams.filter((team) => team.group === group.groupLabel)}
                  prediction={currentGroupPredictionMap.get(group.groupLabel)}
                  allPredictions={groupPredictions.filter(
                    (prediction) => prediction.groupLabel === group.groupLabel,
                  )}
                  profiles={profiles}
                  now={now}
                  stageOpen={openStages.has("groups")}
                  onChange={updateGroupPrediction}
                  onOpenDrawer={setDrawerGroup}
                />
              ))
            : visibleMatches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  prediction={currentPredictionMap.get(match.id)}
                  allPredictions={predictions.filter((prediction) => prediction.matchId === match.id)}
                  now={now}
                  teams={teams}
                  profiles={profiles}
                  openStages={openStages}
                  onChange={updatePrediction}
                  onOpenDrawer={openPredictionDrawer}
                />
              ))}
        </div>
      </div>
      <aside className="sticky top-5 grid gap-2.5 max-lg:hidden">
        <SummaryPanel points={me?.points ?? 0} rank={me?.rank ?? 1} missingCount={missingCount} />
        <LeaderboardPreview rows={leaderboard.slice(0, 4)} onOpen={() => router.push("/tabla")} />
        <StatsTeaser />
      </aside>
      <GroupDrawer
        group={drawerGroup}
        groupPredictions={groupPredictions}
        profiles={profiles}
        teams={teams}
        onClose={() => setDrawerGroup(null)}
      />
    </section>
  );
}

function SummaryPanel({ points, rank, missingCount }: { points: number; rank: number; missingCount: number }) {
  return (
    <Card className={cn(ui.panel, "grid grid-cols-3 gap-2 p-2.5")}>
      <Stat label="Puntos" value={String(points)} />
      <Stat label="Puesto" value={`#${rank}`} />
      <Stat label="Pendientes" value={String(missingCount)} tone={missingCount ? "warn" : "ok"} />
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "ok" }) {
  return (
    <div className="min-w-0 rounded-lg border border-app-line bg-app-surface px-2.5 py-2">
      <span className={ui.label}>{label}</span>
      <strong className={cn(
        "mt-1 block text-lg font-black leading-none",
        tone === "warn" && "text-app-amber",
        tone === "ok" && "text-app-green",
      )}>{value}</strong>
    </div>
  );
}

function LeaderboardPreview({ rows, onOpen }: { rows: LeaderboardRow[]; onOpen: () => void }) {
  return (
    <Card className={cn(ui.panel, "p-4")}>
      <Button variant="ghost" className="flex w-full items-center justify-between gap-3 p-0 text-left hover:bg-transparent" onClick={onOpen}>
        <h2 className="m-0 text-base font-black leading-tight">Tabla familiar</h2>
        <ChevronRight size={18} />
      </Button>
      <div className="mt-2.5 grid gap-1.5">
        {rows.map((row) => (
          <div key={row.user.id} className={cn(ui.row, "grid min-h-9 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 px-2.5 py-2")}>
            <span className="font-black text-app-muted">#{row.rank}</span>
            <strong className="truncate text-sm font-black">{row.user.displayName}</strong>
            <em className="text-sm font-black not-italic text-app-green">{row.points} pts</em>
          </div>
        ))}
      </div>
    </Card>
  );
}

function GroupFilter({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  const label = selected.length === 0 ? "Todos los grupos" : selected.join(", ");

  return (
    <Combobox.Root
      multiple
      items={options}
      value={selected}
      onValueChange={(value) => onChange([...(value as string[])].sort(compareGroups))}
    >
      <Combobox.Trigger className={cn(ui.control, "inline-flex w-55 items-center justify-between rounded-lg border px-3 max-lg:w-full")} aria-label="Filtrar por grupos">
        <span className={ui.label}>Grupos</span>
        <strong className={cn(ui.controlValue, "min-w-0 flex-1 truncate text-left")}>{label}</strong>
        <ChevronDown size={15} className="shrink-0" />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={6} className="z-30">
          <Combobox.Popup className={cn(ui.panel, "grid w-60 gap-1 p-1.5")}>
            <Combobox.Input
              className="h-8 rounded-md border border-app-line bg-app-surface px-2 text-sm font-bold text-app-text placeholder:text-app-muted"
              placeholder="Buscar grupo"
            />
            <Combobox.List className="grid gap-1">
              <Combobox.Empty className="px-2 py-2 text-sm font-bold text-app-muted">Sin grupos</Combobox.Empty>
              {options.map((group) => (
                <Combobox.Item
                  key={group}
                  value={group}
                  className="flex h-8 items-center gap-2 rounded-md px-2.5 text-sm font-extrabold text-app-text data-highlighted:bg-app-surface-2 data-selected:bg-app-brand data-selected:text-app-brand-fg"
                >
                  <Combobox.ItemIndicator>
                    <Check size={14} />
                  </Combobox.ItemIndicator>
                  Grupo {group}
                </Combobox.Item>
              ))}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

const POSITION_LABELS = ["1°", "2°", "3°", "4°"] as const;
const GROUP_SLOT_NONE = "__none__";

function toGroupOrder(prediction?: GroupPrediction): (string | null)[] {
  return [
    prediction?.firstTeamId ?? null,
    prediction?.secondTeamId ?? null,
    prediction?.thirdTeamId ?? null,
    prediction?.fourthTeamId ?? null,
  ];
}

function groupOrderTeams(prediction: GroupPrediction): (string | null)[] {
  return [
    prediction.firstTeamId,
    prediction.secondTeamId,
    prediction.thirdTeamId,
    prediction.fourthTeamId,
  ];
}

function GroupStandingsCard({
  group,
  teams,
  prediction,
  allPredictions,
  profiles,
  now,
  stageOpen,
  onChange,
  onOpenDrawer,
}: {
  group: Group;
  teams: Team[];
  prediction?: GroupPrediction;
  allPredictions: GroupPrediction[];
  profiles: Profile[];
  now: Date;
  stageOpen: boolean;
  onChange: (groupLabel: string, order: (string | null)[]) => void;
  onOpenDrawer: (group: Group) => void;
}) {
  const status = getGroupStatus(group, now);
  const isOpen = status === "open" && stageOpen;
  const actual = [group.firstTeamId, group.secondTeamId, group.thirdTeamId, group.fourthTeamId];

  const [order, setOrder] = useState<(string | null)[]>(() => toGroupOrder(prediction));
  const savedKey = prediction ? groupOrderTeams(prediction).join("-") : "";
  useEffect(() => {
    // Re-seed from a saved prediction when it changes (e.g. after a refresh),
    // but keep the in-progress order when the prediction is cleared/removed.
    if (prediction) setOrder(toGroupOrder(prediction));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const applySlot = (index: number, teamId: string | null) => {
    const next = [...order];
    // If the team already sits in another slot, clear that slot so the team
    // moves here and the old position is left empty to re-pick.
    if (teamId) {
      const existingIndex = next.findIndex((slot) => slot === teamId);
      if (existingIndex !== -1 && existingIndex !== index) {
        next[existingIndex] = null;
      }
    }
    next[index] = teamId;
    setOrder(next);
    // Persist on every change: complete orders are saved, incomplete ones
    // (a cleared slot) remove the stored prediction.
    onChange(group.groupLabel, next);
  };

  const submittedCount = allPredictions.length;
  const missingCount = profiles.filter((profile) => profile.approved).length - submittedCount;
  const statusLabel =
    status === "open"
      ? group.locksAt
        ? getLockCopy(group.locksAt, now)
        : "Sin fecha"
      : status === "locked"
        ? "Cerrado"
        : "Finalizado";
  const statusDetail =
    status === "open" && group.locksAt ? `Cierra el ${formatKickoff(group.locksAt)}` : undefined;

  return (
    <Card className={cn(
      ui.panel,
      "@container p-3.5",
      status === "locked" && "border-app-amber/45",
      status === "finalized" && "border-app-green/45",
    )}>
      <div className="flex items-center justify-between gap-3">
        <StageBadge stage="groups" group={group.groupLabel} />
        <StatusChip status={status} label={statusLabel} detail={statusDetail} />
      </div>

      <div className="mt-3.5 grid gap-2">
        {POSITION_LABELS.map((label, index) => {
          const slotTeamId = order[index];
          const isCorrect = status === "finalized" && slotTeamId !== null && slotTeamId === actual[index];
          return (
            <div
              key={label}
              className={cn(
                "grid grid-cols-[40px_minmax(0,1fr)] items-center gap-2.5 rounded-lg border border-app-line bg-app-surface px-2.5 py-2",
                isCorrect && "border-app-green/55 bg-app-green/5",
              )}
            >
              <span className="grid size-8 place-items-center rounded-md bg-app-surface-2 text-sm font-black text-app-muted">
                {label}
              </span>
              <Select
                value={slotTeamId}
                onValueChange={(value) =>
                  applySlot(index, value === GROUP_SLOT_NONE ? null : ((value as string) || null))
                }
                disabled={!isOpen}
              >
                <SelectTrigger className={cn(ui.control, "w-full")} aria-label={`Posición ${label}`}>
                  <SelectValue className={ui.controlValue} placeholder="Elegí equipo">
                    {slotTeamId
                      ? `${getTeamFlag(slotTeamId, teams)} ${getTeamLabel(slotTeamId, teams)}`
                      : "Elegí equipo"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GROUP_SLOT_NONE}>— Vacío —</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.flag} {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      {status !== "open" && (
        <footer className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-app-line pt-3 text-xs font-extrabold text-app-muted">
          {status === "finalized" && prediction ? (
            <span className="text-app-green">{prediction.points ?? 0} pts · {prediction.exactPositions}/4</span>
          ) : (
            <span />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-xs font-extrabold text-app-blue hover:bg-transparent hover:underline"
            onClick={() => onOpenDrawer(group)}
          >
            <PanelRightOpen size={15} />
            Pronósticos: {submittedCount} cargados · {Math.max(0, missingCount)} sin pronóstico
          </Button>
        </footer>
      )}
    </Card>
  );
}

function MatchCard({
  match,
  prediction,
  allPredictions,
  now,
  teams,
  profiles,
  openStages,
  onChange,
  onOpenDrawer,
}: {
  match: Match;
  prediction?: Prediction;
  allPredictions: Prediction[];
  now: Date;
  teams: Team[];
  profiles: Profile[];
  openStages: Set<Stage>;
  onChange: (match: Match, patch: Partial<Prediction>) => void;
  onOpenDrawer: (match: Match) => void;
}) {
  const status = getMatchStatus(match, now);
  const isOpen = status === "open" && openStages.has(match.stage) && match.homeTeamId && match.awayTeamId;

  const [draft, setDraft] = useState<PredictionDraft>(() => toDraft(prediction));
  const savedKey = prediction
    ? `${prediction.homeScore}-${prediction.awayScore}-${prediction.winnerTeamId ?? ""}`
    : "";
  useEffect(() => {
    setDraft(toDraft(prediction));
    // Re-seed only when the saved prediction actually changes (e.g. after a refresh).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const applyDraft = (next: PredictionDraft) => {
    const normalized = needsAdvancer(match, next) ? next : { ...next, winnerTeamId: null };
    setDraft(normalized);

    const complete =
      normalized.homeScore !== null &&
      normalized.awayScore !== null &&
      (!needsAdvancer(match, normalized) || normalized.winnerTeamId !== null);

    if (complete) {
      onChange(match, {
        homeScore: normalized.homeScore as number,
        awayScore: normalized.awayScore as number,
        winnerTeamId: normalized.winnerTeamId,
      });
    }
  };

  const showAdvancer = needsAdvancer(match, draft);
  const submittedCount = allPredictions.length;
  const missingCount = profiles.filter((profile) => profile.approved).length - submittedCount;

  return (
    <Card className={cn(
      ui.panel,
      "@container p-3.5",
      status === "locked" && "border-app-amber/45",
      status === "finalized" && "border-app-green/45",
    )}>
      <div className="flex items-center justify-between gap-3">
        <StageBadge stage={match.stage} group={match.group} />
        <StatusChip
          status={status}
          label={status === "open" ? getLockCopy(match.kickoffUtc, now) : status === "locked" ? "Cerrado" : "Finalizado"}
          detail={status === "open" ? `Cierra el ${formatKickoff(match.kickoffUtc)}` : undefined}
        />
      </div>

      <div className="mt-3.5 grid grid-cols-[minmax(0,1fr)_auto_20px_auto_minmax(0,1fr)] items-center gap-2 @max-xl:grid-cols-[minmax(0,1fr)_auto] @max-xl:gap-3">
        <TeamBlock className="@max-xl:col-start-1 @max-xl:row-start-1" teamId={match.homeTeamId} seed={match.homeSeed} teams={teams} />
        <ScoreControl
          className="@max-xl:col-start-2 @max-xl:row-start-1"
          value={draft.homeScore}
          disabled={!isOpen}
          onChange={(value) => applyDraft({ ...draft, homeScore: value })}
        />
        <span className="text-center text-xs font-black uppercase text-app-muted @max-xl:hidden">vs</span>
        <ScoreControl
          className="@max-xl:col-start-2 @max-xl:row-start-2"
          value={draft.awayScore}
          disabled={!isOpen}
          onChange={(value) => applyDraft({ ...draft, awayScore: value })}
        />
        <TeamBlock className="@max-xl:col-start-1 @max-xl:row-start-2" teamId={match.awayTeamId} seed={match.awaySeed} align="right" teams={teams} />
      </div>

      {showAdvancer && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-app-blue/20 bg-app-blue/5 p-2.5">
          <span className={ui.label}>Clasifica</span>
          {[match.homeTeamId, match.awayTeamId].map((teamId) => (
            <Button
              key={teamId}
              variant={draft.winnerTeamId === teamId ? "default" : "outline"}
              size="sm"
              className="font-extrabold"
              disabled={!isOpen}
              onClick={() => applyDraft({ ...draft, winnerTeamId: teamId })}
            >
              {getTeamFlag(teamId, teams)} {getTeamLabel(teamId, teams)}
            </Button>
          ))}
        </div>
      )}

      <footer className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-app-line pt-3 text-xs font-extrabold text-app-muted @max-md:flex-col @max-md:items-start">
        <span className="inline-flex items-center gap-1.5"><CalendarClock size={14} /> {formatKickoff(match.kickoffUtc)}</span>
        <span>{match.city ?? "Sede por definir"}</span>
        {status !== "open" && (
          <Button variant="ghost" size="sm" className="h-auto p-0 text-xs font-extrabold text-app-blue hover:bg-transparent hover:underline" onClick={() => onOpenDrawer(match)}>
            <PanelRightOpen size={15} />
            Pronósticos: {submittedCount} cargados · {Math.max(0, missingCount)} sin pronóstico
          </Button>
        )}
      </footer>
    </Card>
  );
}

function TeamBlock({
  teamId,
  seed,
  teams,
  align = "left",
  className,
}: {
  teamId: string | null;
  seed?: string;
  teams: Team[];
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <div className={cn(
      "grid min-w-0 items-center gap-x-2.5",
      align === "right"
        ? "grid-cols-[minmax(0,1fr)_36px] text-right @max-xl:grid-cols-[36px_minmax(0,1fr)] @max-xl:text-left"
        : "grid-cols-[36px_minmax(0,1fr)]",
      className,
    )}>
      <span className={cn(
        "row-span-2 grid size-9 place-items-center rounded-md border border-app-line bg-app-surface-2 text-lg",
        align === "right" && "col-start-2 @max-xl:col-start-1",
      )}>{getTeamFlag(teamId, teams)}</span>
      <strong className={cn(
        "truncate text-sm font-black",
        align === "right" && "col-start-1 @max-xl:col-start-2",
      )}>{getTeamLabel(teamId, teams, seed)}</strong>
      <small className={cn(
        "truncate text-xs font-bold text-app-muted",
        align === "right" ? "col-start-1 @max-xl:col-start-2" : "col-start-2",
      )}>{teamId ? teams.find((team) => team.id === teamId)?.shortName : seed}</small>
    </div>
  );
}

function toDraft(prediction?: Prediction): PredictionDraft {
  return {
    homeScore: prediction?.homeScore ?? null,
    awayScore: prediction?.awayScore ?? null,
    winnerTeamId: prediction?.winnerTeamId ?? null,
  };
}

function ScoreControl({ value, disabled, className, onChange }: { value: number | null; disabled: boolean; className?: string; onChange: (value: number | null) => void }) {
  return (
    <div className={cn("grid grid-cols-[28px_40px_28px] items-center gap-1", className)}>
      <Button variant="outline" size="icon-sm" disabled={disabled || value === null} onClick={() => onChange(stepScore(value, -1))} aria-label="Restar gol">
        <Minus size={15} />
      </Button>
      <Input
        className="h-9 w-10 border-app-line-strong bg-app-surface text-center text-lg font-black"
        disabled={disabled}
        value={value === null ? "" : String(value)}
        placeholder="-"
        onChange={(event) => {
          const raw = event.target.value.trim();
          if (raw === "") return onChange(null);
          const parsed = Number(raw);
          onChange(Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null);
        }}
        inputMode="numeric"
      />
      <Button variant="outline" size="icon-sm" disabled={disabled} onClick={() => onChange(stepScore(value, 1))} aria-label="Sumar gol">
        <Plus size={15} />
      </Button>
    </div>
  );
}

function EarnedPoints({ finalized, points }: { finalized: boolean; points: number | null }) {
  if (!finalized) {
    return <span className="shrink-0 text-sm font-black text-app-muted">-</span>;
  }
  return <span className="shrink-0 text-sm font-black text-app-green">{points ?? 0} pts</span>;
}

export function PredictionDrawer({
  match,
  predictions,
  profiles,
  teams,
  onClose,
}: {
  match: Match | null;
  predictions: Prediction[];
  profiles: Profile[];
  teams: Team[];
  onClose: () => void;
}) {
  const matchPredictions = match
    ? predictions.filter((prediction) => prediction.matchId === match.id)
    : [];
  const finalized = Boolean(match && (match.status === "finalized" || match.finalizedAt));
  const shortName = (teamId: string) =>
    teams.find((team) => team.id === teamId)?.shortName ?? getTeamLabel(teamId, teams);

  return (
    <Sheet open={Boolean(match)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="sm:max-w-md">
        {match && (
          <>
            <SheetHeader>
              <p className="text-xs font-extrabold uppercase leading-none text-app-muted">
                {stageLabels[match.stage]}
              </p>
              <SheetTitle className="mt-1 text-xl font-black text-app-text">
                {getTeamLabel(match.homeTeamId, teams, match.homeSeed)} vs {getTeamLabel(match.awayTeamId, teams, match.awaySeed)}
              </SheetTitle>
            </SheetHeader>
            <div className="grid min-h-0 flex-1 gap-1.5 overflow-y-auto overscroll-contain px-4 pb-4">
              {profiles.filter((profile) => profile.approved).map((profile) => {
                const prediction = matchPredictions.find((item) => item.userId === profile.id);
                return (
                  <div key={profile.id} className="flex flex-col gap-0.5 rounded-md bg-app-surface-2 px-2.5 py-2">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2.5">
                      <strong className="truncate text-sm font-black">{profile.displayName}</strong>
                      {prediction && <EarnedPoints finalized={finalized} points={prediction.points} />}
                    </div>
                    {prediction ? (
                      <span className="text-sm font-bold text-app-muted">
                        <span className="text-app-text">{prediction.homeScore}-{prediction.awayScore}</span>
                        {prediction.winnerTeamId
                          ? ` · clasifica ${getTeamFlag(prediction.winnerTeamId, teams)} ${shortName(prediction.winnerTeamId)}`
                          : ""}
                      </span>
                    ) : (
                      <span className="text-sm font-bold text-app-muted">Sin pronóstico</span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function GroupDrawer({
  group,
  groupPredictions,
  profiles,
  teams,
  onClose,
}: {
  group: Group | null;
  groupPredictions: GroupPrediction[];
  profiles: Profile[];
  teams: Team[];
  onClose: () => void;
}) {
  const predictions = group
    ? groupPredictions.filter((prediction) => prediction.groupLabel === group.groupLabel)
    : [];
  const finalized = Boolean(group?.resultFinalizedAt);
  const shortName = (teamId: string) =>
    teams.find((team) => team.id === teamId)?.shortName ?? getTeamLabel(teamId, teams);

  return (
    <Sheet open={Boolean(group)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="sm:max-w-md">
        {group && (
          <>
            <SheetHeader>
              <p className="text-xs font-extrabold uppercase leading-none text-app-muted">
                {stageLabels.groups}
              </p>
              <SheetTitle className="mt-1 text-xl font-black text-app-text">
                Grupo {group.groupLabel}
              </SheetTitle>
            </SheetHeader>
            <div className="grid min-h-0 flex-1 gap-1.5 overflow-y-auto overscroll-contain px-4 pb-4">
              {profiles.filter((profile) => profile.approved).map((profile) => {
                const prediction = predictions.find((item) => item.userId === profile.id);
                return (
                  <div key={profile.id} className="flex flex-col gap-0.5 rounded-md bg-app-surface-2 px-2.5 py-2">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2.5">
                      <strong className="truncate text-sm font-black">{profile.displayName}</strong>
                      {prediction && <EarnedPoints finalized={finalized} points={prediction.points} />}
                    </div>
                    {prediction ? (
                      <span className="text-sm font-bold text-app-text">
                        {groupOrderTeams(prediction).map((teamId, index) => (
                          <Fragment key={index}>
                            {index > 0 ? " · " : ""}
                            {teamId ? (
                              <span title={getTeamLabel(teamId, teams)}>
                                {getTeamFlag(teamId, teams)} {shortName(teamId)}
                              </span>
                            ) : (
                              "—"
                            )}
                          </Fragment>
                        ))}
                      </span>
                    ) : (
                      <span className="text-sm font-bold text-app-muted">Sin pronóstico</span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
