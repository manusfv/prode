"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Crown, Eye, EyeOff, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StageTabs } from "@/components/badges";
import { ui } from "@/lib/ui-tokens";
import { getInitials, getLeaderboard, getStageLeaderboard, podiumOrder, type LeaderboardRow } from "@/lib/standings";
import { cn } from "@/lib/utils";

import { useApp } from "@/components/app-context";
import { isTournamentComplete, resolveStageTab, tabStages } from "@/lib/tournament";
import type { StageTabId } from "@/lib/tournament";

type StandingsView = "overall" | StageTabId;

export function LeaderboardScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname()
  
  const stageParam = searchParams.get("view");
  const view: StandingsView = resolveStageTab(stageParam) ?? "overall";

  const handleViewChange = (newView: StandingsView) => {
    const params = new URLSearchParams(searchParams);
    params.set("view", newView);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const { predictions, profiles, groupPredictions, matches, groups, standingsStages, currentUser, now, openWinnerCelebration } = useApp();
  const [preview, setPreview] = useState(false);

  // If the selected stage stops being revealed (admin toggled it off), fall back
  // to the accumulated view so a hidden stage's standings aren't shown.
  useEffect(() => {
    if (view !== "overall" && !tabStages(view).some((stage) => standingsStages.has(stage))) {
      handleViewChange("overall");
    }
  }, [view, standingsStages]);

  const rows = useMemo(() => {
    if (view === "overall") {
      return getLeaderboard({ predictions, profiles, groupPredictions, matches, groups, standingsStages, includeProvisional: preview });
    }
    return getStageLeaderboard(view, { predictions, profiles, groupPredictions, matches, groups, includeProvisional: preview });
  }, [view, predictions, profiles, groupPredictions, matches, groups, standingsStages, preview]);

  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  const tournamentComplete = isTournamentComplete(matches, standingsStages, now);
  const showChampion = tournamentComplete && view === "overall";

  const canPreview = standingsStages.has("groups");
  const showPreviewToggle = canPreview && (view === "overall" || view === "groups");

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <StageTabs
            activeStage={view}
            enabledStages={standingsStages}
            onChange={handleViewChange}
            leadingOption={{ value: "overall", label: "Acumulado" }}
            label="Vista"
          />
        </div>
        {tournamentComplete && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={openWinnerCelebration}
          >
            Ver celebración
          </Button>
        )}
        <StandingsLegend />
        <Tooltip
          content={
            showPreviewToggle
              ? preview
                ? "Ocultar resultados provisionales"
                : "Mostrar resultados provisionales"
              : "Vista previa de grupos no disponible en esta vista"
          }
        >
          <Button
            type="button"
            variant={preview && showPreviewToggle ? "default" : "outline"}
            size="icon-lg"
            className="shrink-0 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed sm:size-12 sm:[&_svg]:size-5"
            aria-disabled={!showPreviewToggle}
            aria-pressed={preview && showPreviewToggle}
            aria-label={preview ? "Ocultar resultados provisionales" : "Mostrar resultados provisionales"}
            onClick={() => {
              if (!showPreviewToggle) return;
              setPreview((value) => !value);
            }}
          >
            {preview && showPreviewToggle ? <EyeOff /> : <Eye />}
          </Button>
        </Tooltip>
      </div>

      <Card className={cn(ui.panel, "p-4")}>
        {preview && showPreviewToggle && (
          <p className="mb-3 rounded-lg border border-app-amber/40 bg-app-amber/10 px-3 py-2 text-xs font-bold text-app-amber">
            Mostrando la tabla <strong className="font-black">con resultados provisionales incluidos</strong>. No es el resultado final.
          </p>
        )}
        {podium.length > 0 && <Podium rows={podium} currentUserId={currentUser.id} showChampion={showChampion} />}
        {rest.length > 0 && <StandingsTable rows={rest} currentUserId={currentUser.id} />}
        {rows.length === 0 && (
          <p className="mt-4 rounded-lg border border-app-line bg-app-surface px-3 py-6 text-center text-sm font-bold text-app-muted">
            Todavía no hay participantes en la tabla.
          </p>
        )}
      </Card>
    </div>
  );
}

