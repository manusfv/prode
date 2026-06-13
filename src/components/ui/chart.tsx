"use client";

import { ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

// App-token-derived palette for series. Recharts needs concrete colors, so we
// reference the CSS variables the theme already defines.
export const chartColors = {
  brand: "var(--color-app-brand)",
  green: "var(--color-app-green)",
  amber: "var(--color-app-amber)",
  blue: "var(--color-app-blue)",
  muted: "var(--color-app-muted)",
  line: "var(--color-app-line)",
  surface: "var(--color-app-surface-2)",
  text: "var(--color-app-text)",
} as const;

export function ChartContainer({
  height = 240,
  minWidth,
  className,
  children,
}: {
  height?: number;
  minWidth?: number;
  className?: string;
  children: React.ReactElement;
}) {
  // minWidth lets wide charts (heatmap / matrix / line-over-rounds) scroll
  // horizontally inside a narrow drawer instead of squishing.
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <div style={{ minWidth, height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
