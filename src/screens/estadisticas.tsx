"use client";

import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { useApp } from "@/components/app-context";
import { BarStat, Histogram, LineStat, MatchSplit, SimilarityGrid, StackedAccuracy, TeamThermometer } from "@/components/stats/charts";
import { chartColors } from "@/components/ui/chart";
import { BreakdownTable, FactCard, StatDrawer } from "@/components/stats/fact-card";
import { computeStats, predictedOutcome, type Fact, type FactCategory } from "@/lib/stats";
import { getTeamLabel } from "@/lib/tournament";
import { ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

// Distinct line colors for the points race (one per person).
const RACE_PALETTE = [
  chartColors.green, chartColors.blue, chartColors.amber, chartColors.brand,
  "#a855f7", "#ec4899", "#14b8a6", "#ef4444",
];

const CATEGORY_LABELS: Record<FactCategory, string> = {
  optimismo: "Optimismo y goles",
  manada: "Manada vs. rebelde",
  punteria: "Puntería y rachas",
  fidelidad: "Fidelidad de equipo",
  comportamiento: "Comportamiento",
};
const CATEGORY_ORDER: FactCategory[] = ["optimismo", "manada", "punteria", "fidelidad", "comportamiento"];

export function EstadisticasScreen() {
  const { profiles, predictions, groupPredictions, matches, groups, teams, currentUser, standingsStages, now } = useApp();
  const [activeFact, setActiveFact] = useState<Fact | null>(null);

  const bundle = useMemo(
    () => computeStats({
      profiles, predictions, groupPredictions, matches, groups, teams,
      currentUserId: currentUser.id, standingsStages, now,
    }),
    [profiles, predictions, groupPredictions, matches, groups, teams, currentUser.id, standingsStages, now],
  );

  const factsByCategory = useMemo(() => {
    const map = new Map<FactCategory, Fact[]>();
    for (const fact of bundle.facts) {
      const list = map.get(fact.category) ?? [];
      list.push(fact);
      map.set(fact.category, list);
    }
    return map;
  }, [bundle.facts]);

  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);

  function renderChart(fact: Fact) {
    if (fact.chartKind === "bar") {
      return <BarStat series={fact.series} suffix={fact.unitSuffix} highlightId={fact.winner?.user.id} />;
    }
    if (fact.chartKind === "thermometer") return <TeamThermometer teams={fact.teamSeries ?? bundle.termometro} />;
    if (fact.chartKind === "matchSplit") {
      const matchId = fact.id === "trampa" ? bundle.trampaMatchId : bundle.dividedMatchId;
      const match = matchId ? matchById.get(matchId) : undefined;
      if (!match) return null;
      const forMatch = predictions.filter((p) => p.matchId === match.id);
      const tally = { home: 0, draw: 0, away: 0 };
      for (const p of forMatch) tally[predictedOutcome(p.homeScore, p.awayScore)] += 1;
      return (
        <MatchSplit
          home={tally.home} draw={tally.draw} away={tally.away}
          labels={{ home: getTeamLabel(match.homeTeamId, teams, match.homeSeed), away: getTeamLabel(match.awayTeamId, teams, match.awaySeed) }}
        />
      );
    }
    return null;
  }

  const raceSeries = bundle.pointsRace.keys.map((key, i) => ({ key, color: RACE_PALETTE[i % RACE_PALETTE.length]! }));

  return (
    <div className="grid gap-4">
      <HeroRow bundle={bundle} />
      <PersonalCardView card={bundle.personal} userName={currentUser.displayName} />

      <section className="grid gap-2.5">
        <h2 className={cn(ui.label, "text-sm")}>Gráficos</h2>
        <div className="grid gap-2.5 lg:grid-cols-2">
          <Card className={cn(ui.panel, "p-4 lg:col-span-2")}>
            <h3 className="m-0 text-sm font-black">La carrera</h3>
            <p className="mb-3 text-xs font-bold text-app-muted">Puntos acumulados por fecha</p>
            {bundle.pointsRace.data.length > 0
              ? <LineStat data={bundle.pointsRace.data} series={raceSeries} />
              : <p className="text-sm font-bold text-app-muted">Se revela a medida que se cargan los resultados.</p>}
          </Card>
          <Card className={cn(ui.panel, "p-4")}>
            <h3 className="m-0 text-sm font-black">Tabla de puntos</h3>
            <p className="mb-3 text-xs font-bold text-app-muted">Puntaje total acumulado de cada uno</p>
            {bundle.pointsTotals.some((p) => p.value > 0)
              ? <BarStat series={bundle.pointsTotals} suffix="pts" highlightId={currentUser.id} />
              : <p className="text-sm font-bold text-app-muted">Se revela a medida que se cargan los resultados.</p>}
          </Card>
          <Card className={cn(ui.panel, "p-4")}>
            <h3 className="m-0 text-sm font-black">¿Quién piensa igual?</h3>
            <p className="mb-3 text-xs font-bold text-app-muted">Coincidencia de pronósticos entre la familia</p>
            {bundle.hero.predictionsLoaded > 0
              ? <SimilarityGrid matrix={bundle.similarity} />
              : <p className="text-sm font-bold text-app-muted">Se revela cuando se cierra el pronóstico de un partido.</p>}
          </Card>
          <Card className={cn(ui.panel, "p-4")}>
            <h3 className="m-0 text-sm font-black">Termómetro de favoritos</h3>
            <p className="mb-3 text-xs font-bold text-app-muted">Equipos bancados para salir 1º de grupo</p>
            {bundle.termometro.length > 0
              ? <TeamThermometer teams={bundle.termometro} />
              : <p className="text-sm font-bold text-app-muted">Se muestra a medida que cierran los grupos.</p>}
          </Card>
          <Card className={cn(ui.panel, "p-4")}>
            <h3 className="m-0 text-sm font-black">Scoreline favorito</h3>
            <p className="mb-3 text-xs font-bold text-app-muted">Resultados más pronosticados</p>
            {bundle.scoreline.total > 0
              ? <Histogram bins={bundle.scoreline.bins} />
              : <p className="text-sm font-bold text-app-muted">Se revela cuando se cierra el pronóstico de un partido.</p>}
          </Card>
          <Card className={cn(ui.panel, "p-4")}>
            <h3 className="m-0 text-sm font-black">Margen de goles</h3>
            <p className="mb-3 text-xs font-bold text-app-muted">Diferencia de gol más pronosticada</p>
            {bundle.goalMargin.total > 0
              ? <Histogram bins={bundle.goalMargin.bins} />
              : <p className="text-sm font-bold text-app-muted">Se revela cuando se cierra el pronóstico de un partido.</p>}
          </Card>
          <Card className={cn(ui.panel, "p-4")}>
            <h3 className="m-0 text-sm font-black">Participación</h3>
            <p className="mb-3 text-xs font-bold text-app-muted">Pronósticos cargados de {bundle.participation.total} partidos jugados</p>
            {bundle.participation.total > 0
              ? <BarStat series={bundle.participation.rows} highlightId={currentUser.id} />
              : <p className="text-sm font-bold text-app-muted">Se revela cuando se cierra el pronóstico de un partido.</p>}
          </Card>
          <Card className={cn(ui.panel, "p-4 lg:col-span-2")}>
            <h3 className="m-0 text-sm font-black">Distribución de aciertos</h3>
            <p className="mb-3 text-xs font-bold text-app-muted">Exactos, aciertos de resultado y errados por persona</p>
            {bundle.accuracyBreakdown.length > 0
              ? <StackedAccuracy rows={bundle.accuracyBreakdown} />
              : <p className="text-sm font-bold text-app-muted">Se revela a medida que se cargan los resultados.</p>}
          </Card>
        </div>
      </section>

      {CATEGORY_ORDER.map((category) => {
        const facts = factsByCategory.get(category) ?? [];
        if (facts.length === 0) return null;
        return (
          <section key={category} className="grid gap-2.5">
            <h2 className={cn(ui.label, "text-sm")}>{CATEGORY_LABELS[category]}</h2>
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {facts.map((fact) => <FactCard key={fact.id} fact={fact} onOpen={setActiveFact} />)}
            </div>
          </section>
        );
      })}

      <StatDrawer fact={activeFact} onClose={() => setActiveFact(null)}>
        {activeFact && (
          <>
            {renderChart(activeFact)}
            <BreakdownTable fact={activeFact} />
          </>
        )}
      </StatDrawer>
    </div>
  );
}

