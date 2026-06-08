"use client";

import { useMemo } from "react";

import { Card } from "@/components/ui/card";
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
  const { predictions, profiles } = useApp();
  const rows = useMemo(() => getLeaderboard(predictions, profiles), [predictions, profiles]);

  return (
    <Card className={cn(ui.panel, "p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-lg font-black">Tabla general</h2>
        <Tabs>
          <TabsList className="max-w-full gap-1.5 overflow-x-auto rounded-xl border border-app-line bg-app-panel p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {stageOrder.map((stage) => (
              <TabsTrigger
                key={stage}
                value={stage}
                className="h-9 min-w-24 rounded-lg px-4 text-sm font-extrabold text-app-muted data-active:bg-app-surface data-active:text-app-text data-active:shadow-sm"
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
