"use client";

import {
  Download,
  FileUp,
  Lock,
  RefreshCcw,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getGroupStatus,
  getTeamFlag,
  getTeamLabel,
  stageLabels,
  stageOrder,
} from "@/lib/tournament";
import type { Group, Match, MatchLifecycleStatus, Stage } from "@/lib/types";
import { compareGroups, getAdminLifecycleStatus, ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

import { useApp, type CreateMatchActionInput } from "@/components/app-context";
import { LoadingLabel } from "@/components/badges";

// Group matches no longer exist; admins only create knockout fixtures.
const creatableStages = stageOrder.filter((stage) => stage !== "groups");

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

type AdminMatchDraft = {
  status: MatchLifecycleStatus;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
};

type NewMatchDraft = {
  matchNo: string;
  stage: Stage;
  homeTeamId: string;
  awayTeamId: string;
  homeSeed: string;
  awaySeed: string;
  kickoffLocal: string;
  venue: string;
  city: string;
};

const emptyNewMatchDraft: NewMatchDraft = {
  matchNo: "",
  stage: "round32",
  homeTeamId: "",
  awayTeamId: "",
  homeSeed: "",
  awaySeed: "",
  kickoffLocal: "",
  venue: "",
  city: "",
};

export function AdminScreen() {
  const {
    matches,
    predictions,
    groups,
    groupPredictions,
    profiles,
    stages,
    teams,
    now,
    dataMessage,
    finalizeMatch,
    finalizeGroupResult,
    updateGroupLocksAt,
    importMatchesCsv,
    exportMatchesCsv,
    recalculatePoints,
    createMatch,
    deleteMatch,
    updateStageFlag,
    approveProfile,
  } = useApp();

  const importInputRef = useRef<HTMLInputElement>(null);
  const [pendingAdminAction, setPendingAdminAction] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, AdminMatchDraft>>(() => {
    return Object.fromEntries(
      matches.map((match) => [
        match.id,
        {
          status: getAdminLifecycleStatus(match, now),
          homeScore: match.homeScore ?? 0,
          awayScore: match.awayScore ?? 0,
          winnerTeamId: match.winnerTeamId,
        },
      ]),
    );
  });
  const [newMatchDraft, setNewMatchDraft] = useState<NewMatchDraft>(emptyNewMatchDraft);
  const [confirmingDeleteMatchId, setConfirmingDeleteMatchId] = useState<string | null>(null);

  useEffect(() => {
    setDrafts((current) => {
      return Object.fromEntries(
        matches.map((match) => [
          match.id,
          current[match.id] ?? {
            status: getAdminLifecycleStatus(match, now),
            homeScore: match.homeScore ?? 0,
            awayScore: match.awayScore ?? 0,
            winnerTeamId: match.winnerTeamId,
          },
        ]),
      );
    });
  }, [matches, now]);

  function updateDraft(matchId: string, patch: Partial<AdminMatchDraft>) {
    setDrafts((current) => ({
      ...current,
      [matchId]: {
        status: current[matchId]?.status ?? "open",
        homeScore: current[matchId]?.homeScore ?? 0,
        awayScore: current[matchId]?.awayScore ?? 0,
        winnerTeamId: current[matchId]?.winnerTeamId ?? null,
        ...patch,
      },
    }));
  }

  function updateNewMatchDraft(patch: Partial<NewMatchDraft>) {
    setNewMatchDraft((current) => ({ ...current, ...patch }));
  }

  async function runAdminAction(key: string, callback: () => Promise<void> | void) {
    if (pendingAdminAction) return;
    setPendingAdminAction(key);
    try {
      await callback();
    } finally {
      setPendingAdminAction(null);
    }
  }

  async function submitNewMatch() {
    const kickoffUtc = newMatchDraft.kickoffLocal
      ? new Date(newMatchDraft.kickoffLocal).toISOString()
      : "";

    const input: CreateMatchActionInput = {
      matchNo: newMatchDraft.matchNo ? Number(newMatchDraft.matchNo) : null,
      stage: newMatchDraft.stage,
      groupLabel: null,
      homeTeamId: newMatchDraft.homeTeamId || null,
      awayTeamId: newMatchDraft.awayTeamId || null,
      homeSeed: newMatchDraft.homeTeamId ? null : newMatchDraft.homeSeed.trim() || null,
      awaySeed: newMatchDraft.awayTeamId ? null : newMatchDraft.awaySeed.trim() || null,
      kickoffUtc,
      venue: newMatchDraft.venue.trim() || null,
      city: newMatchDraft.city.trim() || null,
    };

    await runAdminAction("create-match", async () => {
      await createMatch(input);
    });
    setNewMatchDraft({ ...emptyNewMatchDraft, stage: newMatchDraft.stage });
  }

  async function confirmDeleteMatch(matchId: string) {
    if (confirmingDeleteMatchId !== matchId) {
      setConfirmingDeleteMatchId(matchId);
      return;
    }
    setConfirmingDeleteMatchId(null);
    await runAdminAction(`delete-${matchId}`, () => deleteMatch(matchId));
  }

  async function handleImportInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    await runAdminAction("import-csv", () => importMatchesCsv(file));
  }

  return (
    <section className="grid grid-cols-[minmax(0,1fr)_320px] gap-4 max-lg:grid-cols-1">
      <div className="grid min-w-0 content-start gap-4">
        <Card className={cn(ui.panel, "p-4")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-lg font-black">Agregar partido</h2>
          </div>
          <div className="manual-match-form">
            <label>
              <span>Nro.</span>
              <Input min="1" type="number" placeholder="Auto" value={newMatchDraft.matchNo} onChange={(event) => updateNewMatchDraft({ matchNo: event.target.value })} />
            </label>
            <label>
              <span>Etapa</span>
              <Select value={newMatchDraft.stage} onValueChange={(value) => updateNewMatchDraft({ stage: value as Stage })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {creatableStages.map((stage) => (
                    <SelectItem key={stage} value={stage}>{stageLabels[stage]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label>
              <span>Local</span>
              <Select value={newMatchDraft.homeTeamId || "__seed__"} onValueChange={(value) => updateNewMatchDraft({ homeTeamId: value && value !== "__seed__" ? value : "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__seed__">Por definir</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>{team.flag} {team.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!newMatchDraft.homeTeamId && (
                <Input placeholder="Ej: Winner Match 89" value={newMatchDraft.homeSeed} onChange={(event) => updateNewMatchDraft({ homeSeed: event.target.value })} />
              )}
            </label>
            <label>
              <span>Visitante</span>
              <Select value={newMatchDraft.awayTeamId || "__seed__"} onValueChange={(value) => updateNewMatchDraft({ awayTeamId: value && value !== "__seed__" ? value : "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__seed__">Por definir</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>{team.flag} {team.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!newMatchDraft.awayTeamId && (
                <Input placeholder="Ej: Runner-up Group A" value={newMatchDraft.awaySeed} onChange={(event) => updateNewMatchDraft({ awaySeed: event.target.value })} />
              )}
            </label>
            <label>
              <span>Fecha y hora</span>
              <Input type="datetime-local" value={newMatchDraft.kickoffLocal} onChange={(event) => updateNewMatchDraft({ kickoffLocal: event.target.value })} />
            </label>
            <label>
              <span>Sede</span>
              <Input placeholder="Estadio" value={newMatchDraft.venue} onChange={(event) => updateNewMatchDraft({ venue: event.target.value })} />
            </label>
            <label>
              <span>Ciudad</span>
              <Input placeholder="Ciudad" value={newMatchDraft.city} onChange={(event) => updateNewMatchDraft({ city: event.target.value })} />
            </label>
            <Button className="manual-match-submit" disabled={!newMatchDraft.kickoffLocal || Boolean(pendingAdminAction)} onClick={submitNewMatch}>
              <LoadingLabel loading={pendingAdminAction === "create-match"} label="Agregar partido" />
            </Button>
          </div>
        </Card>

        <Card className={cn(ui.panel, "p-4")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-lg font-black">Resultados de grupos</h2>
          </div>
          <div className="mt-3 grid gap-3">
            {[...groups].sort((a, b) => compareGroups(a.groupLabel, b.groupLabel)).map((group) => (
              <GroupAdminCard
                key={group.groupLabel}
                group={group}
                teams={teams.filter((team) => team.group === group.groupLabel)}
                predictionCount={groupPredictions.filter((prediction) => prediction.groupLabel === group.groupLabel).length}
                now={now}
                pendingKey={pendingAdminAction}
                onFinalize={(order) =>
                  runAdminAction(`finalize-group-${group.groupLabel}`, () =>
                    finalizeGroupResult({
                      groupLabel: group.groupLabel,
                      firstTeamId: order[0],
                      secondTeamId: order[1],
                      thirdTeamId: order[2],
                      fourthTeamId: order[3],
                    }),
                  )
                }
                onSaveLocks={(locksIso) =>
                  runAdminAction(`locks-group-${group.groupLabel}`, () =>
                    updateGroupLocksAt(group.groupLabel, locksIso),
                  )
                }
                onSetOpen={(open) =>
                  runAdminAction(`status-group-${group.groupLabel}`, () =>
                    updateGroupLocksAt(group.groupLabel, open ? null : new Date().toISOString()),
                  )
                }
              />
            ))}
            {groups.length === 0 && <p className="admin-message">No hay grupos cargados.</p>}
          </div>
        </Card>

        <Card className={cn(ui.panel, "p-4")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-lg font-black">Admin / Resultados</h2>
            <div className="admin-actions">
              <input ref={importInputRef} className="csv-file-input" type="file" accept=".csv,text/csv" onChange={handleImportInputChange} />
              <Button variant="outline" disabled={Boolean(pendingAdminAction)} onClick={() => importInputRef.current?.click()}>
                <LoadingLabel loading={pendingAdminAction === "import-csv"} icon={<FileUp size={16} />} label="Importar CSV" />
              </Button>
              <Button variant="outline" onClick={exportMatchesCsv}><Download size={16} /> Exportar CSV</Button>
              <Button variant="outline" disabled={Boolean(pendingAdminAction)} onClick={() => runAdminAction("recalculate-points", recalculatePoints)}>
                <LoadingLabel loading={pendingAdminAction === "recalculate-points"} icon={<RefreshCcw size={16} />} label="Recalcular puntos" />
              </Button>
            </div>
          </div>
          {dataMessage && <p className="admin-message">{dataMessage}</p>}
          <div className="data-table admin-table">
            {matches.map((match) => {
              const draft = drafts[match.id] ?? {
                status: match.status ?? "open",
                homeScore: match.homeScore ?? 0,
                awayScore: match.awayScore ?? 0,
                winnerTeamId: match.winnerTeamId,
              };
              const showWinner = match.stage !== "groups" && draft.homeScore === draft.awayScore && match.homeTeamId && match.awayTeamId;
              const finalizedDraft: Match = {
                ...match,
                status: draft.status ?? "open",
                homeScore: draft.homeScore,
                awayScore: draft.awayScore,
                winnerTeamId: draft.homeScore > draft.awayScore
                  ? match.homeTeamId
                  : draft.awayScore > draft.homeScore
                    ? match.awayTeamId
                    : draft.winnerTeamId,
              };

              return (
                <div key={match.id} className="data-row admin-row">
                  <span>#{match.matchNo}</span>
                  <strong>{getTeamLabel(match.homeTeamId, teams, match.homeSeed)} vs {getTeamLabel(match.awayTeamId, teams, match.awaySeed)}</strong>
                  <span>{stageLabels[match.stage]}</span>
                  <span>{match.city ?? "Sede TBD"}</span>
                  <Select value={draft.status ?? "open"} onValueChange={(value) => updateDraft(match.id, { status: value as Match["status"] })}>
                    <SelectTrigger className="admin-status-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Abierto</SelectItem>
                      <SelectItem value="live">En juego</SelectItem>
                      <SelectItem value="finalized">Finalizado</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="admin-score-edit">
                    <label>
                      <span>{getTeamFlag(match.homeTeamId, teams)}</span>
                      <Input min="0" type="number" inputMode="numeric" value={draft.homeScore} onChange={(event) => updateDraft(match.id, { homeScore: Math.max(0, Number(event.target.value) || 0) })} />
                    </label>
                    <label>
                      <span>{getTeamFlag(match.awayTeamId, teams)}</span>
                      <Input min="0" type="number" inputMode="numeric" value={draft.awayScore} onChange={(event) => updateDraft(match.id, { awayScore: Math.max(0, Number(event.target.value) || 0) })} />
                    </label>
                    {showWinner && (
                      <Select value={draft.winnerTeamId ?? ""} onValueChange={(value) => updateDraft(match.id, { winnerTeamId: value || null })}>
                        <SelectTrigger><SelectValue placeholder="Clasifica" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={match.homeTeamId ?? ""}>{getTeamLabel(match.homeTeamId, teams, match.homeSeed)}</SelectItem>
                          <SelectItem value={match.awayTeamId ?? ""}>{getTeamLabel(match.awayTeamId, teams, match.awaySeed)}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="admin-row-actions">
                    <Button disabled={Boolean(pendingAdminAction) || Boolean(draft.status === "finalized" && showWinner && !finalizedDraft.winnerTeamId)} onClick={() => runAdminAction(`finalize-${match.id}`, () => finalizeMatch(finalizedDraft))}>
                      <LoadingLabel loading={pendingAdminAction === `finalize-${match.id}`} label="Guardar" />
                    </Button>
                    <Button variant={confirmingDeleteMatchId === match.id ? "destructive" : "outline"} disabled={Boolean(pendingAdminAction)} onClick={() => confirmDeleteMatch(match.id)}>
                      <LoadingLabel loading={pendingAdminAction === `delete-${match.id}`} icon={<Trash2 size={15} />} label={confirmingDeleteMatchId === match.id ? "Confirmar" : "Eliminar"} />
                    </Button>
                    {confirmingDeleteMatchId === match.id && (
                      <Button variant="ghost" onClick={() => setConfirmingDeleteMatchId(null)}>Cancelar</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      <aside className="grid content-start gap-4">
        <Card className={cn(ui.panel, "p-4")}>
          <CardHeader>
            <CardTitle>Etapas habilitadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="stage-admin-list">
              {stageOrder.map((stage) => {
                const stageState = stages.find((item) => item.stage === stage);
                const flags = [
                  { flag: "predictions" as const, label: "Predicciones", value: Boolean(stageState?.predictionsOpen) },
                  { flag: "results" as const, label: "Resultados", value: Boolean(stageState?.resultsOpen) },
                  { flag: "standings" as const, label: "Standings", value: Boolean(stageState?.standingsOpen) },
                ];

                return (
                  <div className="stage-admin-row" key={stage}>
                    <div>
                      <strong>{stageLabels[stage]}</strong>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {flags.map(({ flag, label, value }) => {
                        const key = `stage-${stage}-${flag}`;
                        return (
                          <Button
                            key={flag}
                            variant={value ? "default" : "outline"}
                            size="sm"
                            disabled={Boolean(pendingAdminAction)}
                            onClick={() => runAdminAction(key, () => updateStageFlag(stage, flag, !value))}
                          >
                            <LoadingLabel loading={pendingAdminAction === key} label={label} />
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className={cn(ui.panel, "p-4")}>
          <CardHeader>
            <CardTitle>Usuarios pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            {profiles.filter((profile) => !profile.approved).map((profile) => (
              <div className="pending-user" key={profile.id}>
                <div>
                  <strong>{profile.displayName}</strong>
                  <small>{profile.email}</small>
                </div>
                <Button disabled={Boolean(pendingAdminAction)} onClick={() => runAdminAction(`approve-${profile.id}`, () => approveProfile(profile.id))}>
                  <LoadingLabel loading={pendingAdminAction === `approve-${profile.id}`} icon={<UserCheck size={16} />} label="Aprobar" />
                </Button>
              </div>
            ))}
            <p className="admin-note"><Lock size={14} /> Los administradores predicen con las mismas fechas de cierre.</p>
            <p className="admin-note"><Users size={14} /> {predictions.length} pronósticos de cruces · {groupPredictions.length} de grupos.</p>
          </CardContent>
        </Card>
      </aside>
    </section>
  );
}

const GROUP_POSITION_LABELS = ["1°", "2°", "3°", "4°"] as const;
const GROUP_SLOT_NONE = "__none__";

function GroupAdminCard({
  group,
  teams,
  predictionCount,
  now,
  pendingKey,
  onFinalize,
  onSaveLocks,
  onSetOpen,
}: {
  group: Group;
  teams: { id: string; name: string; flag: string }[];
  predictionCount: number;
  now: Date;
  pendingKey: string | null;
  onFinalize: (order: [string, string, string, string]) => Promise<void> | void;
  onSaveLocks: (locksIso: string | null) => Promise<void> | void;
  onSetOpen: (open: boolean) => Promise<void> | void;
}) {
  const [order, setOrder] = useState<(string | null)[]>(() => [
    group.firstTeamId,
    group.secondTeamId,
    group.thirdTeamId,
    group.fourthTeamId,
  ]);
  const [locksLocal, setLocksLocal] = useState(() => toDatetimeLocal(group.locksAt));

  const status = getGroupStatus(group, now);
  const closedByTime = Boolean(group.locksAt) && new Date(group.locksAt as string).getTime() <= now.getTime();
  const complete = order.every((slot): slot is string => Boolean(slot)) && new Set(order).size === 4;
  const finalizePending = pendingKey === `finalize-group-${group.groupLabel}`;
  const locksPending = pendingKey === `locks-group-${group.groupLabel}`;
  const statusPending = pendingKey === `status-group-${group.groupLabel}`;

  return (
    <div className="grid gap-3 rounded-lg border border-app-line bg-app-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm font-black">Grupo {group.groupLabel}</strong>
        <small className="text-xs font-bold text-app-muted">
          {status === "finalized" ? "Finalizado" : status === "locked" ? "Cerrado" : "Abierto"} · {predictionCount} pron.
        </small>
      </div>
      <div className="grid gap-2.5 md:grid-cols-2">
        {GROUP_POSITION_LABELS.map((label, index) => (
          <label key={label} className="grid grid-cols-[32px_minmax(0,1fr)] items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-md bg-app-surface-2 text-xs font-black text-app-muted">{label}</span>
            <Select
              value={order[index]}
              onValueChange={(value) =>
                setOrder((current) => {
                  const next = [...current];
                  if (value === GROUP_SLOT_NONE || !value) {
                    next[index] = null;
                    return next;
                  }
                  const existingIndex = next.findIndex((slot) => slot === value);
                  if (existingIndex !== -1 && existingIndex !== index) {
                    next[existingIndex] = null;
                  }
                  next[index] = value as string;
                  return next;
                })
              }
            >
              <SelectTrigger className="w-full"><SelectValue placeholder="Elegí equipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={GROUP_SLOT_NONE}>— Vacío —</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.flag} {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ))}
      </div>
      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="grid gap-1">
          <span className={ui.label}>Cierre de pronósticos</span>
          <Input
            type="datetime-local"
            className="w-full"
            value={locksLocal}
            onChange={(event) => setLocksLocal(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={Boolean(pendingKey)}
            onClick={() => onSetOpen(closedByTime)}
          >
            <LoadingLabel loading={statusPending} label={closedByTime ? "Abrir grupo" : "Cerrar grupo"} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={Boolean(pendingKey)}
            onClick={() => onSaveLocks(locksLocal ? new Date(locksLocal).toISOString() : null)}
          >
            <LoadingLabel loading={locksPending} label="Guardar cierre" />
          </Button>
        </div>
      </div>
      <Button
        className="w-full"
        size="sm"
        disabled={!complete || Boolean(pendingKey)}
        onClick={() => onFinalize(order as [string, string, string, string])}
      >
        <LoadingLabel loading={finalizePending} label="Guardar resultado" />
      </Button>
    </div>
  );
}