function HeroRow({ bundle }: { bundle: ReturnType<typeof computeStats> }) {
  const items = [
    { label: "Goles soñados", value: String(bundle.hero.goalsDreamed) },
    { label: "Pronósticos revelados", value: String(bundle.hero.predictionsLoaded) },
    { label: "% exactos del grupo", value: `${bundle.hero.groupExactPct}%` },
  ];
  return (
    <Card className={cn(ui.panel, "grid grid-cols-3 gap-2 p-2.5")}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0 rounded-lg border border-app-line bg-app-surface px-2.5 py-2">
          <span className={ui.label}>{it.label}</span>
          <strong className="mt-1 block text-lg font-black leading-none text-app-green">{it.value}</strong>
        </div>
      ))}
    </Card>
  );
}

function PersonalCardView({ card, userName }: { card: ReturnType<typeof computeStats>["personal"]; userName: string }) {
  if (!card.hasData) {
    return (
      <Card className={cn(ui.panel, "p-4")}>
        <h2 className="m-0 text-base font-black">Tus stats, {userName}</h2>
        <p className="mt-1 text-sm font-bold text-app-muted">Todavía no cargaste pronósticos. ¡Andá a la pestaña Pronósticos!</p>
      </Card>
    );
  }
  const stats = [
    { label: "Tu scoreline favorito", value: card.favoriteScoreline ?? "—" },
    { label: "Tus goles/partido", value: card.avgGoals != null ? String(card.avgGoals) : "—" },
    { label: "Promedio del grupo", value: card.groupAvgGoals != null ? String(card.groupAvgGoals) : "—" },
    { label: "Tus exactos", value: card.exactPct != null ? `${card.exactPct}%` : "Sin resultados" },
  ];
  return (
    <Card className={cn(ui.panel, "p-4")}>
      <h2 className="m-0 text-base font-black">Tus stats, {userName}</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-app-line bg-app-surface px-2.5 py-2">
            <span className={ui.label}>{s.label}</span>
            <strong className="mt-1 block text-base font-black leading-none">{s.value}</strong>
          </div>
        ))}
      </div>
      {card.groupChampions && (
        <div className="mt-2 rounded-lg border border-app-line bg-app-surface px-2.5 py-2">
          <span className={ui.label}>Tus cabezas de grupo ({card.groupsPicked})</span>
          <strong className="mt-1 block text-lg font-black leading-none tracking-wide">{card.groupChampions}</strong>
        </div>
      )}
    </Card>
  );
}
