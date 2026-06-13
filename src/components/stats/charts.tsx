"use client";

import {
  Bar, BarChart, Cell, XAxis, YAxis, Tooltip, LabelList,
  Line, LineChart, CartesianGrid, Legend,
} from "recharts";
import type { TooltipProps } from "recharts";

import { ChartContainer, chartColors } from "@/components/ui/chart";
import type { AccuracyBreakdownRow, DreamTableRow, HistogramBin, PersonValue, SimilarityMatrix, TeamTally } from "@/lib/stats";

const tooltipStyle = {
  background: "var(--color-app-panel)",
  border: "1px solid var(--color-app-line)",
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 12,
  color: "var(--color-app-text)",
} as const;

// Consistent bar coloring across every chart: leader(s) green, current user in
// the brand accent, everyone/everything else amber. Leader wins over "you".
function barFill(isLeader: boolean, isYou = false): string {
  if (isLeader) return chartColors.green;
  if (isYou) return chartColors.brand;
  return chartColors.amber;
}

// Appends a unit to a value label: "%" attaches directly (55%), words get a space (2.3 goles).
function unitLabel(value: number | string, unit?: string): string {
  if (!unit) return String(value);
  return unit === "%" ? `${value}%` : `${value} ${unit}`;
}

/** Two-line tooltip for the person bars: name on top, the stat's human detail below. */
function BarTooltip({ active, payload, suffix }: TooltipProps<number, string> & { suffix?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!.payload as { name: string; value: number; detail?: string };
  return (
    <div style={tooltipStyle} className="px-3 py-2 shadow-lg">
      <p className="text-sm font-black text-app-text">{row.name}</p>
      <p className="text-xs font-bold text-app-muted">
        {row.detail ?? `${row.value}${suffix ? ` ${suffix}` : ""}`}
      </p>
    </div>
  );
}

/**
 * Shared tooltip for every other chart. Single-series shows label + value;
 * multi-series lists each series with its color swatch so the text stays
 * high-contrast (white) instead of recharts' dim per-series coloring.
 */
function ChartTooltip({
  active, payload, label, formatValue,
}: TooltipProps<number, string> & { formatValue?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  const fmt = (v: unknown) => (formatValue ? formatValue(Number(v)) : String(v));
  const hasLabel = label !== undefined && label !== "";
  if (payload.length === 1) {
    return (
      <div style={tooltipStyle} className="px-3 py-2 shadow-lg">
        {hasLabel && <p className="text-sm font-black text-app-text">{label}</p>}
        <p className="text-xs font-bold text-app-muted">{fmt(payload[0]!.value)}</p>
      </div>
    );
  }
  return (
    <div style={tooltipStyle} className="px-3 py-2 shadow-lg">
      {hasLabel && <p className="mb-1 text-sm font-black text-app-text">{label}</p>}
      <div className="grid gap-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="size-2 shrink-0 rounded-full" style={{ background: entry.color }} />
            <span className="font-bold text-app-muted">{entry.name}</span>
            <span className="ml-auto pl-3 font-black text-app-text">{fmt(entry.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bars keep person names readable on narrow screens. */
export function BarStat({ series, suffix, highlightId }: { series: PersonValue[]; suffix?: string; highlightId?: string }) {
  const data = series.map((s) => ({ name: s.user.displayName, value: s.value, id: s.user.id, detail: s.displayValue }));
  const max = Math.max(0, ...data.map((d) => d.value));
  return (
    <ChartContainer height={Math.max(160, data.length * 40)}>
      <BarChart layout="vertical" data={data} margin={{ left: 8, right: suffix ? 52 : 24 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={90} tick={{ fill: chartColors.muted, fontSize: 12, fontWeight: 700 }} />
        <Tooltip cursor={{ fill: chartColors.surface }} content={<BarTooltip suffix={suffix} />} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
          {data.map((d) => (
            <Cell key={d.id} fill={barFill(d.value === max && max > 0, d.id === highlightId)} />
          ))}
          <LabelList dataKey="value" position="right" formatter={(v: number | string) => unitLabel(v, suffix)} fill={chartColors.text} fontSize={12} fontWeight={800} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export function Histogram({ bins, unit, detail }: { bins: HistogramBin[]; unit?: string; detail?: string }) {
  const max = Math.max(0, ...bins.map((b) => b.count));
  const data = bins.slice(0, 12).map((b) => ({ name: b.label, value: b.count, leader: b.count === max && max > 0 }));
  // The bar labels stay terse ("55%"); the hover tooltip can add a descriptor ("55% de desacuerdo").
  const tooltipValue = unit || detail
    ? (v: number) => `${unitLabel(v, unit)}${detail ? ` ${detail}` : ""}`
    : undefined;
  return (
    <ChartContainer height={240} minWidth={Math.max(280, data.length * 48)}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 16 }}>
        <XAxis dataKey="name" tick={{ fill: chartColors.muted, fontSize: 11, fontWeight: 700 }} />
        <YAxis allowDecimals={false} tick={{ fill: chartColors.muted, fontSize: 11 }} width={28} />
        <Tooltip cursor={{ fill: chartColors.surface }} content={<ChartTooltip formatValue={tooltipValue} />} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {data.map((d) => <Cell key={d.name} fill={barFill(d.leader)} />)}
          <LabelList dataKey="value" position="top" formatter={(v: number | string) => unitLabel(v, unit)} fill={chartColors.text} fontSize={11} fontWeight={800} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export function TeamThermometer({ teams, leaderIcon = "👑", unit = "votos" }: { teams: TeamTally[]; leaderIcon?: string; unit?: string }) {
  const max = Math.max(0, ...teams.map((t) => t.count));
  const data = teams.slice(0, 12).map((t) => {
    const leader = t.count === max && max > 0;
    return { name: `${leader ? `${leaderIcon} ` : ""}${t.flag} ${t.name}`, value: t.count, leader };
  });
  return (
    <ChartContainer height={Math.max(160, data.length * 38)}>
      <BarChart layout="vertical" data={data} margin={{ left: 8, right: unit ? 56 : 24 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={132} tick={{ fill: chartColors.muted, fontSize: 12, fontWeight: 700 }} />
        <Tooltip cursor={{ fill: chartColors.surface }} content={<ChartTooltip formatValue={(v) => unitLabel(v, unit)} />} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
          {data.map((d) => <Cell key={d.name} fill={barFill(d.leader)} />)}
          <LabelList dataKey="value" position="right" formatter={(v: number | string) => unitLabel(v, unit)} fill={chartColors.text} fontSize={12} fontWeight={800} />
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
  const max = Math.max(0, home, draw, away);
  return (
    <ChartContainer height={200}>
      <BarChart data={data} margin={{ top: 16 }}>
        <XAxis dataKey="name" tick={{ fill: chartColors.muted, fontSize: 11, fontWeight: 700 }} />
        <YAxis allowDecimals={false} width={28} tick={{ fill: chartColors.muted, fontSize: 11 }} />
        <Tooltip cursor={{ fill: chartColors.surface }} content={<ChartTooltip formatValue={(v) => `${v} ${v === 1 ? "pronóstico" : "pronósticos"}`} />} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {data.map((d) => <Cell key={d.name} fill={barFill(d.value === max && max > 0)} />)}
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
        <Tooltip content={<ChartTooltip formatValue={(v) => `${v} pts`} />} />
        <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700, paddingTop: 8 }} />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

/** Per-person stacked split of finalized predictions: exacto / resultado / errado. */
export function StackedAccuracy({ rows }: { rows: AccuracyBreakdownRow[] }) {
  const data = rows.map((r) => ({ name: r.user.displayName, exact: r.exact, outcome: r.outcome, miss: r.miss }));
  return (
    <ChartContainer height={Math.max(160, data.length * 40)}>
      <BarChart layout="vertical" data={data} margin={{ left: 8, right: 24 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={90} tick={{ fill: chartColors.muted, fontSize: 12, fontWeight: 700 }} />
        <Tooltip cursor={{ fill: chartColors.surface }} content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700, paddingTop: 8 }} />
        <Bar dataKey="exact" stackId="a" name="Exacto" fill={chartColors.green} radius={[6, 0, 0, 6]} />
        <Bar dataKey="outcome" stackId="a" name="Resultado" fill={chartColors.amber} />
        <Bar dataKey="miss" stackId="a" name="Errado" fill={chartColors.line} radius={[0, 6, 6, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

/** Board of each locked group's consensus 1st-place pick (La tabla soñada). */
export function ConsensusBoard({ rows }: { rows: DreamTableRow[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {rows.map((r) => (
        <div key={r.groupLabel} className="rounded-lg border border-app-line bg-app-surface px-2.5 py-2">
          <span className="text-[10px] font-black uppercase tracking-wide text-app-muted">Grupo {r.groupLabel}</span>
          <strong className="mt-1 block truncate text-sm font-black">{r.flag} {r.name}</strong>
          <small className="text-xs font-bold text-app-muted">{r.votes}/{r.total} votos</small>
        </div>
      ))}
    </div>
  );
}
