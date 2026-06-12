"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/components/app-context";
import { computeStats } from "@/lib/stats";
import { ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

export function StatsTeaser() {
  const router = useRouter();
  const { profiles, predictions, groupPredictions, matches, groups, teams, currentUser, standingsStages, now } = useApp();

  const fact = useMemo(() => {
    const bundle = computeStats({
      profiles, predictions, groupPredictions, matches, groups, teams,
      currentUserId: currentUser.id, standingsStages, now,
    });
    return bundle.facts.find((f) => f.available && f.winner);
  }, [profiles, predictions, groupPredictions, matches, groups, teams, currentUser.id, standingsStages, now]);

  if (!fact) return null;

  return (
    <Card className={cn(ui.panel, "p-4")}>
      <Button variant="ghost" className="flex w-full items-center justify-between gap-3 p-0 text-left hover:bg-transparent" onClick={() => router.push("/estadisticas")}>
        <h2 className="m-0 flex items-center gap-1.5 text-base font-black leading-tight"><BarChart3 size={16} /> Estadísticas</h2>
        <ChevronRight size={18} />
      </Button>
      <div className="mt-2.5 rounded-md bg-app-surface-2 px-3 py-2.5">
        <p className="m-0 flex items-center gap-1.5 text-sm font-black">{fact.emoji} {fact.title}</p>
        <strong className="block truncate text-app-green">{fact.headline ?? fact.winner!.user.displayName}</strong>
        <small className="block truncate text-xs font-bold text-app-muted">{fact.winner!.displayValue}</small>
      </div>
    </Card>
  );
}
