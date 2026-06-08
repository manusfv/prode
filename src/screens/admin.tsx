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
import { getTeamFlag, getTeamLabel, stageLabels, stageOrder } from "@/lib/tournament";
import type { Match, MatchLifecycleStatus, Stage } from "@/lib/types";
import { getAdminLifecycleStatus, ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

import { useApp, type CreateMatchActionInput } from "@/components/app-context";
import { LoadingLabel } from "@/components/badges";

type AdminMatchDraft = {
  status: MatchLifecycleStatus;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
};

type NewMatchDraft = {
  matchNo: string;
  stage: Stage;
  groupLabel: string;
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
  stage: "groups",
  groupLabel: "",
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
    profiles,
    stages,
    teams,
    now,
    dataMessage,
    finalizeMatch,
    importMatchesCsv,
    exportMatchesCsv,
    recalculatePoints,
    createMatch,
    deleteMatch,
    updateStageOpen,
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
      groupLabel: newMatchDraft.stage === "groups" ? newMatchDraft.groupLabel.trim() || null : null,
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
                  {stageOrder.map((stage) => (
                    <SelectItem key={stage} value={stage}>{stageLabels[stage]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label>
              <span>Grupo</span>
              <Input disabled={newMatchDraft.stage !== "groups"} placeholder="A" value={newMatchDraft.groupLabel} onChange={(event) => updateNewMatchDraft({ groupLabel: event.target.value.toUpperCase() })} />
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
                const isOpen = Boolean(stageState?.open);

                return (
                  <div className="stage-admin-row" key={stage}>
                    <div>
                      <strong>{stageLabels[stage]}</strong>
                      <small>{isOpen ? "Visible para pronosticar" : "Tab deshabilitado"}</small>
                    </div>
                    <Button variant={isOpen ? "outline" : "default"} size="sm" disabled={Boolean(pendingAdminAction)} onClick={() => runAdminAction(`stage-${stage}`, () => updateStageOpen(stage, !isOpen))}>
                      <LoadingLabel loading={pendingAdminAction === `stage-${stage}`} label={isOpen ? "Deshabilitar" : "Habilitar"} />
                    </Button>
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
            <p className="admin-note"><Users size={14} /> {predictions.length} pronósticos cargados.</p>
          </CardContent>
        </Card>
      </aside>
    </section>
  );
}
