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
import { useMemo, useState } from "react";
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
  getLockCopy,
  getMatchStatus,
  getTeamFlag,
  getTeamLabel,
  needsAdvancer,
  stageLabels,
  stageOrder,
} from "@/lib/tournament";
import type { Match, Prediction, Profile, Stage, Team } from "@/lib/types";
import { compareGroups, getLeaderboard, type LeaderboardRow, ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

import { useApp } from "@/components/app-context";
import { SaveStatus, StageBadge, StageTabs, StatusChip } from "@/components/badges";

type GroupSort = "group" | "date";

export function PredictionsScreen() {
  const {
    currentUser,
    matches,
    predictions,
    profiles,
    stages,
    teams,
    now,
    saveState,
    openStages,
    updatePrediction,
    openPredictionDrawer,
  } = useApp();
  const router = useRouter();
  const [activeStage, setActiveStage] = useState<Stage>(() => {
    return stageOrder.find((stage) => openStages.has(stage)) ?? "groups";
  });
  const [missingOnly, setMissingOnly] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [groupSort, setGroupSort] = useState<GroupSort>("group");

  const currentPredictionMap = useMemo(() => {
    return new Map(
      predictions
        .filter((prediction) => prediction.userId === currentUser.id)
        .map((prediction) => [prediction.matchId, prediction]),
    );
  }, [currentUser, predictions]);

  const visibleMatches = useMemo(() => {
    return matches
      .filter((match) => match.stage === activeStage)
      .filter((match) => activeStage !== "groups" || selectedGroups.length === 0 || selectedGroups.includes(match.group ?? ""))
      .filter((match) => !missingOnly || !currentPredictionMap.has(match.id))
      .sort((a, b) => {
        if (activeStage === "groups" && groupSort === "group") {
          const groupCompare = compareGroups(a.group, b.group);
          if (groupCompare !== 0) return groupCompare;
        }
        return new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime();
      });
  }, [activeStage, currentPredictionMap, groupSort, matches, missingOnly, selectedGroups]);

  const groupOptions = useMemo(() => {
    return Array.from(
      new Set(matches.filter((match) => match.stage === "groups" && match.group).map((match) => match.group as string)),
    ).sort(compareGroups);
  }, [matches]);

  const visibleMatchSections = useMemo(() => {
    if (activeStage !== "groups" || groupSort !== "group") {
      return [{ title: null, matches: visibleMatches }];
    }
    const sections = new Map<string, Match[]>();
    for (const match of visibleMatches) {
      const group = match.group ?? "Sin grupo";
      sections.set(group, [...(sections.get(group) ?? []), match]);
    }
    return Array.from(sections.entries()).map(([title, sectionMatches]) => ({
      title,
      matches: sectionMatches,
    }));
  }, [activeStage, groupSort, visibleMatches]);

  const groupSortLabel = groupSort === "group" ? "Por grupos" : "Por fecha";

  const leaderboard = useMemo(() => getLeaderboard(predictions, profiles), [predictions, profiles]);
  const me = leaderboard.find((row) => row.user.id === currentUser.id);
  const missingCount = matches.filter(
    (match) =>
      getMatchStatus(match, now) === "open" &&
      openStages.has(match.stage) &&
      match.homeTeamId &&
      match.awayTeamId &&
      !currentPredictionMap.has(match.id),
  ).length;

  return (
    <section className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-4 max-lg:grid-cols-1">
      <div className="min-w-0">
        <div className="mb-6 grid gap-3">
          <StageTabs activeStage={activeStage} stages={stages} onChange={setActiveStage} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 max-lg:w-full">
              {activeStage === "groups" && (
                <>
                  <GroupFilter options={groupOptions} selected={selectedGroups} onChange={setSelectedGroups} />
                  <Select value={groupSort} onValueChange={(value) => setGroupSort((value ?? "group") as GroupSort)}>
                    <SelectTrigger className={cn(ui.control, "w-45 max-lg:w-full")} aria-label="Ordenar partidos">
                      <span className={ui.label}>Orden</span>
                      <SelectValue className={ui.controlValue}>{groupSortLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="group">Orden: grupos</SelectItem>
                      <SelectItem value="date">Orden: fecha</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
              <Button
                variant={missingOnly ? "default" : "outline"}
                className={cn(ui.control, missingOnly && "border-app-brand bg-app-brand text-app-brand-fg hover:bg-app-brand", "max-lg:w-full")}
                onClick={() => setMissingOnly((value) => !value)}
              >
                Faltan ({missingCount})
              </Button>
            </div>
            <SaveStatus state={saveState} />
          </div>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          {visibleMatchSections.map((section) => (
            <section key={section.title ?? "date"} className={cn("grid gap-3", !section.title && "xl:col-span-2")}>
              {section.title && <h2 className="text-base font-black leading-none">Grupo {section.title}</h2>}
              <div className={cn("grid gap-3", !section.title && "xl:grid-cols-2")}>
                {section.matches.map((match) => (
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
            </section>
          ))}
        </div>
      </div>
      <aside className="sticky top-5 grid gap-2.5 max-lg:static">
        <SummaryPanel points={me?.points ?? 0} rank={me?.rank ?? 1} missingCount={missingCount} />
        <LeaderboardPreview rows={leaderboard.slice(0, 4)} onOpen={() => router.push("/tabla")} />
      </aside>
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
  const draft = {
    homeScore: prediction?.homeScore ?? 0,
    awayScore: prediction?.awayScore ?? 0,
    winnerTeamId: prediction?.winnerTeamId ?? null,
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
        />
      </div>

      <div className="mt-3.5 grid grid-cols-[minmax(0,1fr)_auto_20px_auto_minmax(0,1fr)] items-center gap-2 @max-xl:grid-cols-[minmax(0,1fr)_auto] @max-xl:gap-3">
        <TeamBlock className="@max-xl:col-start-1 @max-xl:row-start-1" teamId={match.homeTeamId} seed={match.homeSeed} teams={teams} />
        <ScoreControl
          className="@max-xl:col-start-2 @max-xl:row-start-1"
          value={draft.homeScore}
          disabled={!isOpen}
          onChange={(value) => onChange(match, { homeScore: value })}
        />
        <span className="text-center text-xs font-black uppercase text-app-muted @max-xl:hidden">vs</span>
        <ScoreControl
          className="@max-xl:col-start-2 @max-xl:row-start-2"
          value={draft.awayScore}
          disabled={!isOpen}
          onChange={(value) => onChange(match, { awayScore: value })}
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
              onClick={() => onChange(match, { winnerTeamId: teamId })}
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

function ScoreControl({ value, disabled, className, onChange }: { value: number; disabled: boolean; className?: string; onChange: (value: number) => void }) {
  return (
    <div className={cn("grid grid-cols-[28px_40px_28px] items-center gap-1", className)}>
      <Button variant="outline" size="icon-sm" disabled={disabled || value <= 0} onClick={() => onChange(Math.max(0, value - 1))} aria-label="Restar gol">
        <Minus size={15} />
      </Button>
      <Input className="h-9 w-10 border-app-line-strong bg-app-surface text-center text-lg font-black" disabled={disabled} value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} inputMode="numeric" />
      <Button variant="outline" size="icon-sm" disabled={disabled} onClick={() => onChange(value + 1)} aria-label="Sumar gol">
        <Plus size={15} />
      </Button>
    </div>
  );
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
            <div className="grid gap-1.5 px-4 pb-4">
              {profiles.filter((profile) => profile.approved).map((profile) => {
                const prediction = matchPredictions.find((item) => item.userId === profile.id);
                return (
                  <div key={profile.id} className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-md bg-app-surface-2 px-2.5 py-2">
                    <strong className="truncate text-sm font-black">{profile.displayName}</strong>
                    {prediction ? (
                      <span className="text-sm font-bold">
                        {prediction.homeScore}-{prediction.awayScore}
                        {prediction.winnerTeamId ? ` · clasifica ${getTeamLabel(prediction.winnerTeamId, teams)}` : ""}
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
