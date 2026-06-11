"use client";

import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { stageLabels, stageOrder } from "@/lib/tournament";
import type { Stage } from "@/lib/types";
import { ui } from "@/lib/ui-tokens";
import { getInitials, getLeaderboard, getStageLeaderboard, podiumOrder, type LeaderboardRow } from "@/lib/standings";
import { cn } from "@/lib/utils";

import { useApp } from "@/components/app-context";

type StandingsView = "overall" | Stage;

export function LeaderboardScreen() {
  const { predictions, profiles, groupPredictions, matches, standingsStages, currentUser } = useApp();
  const [view, setView] = useState<StandingsView>("overall");

  // If the selected stage stops being revealed (admin toggled it off), fall back
  // to the accumulated view so a hidden stage's standings aren't shown.
  useEffect(() => {
    if (view !== "overall" && !standingsStages.has(view)) {
      setView("overall");
    }
  }, [view, standingsStages]);

  const rows = useMemo(() => {
    if (view === "overall") {
      return getLeaderboard({ predictions, profiles, groupPredictions, matches, standingsStages });
    }
    return getStageLeaderboard(view, { predictions, profiles, groupPredictions, matches });
  }, [view, predictions, profiles, groupPredictions, matches, standingsStages]);

  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  const viewLabel = view === "overall" ? "Acumulado" : stageLabels[view];

  return (
    <Card className={cn(ui.panel, "p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-lg font-black">Tabla general</h2>
        <Select value={view} onValueChange={(value) => setView(value as StandingsView)}>
          <SelectTrigger className={cn(ui.control, "w-full sm:hidden")} aria-label="Vista">
            <span className={ui.label}>Vista</span>
            <SelectValue className={ui.controlValue}>{viewLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="overall">Acumulado</SelectItem>
            <SelectSeparator />
            {stageOrder.map((stage) => (
              <SelectItem key={stage} value={stage} disabled={!standingsStages.has(stage)}>
                {stageLabels[stage]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tabs value={view} onValueChange={(value) => setView(value as StandingsView)} className="hidden min-w-0 sm:block">
          <TabsList className="flex !h-auto w-full min-w-0 max-w-full flex-wrap gap-1.5 rounded-xl border border-app-line bg-app-panel p-1.5">
            <TabsTrigger
              value="overall"
              className="!h-9 shrink-0 rounded-md px-2 text-xs font-extrabold text-app-muted hover:text-app-text data-active:bg-app-brand data-active:text-app-brand-fg data-active:shadow-sm sm:px-4 sm:text-sm"
            >
              Acumulado
            </TabsTrigger>
            <span aria-hidden="true" className="mx-0.5 my-0.5 w-px self-stretch bg-app-line" />
            {stageOrder.map((stage) => (
              <TabsTrigger
                key={stage}
                value={stage}
                disabled={!standingsStages.has(stage)}
                className="!h-9 shrink-0 rounded-md px-2 text-xs font-extrabold text-app-muted hover:text-app-text data-active:bg-app-brand data-active:text-app-brand-fg data-active:shadow-sm disabled:opacity-40 disabled:hover:text-app-muted sm:px-4 sm:text-sm"
              >
                {stageLabels[stage]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {podium.length > 0 && <Podium rows={podium} currentUserId={currentUser.id} />}
      {rest.length > 0 && <StandingsTable rows={rest} currentUserId={currentUser.id} />}
      {rows.length === 0 && (
        <p className="mt-4 rounded-lg border border-app-line bg-app-surface px-3 py-6 text-center text-sm font-bold text-app-muted">
          Todavía no hay participantes en la tabla.
        </p>
      )}
    </Card>
  );
}

const medalByRank: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
const avatarToneByRank: Record<number, string> = {
  1: "bg-app-amber text-app-bg",
  2: "bg-app-muted text-app-bg",
  3: "bg-app-amber/60 text-app-bg",
};

function Podium({ rows, currentUserId }: { rows: LeaderboardRow[]; currentUserId: string }) {
  const ordered = podiumOrder(rows);
  return (
    <div className="mt-4 grid grid-cols-3 items-end gap-2 sm:gap-3">
      {ordered.map((row) => (
        <PodiumSpot key={row.user.id} row={row} isMe={row.user.id === currentUserId} />
      ))}
    </div>
  );
}

function PodiumSpot({ row, isMe }: { row: LeaderboardRow; isMe: boolean }) {
  return (
    <div
      className={cn(
        "grid justify-items-center gap-1 rounded-xl border border-app-line bg-app-surface px-2 py-3 text-center",
        row.rank === 1 && "border-app-amber/50 bg-app-amber/5 pt-5",
        row.rank === 2 && "pt-4",
        isMe && "ring-2 ring-app-brand",
      )}
    >
      <span className="text-xl leading-none">{medalByRank[row.rank] ?? "•"}</span>
      <span className={cn("grid size-9 place-items-center rounded-full text-sm font-black", avatarToneByRank[row.rank] ?? "bg-app-muted text-app-bg")}>
        {getInitials(row.user.displayName)}
      </span>
      <strong className="mt-1 max-w-full truncate text-sm font-black">{row.user.displayName}</strong>
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
        <TableHeader>
          <TableRow>
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
