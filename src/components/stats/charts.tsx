"use client";

import {
  Bar, BarChart, Cell, XAxis, YAxis, Tooltip, LabelList,
  Line, LineChart, CartesianGrid, Legend,
} from "recharts";

import { ChartContainer, chartColors } from "@/components/ui/chart";
import type { HistogramBin, PersonValue, SimilarityMatrix, TeamTally } from "@/lib/stats";

const tooltipStyle = {
  background: "var(--color-app-panel)",
  border: "1px solid var(--color-app-line)",
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 12,
  color: "var(--color-app-text)",
} as const;

/** Horizontal bars keep person names readable on narrow screens. */
export function BarStat({ series, suffix, highlightId }: { series: PersonValue[]; suffix?: string; highlightId?: string }) {
  const data = series.map((s) => ({ name: s.user.displayName, value: s.value, id: s.user.id }));
  return (
    <ChartContainer height={Math.max(160, data.length * 40)}>
      <BarChart layout="vertical" data={data} margin={{ left: 8, right: 24 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={90} tick={{ fill: chartColors.muted, fontSize: 12, fontWeight: 700 }} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: chartColors.surface }} formatter={(v: number) => [`${v}${suffix ? ` ${suffix}` : ""}`, ""]} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
          {data.map((d) => (
            <Cell key={d.id} fill={d.id === highlightId ? chartColors.brand : chartColors.green} />
          ))}
          <LabelList dataKey="value" position="right" fill={chartColors.text} fontSize={12} fontWeight={800} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export function Histogram({ bins }: { bins: HistogramBin[] }) {
  const data = bins.slice(0, 12).map((b) => ({ name: b.label, value: b.count }));
  return (
    <ChartContainer height={240} minWidth={Math.max(280, data.length * 48)}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 16 }}>
        <XAxis dataKey="name" tick={{ fill: chartColors.muted, fontSize: 11, fontWeight: 700 }} />
        <YAxis allowDecimals={false} tick={{ fill: chartColors.muted, fontSize: 11 }} width={28} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: chartColors.surface }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} fill={chartColors.brand}>
          <LabelList dataKey="value" position="top" fill={chartColors.text} fontSize={11} fontWeight={800} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export function TeamThermometer({ teams }: { teams: TeamTally[] }) {
  const data = teams.slice(0, 12).map((t) => ({ name: `${t.flag} ${t.name}`, value: t.count }));
  return (
    <ChartContainer height={Math.max(160, data.length * 38)}>
      <BarChart layout="vertical" data={data} margin={{ left: 8, right: 24 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={120} tick={{ fill: chartColors.muted, fontSize: 12, fontWeight: 700 }} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: chartColors.surface }} formatter={(v: number) => [`${v} votos`, ""]} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} fill={chartColors.amber}>
          <LabelList dataKey="value" position="right" fill={chartColors.text} fontSize={12} fontWeight={800} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** Color-graded grid: rows and columns are people; cell = % agreement. */
export function SimilarityGrid({ matrix }: { matrix: SimilarityMatrix }) {
  const { users, cells } = matrix;
  const value = (a: string, b: string) =>
    a === b ? 100 : cells.find((c) => c.aId === a && c.bId === b)?.value ?? 0;
  return (
    <div className="w-full overflow-x-auto">
      <table className="border-separate border-spacing-1 text-xs font-bold">
        <thead>
          <tr>
            <th />
            {users.map((u) => (
              <th key={u.id} className="px-1 text-app-muted">{u.displayName.slice(0, 3)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((row) => (
            <tr key={row.id}>
              <th className="pr-2 text-right text-app-muted">{row.displayName.slice(0, 3)}</th>
              {users.map((col) => {
                const v = value(row.id, col.id);
                return (
                  <td
                    key={col.id}
                    className="size-9 rounded-md text-center align-middle text-app-text"
                    style={{ background: `color-mix(in srgb, var(--color-app-green) ${v}%, var(--color-app-surface))` }}
                    title={`${row.displayName} vs ${col.displayName}: ${v}%`}
                  >
                    {row.id === col.id ? "—" : v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Outcome split for a single match: home / draw / away counts. */
export function MatchSplit({ home, draw, away, labels }: { home: number; draw: number; away: number; labels: { home: string; away: string } }) {
  const data = [
    { name: labels.home, value: home },
    { name: "Empate", value: draw },
    { name: labels.away, value: away },
  ];
  return (
    <ChartContainer height={200}>
      <BarChart data={data} margin={{ top: 16 }}>
        <XAxis dataKey="name" tick={{ fill: chartColors.muted, fontSize: 11, fontWeight: 700 }} />
        <YAxis allowDecimals={false} width={28} tick={{ fill: chartColors.muted, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: chartColors.surface }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} fill={chartColors.blue}>
          <LabelList dataKey="value" position="top" fill={chartColors.text} fontSize={12} fontWeight={800} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** Generic line chart for points/position over rounds. */
export function LineStat({ data, series }: { data: Array<Record<string, number | string>>; series: Array<{ key: string; color: string }> }) {
  return (
    <ChartContainer height={260} minWidth={Math.max(320, data.length * 70)}>
      <LineChart data={data} margin={{ left: 0, right: 12, top: 12 }}>
        <CartesianGrid stroke={chartColors.line} strokeDasharray="3 3" />
        <XAxis dataKey="stage" tick={{ fill: chartColors.muted, fontSize: 11, fontWeight: 700 }} />
        <YAxis tick={{ fill: chartColors.muted, fontSize: 11 }} width={28} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700, paddingTop: 8 }} />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