function StandingsLegend() {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Qué significan puntos, exactos y aciertos"
        className="grid size-6 place-items-center rounded-full text-app-muted transition-colors hover:bg-app-surface hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-brand"
      >
        <Info className="size-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="max-w-[min(20rem,calc(100vw-1.5rem))] font-normal backdrop-blur-md">
        <p className="m-0 mb-2 text-sm font-black text-app-text">Cómo se lee la tabla</p>
        <dl className="m-0 space-y-2 text-xs leading-normal text-app-muted">
          <div>
            <dt className="font-black text-app-text">Puntos</dt>
            <dd className="m-0">
              Tu total. En cruces, <strong className="font-bold text-app-text">3</strong> por el
              resultado exacto y <strong className="font-bold text-app-text">1</strong> por acertar
              ganador o empate. En grupos, <strong className="font-bold text-app-text">10/8/6/4</strong>{" "}
              por cada posición acertada (máx. 28 por grupo).
            </dd>
          </div>
          <div>
            <dt className="font-black text-app-text">Exactos</dt>
            <dd className="m-0">
              Cantidad de resultados exactos en cruces más posiciones de grupo acertadas.
            </dd>
          </div>
          <div>
            <dt className="font-black text-app-text">Aciertos</dt>
            <dd className="m-0">
              Cruces donde acertaste el ganador o el empate (incluye los exactos).
            </dd>
          </div>
        </dl>
      </PopoverContent>
    </Popover>
  );
}

const medalByRank: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
const avatarToneByRank: Record<number, string> = {
  1: "bg-app-amber text-app-bg",
  2: "bg-app-muted text-app-bg",
  3: "bg-app-amber/60 text-app-bg",
};

function Podium({ rows, currentUserId, showChampion }: { rows: LeaderboardRow[]; currentUserId: string; showChampion: boolean }) {
  const ordered = podiumOrder(rows);
  return (
    <div className="mt-4 grid grid-cols-3 items-end gap-2 sm:gap-3">
      {ordered.map((row) => (
        <PodiumSpot key={row.user.id} row={row} isMe={row.user.id === currentUserId} isChampion={showChampion && row.rank === 1} />
      ))}
    </div>
  );
}

function PodiumSpot({ row, isMe, isChampion }: { row: LeaderboardRow; isMe: boolean; isChampion?: boolean }) {
  return (
    <div
      className={cn(
        "grid justify-items-center gap-1 rounded-xl border border-app-line bg-app-surface px-2 py-3 text-center",
        row.rank === 1 && "border-app-amber/50 bg-app-amber/5 pt-5",
        row.rank === 2 && "pt-4",
        isChampion && "border-app-amber shadow-app-card ring-2 ring-app-amber/40",
        isMe && "ring-2 ring-app-brand",
      )}
    >
      {isChampion && <Crown className="size-5 text-app-amber" aria-hidden="true" />}
      <span className="text-xl leading-none">{medalByRank[row.rank] ?? "•"}</span>
      <span className={cn("grid size-9 place-items-center rounded-full text-sm font-black", avatarToneByRank[row.rank] ?? "bg-app-muted text-app-bg")}>
        {getInitials(row.user.displayName)}
      </span>
      <strong className="mt-1 max-w-full truncate text-sm font-black">{row.user.displayName}</strong>
      {isChampion && (
        <span className="rounded-full bg-app-amber px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-app-bg">
          Campeón
        </span>
      )}
      <em className="text-lg font-black not-italic text-app-green">{row.points}</em>
      <small className="text-xs font-bold text-app-muted">
        {row.exactHits} ex · {row.outcomeHits} ac
      </small>
    </div>
  );
}

function StandingsTable({ rows, currentUserId }: { rows: LeaderboardRow[]; currentUserId: string }) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-app-line bg-app-surface">
      <Table>
        <TableHeader className="bg-app-surface-2 [&_th]:h-9 [&_th]:text-[0.7rem] [&_th]:font-black [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-app-muted">
          <TableRow className="border-b-2 border-app-line hover:bg-transparent">
            <TableHead className="w-12">#</TableHead>
            <TableHead>Participante</TableHead>
            <TableHead className="text-right">Puntos</TableHead>
            <TableHead className="text-right max-sm:hidden">Exactos</TableHead>
            <TableHead className="text-right max-sm:hidden">Aciertos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isMe = row.user.id === currentUserId;
            return (
              <TableRow key={row.user.id} className={cn(isMe && "bg-app-surface-2")}>
                <TableCell
                  className={cn(
                    "font-black text-app-muted",
                    isMe && "shadow-[inset_3px_0_0_var(--color-app-brand)]",
                  )}
                >
                  {row.rank}
                </TableCell>
                <TableCell>
                  <strong className="block max-w-full truncate font-black">{row.user.displayName}</strong>
                  <span className="block text-xs font-bold text-app-muted sm:hidden">
                    {row.exactHits} ex · {row.outcomeHits} ac
                  </span>
                </TableCell>
                <TableCell className="text-right text-base font-black text-app-green">{row.points}</TableCell>
                <TableCell className="text-right max-sm:hidden">{row.exactHits}</TableCell>
                <TableCell className="text-right max-sm:hidden">{row.outcomeHits}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
