"use client";

import { ChevronRight, Lock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";
import type { Fact } from "@/lib/stats";

// "A" · "A y B" · "A, B y 1 más" · "A, B y 2 más" …
function formatNames(names: string[]): string {
  if (names.length <= 2) return names.join(" y ");
  return `${names.slice(0, 2).join(", ")} y ${names.length - 2} más`;
}

export function FactCard({ fact, onOpen }: { fact: Fact; onOpen: (fact: Fact) => void }) {
  const tieNames = fact.coWinners.map((c) => c.user.displayName);
  const winnerLabel = fact.winnerSummary ?? fact.winner?.displayValue ?? formatNames(tieNames);
  const winnerName = fact.headline
    ?? (tieNames.length ? formatNames(tieNames) : fact.winner?.user.displayName);

  if (!fact.available) {
    return (
      <Card className={cn(ui.panel, "flex flex-row items-start gap-3 p-3.5 opacity-60")}>
        <span className="text-2xl leading-none grayscale">{fact.emoji}</span>
        <div className="min-w-0">
          <h3 className="m-0 truncate text-sm font-black">{fact.title}</h3>
          <p className="mt-1 flex items-center gap-1 text-xs font-bold text-app-muted">
            <Lock size={12} /> {fact.unavailableHint}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(fact)}
      className={cn(ui.panel, "flex w-full items-center gap-3 p-3.5 text-left hover:bg-app-surface-2")}
    >
      <span className="text-2xl leading-none">{fact.emoji}</span>
      <div className="min-w-0 flex-1">
        <h3 className="m-0 truncate text-sm font-black">{fact.title}</h3>
        {winnerName && <strong className="block truncate text-app-green">{winnerName}</strong>}
        <small className="block truncate text-xs font-bold text-app-muted">{winnerLabel}</small>
      </div>
      <ChevronRight size={18} className="shrink-0 text-app-muted" />
    </button>
  );
}

export function StatDrawer({
  fact,
  onClose,
  children,
}: {
  fact: Fact | null;
  onClose: () => void;
  children?: React.ReactNode; // the chart + breakdown rendered by the screen
}) {
  const open = Boolean(fact);
  const body = fact && (
    <>
      <SheetHeader className="shrink-0">
        <p className="text-xs font-extrabold uppercase leading-none text-app-muted">{fact.emoji} Estadística</p>
        <SheetTitle className="mt-1 text-xl font-black text-app-text">{fact.title}</SheetTitle>
        <p className="text-sm font-bold text-app-muted">{fact.blurb}</p>
      </SheetHeader>
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 pb-6">{children}</div>
    </>
  );

  return (
    <>
      {/* Mobile: bottom sheet, full width */}
      <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-hidden sm:hidden" overlayClassName="sm:hidden">{body}</SheetContent>
      </Sheet>
      {/* Desktop: right drawer, widened */}
      <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent side="right" className="hidden sm:flex sm:!max-w-lg" overlayClassName="hidden sm:block">{body}</SheetContent>
      </Sheet>
    </>
  );
}

export function BreakdownTable({ fact }: { fact: Fact }) {
  if (fact.series.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-app-line bg-app-surface">
      {fact.series.map((s, i) => (
        <div key={s.user.id} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-app-line px-3 py-2 last:border-0">
          <span className="font-black text-app-muted">#{i + 1}</span>
          <strong className="truncate text-sm font-black">{s.user.displayName}</strong>
          <em className="text-sm font-black not-italic text-app-green">{s.displayValue}</em>
        </div>
      ))}
    </div>
  );
}
