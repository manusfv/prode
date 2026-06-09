"use client";

import { useMemo } from "react";

import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { stageLabels, stageOrder } from "@/lib/tournament";
import { getLeaderboard, ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

import { useApp } from "@/components/app-context";

export function LeaderboardScreen() {
  const { predictions, profiles, groupPredictions } = useApp();
  const rows = useMemo(
    () => getLeaderboard(predictions, profiles, groupPredictions),
    [predictions, profiles, groupPredictions],
  );

  return (
    <Card className={cn(ui.panel, "p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-lg font-black">Tabla general</h2>
        <Select defaultValue={stageOrder[0]}>
          <SelectTrigger className={cn(ui.control, "w-full sm:hidden")} aria-label="Etapa">
            <span className={ui.label}>Etapa</span>
            <SelectValue className={ui.controlValue}>{stageLabels[stageOrder[0]]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {stageOrder.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {stageLabels[stage]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tabs className="hidden min-w-0 sm:block">
          <TabsList className="flex !h-auto w-full min-w-0 max-w-full flex-wrap gap-1.5 rounded-xl border border-app-line bg-app-panel p-1.5">
            {stageOrder.map((stage) => (
              <TabsTrigger
                key={stage}
                value={stage}
                className="!h-9 shrink-0 rounded-md px-2 text-xs font-extrabold text-app-muted hover:text-app-text data-active:bg-app-brand data-active:text-app-brand-fg data-active:shadow-sm sm:px-4 sm:text-sm"
              >
                {stageLabels[stage]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div className="mt-3 overflow-x-auto rounded-lg border border-app-line bg-app-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Puesto</TableHead>
              <TableHead>Participante</TableHead>
              <TableHead>Puntos</TableHead>
              <TableHead>Exactos</TableHead>
              <TableHead>Aciertos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.user.id} className="leaderboard-row">
                <TableCell className="rank">#{row.rank}</TableCell>
                <TableCell><strong>{row.user.displayName}</strong></TableCell>
                <TableCell>{row.points}</TableCell>
                <TableCell>{row.exactHits}</TableCell>
                <TableCell>{row.outcomeHits}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
