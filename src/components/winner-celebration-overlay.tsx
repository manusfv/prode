"use client";

import { useEffect, useRef, useState } from "react";
import { Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fireConfetti } from "@/lib/confetti";
import { getInitials, podiumOrder, type LeaderboardRow } from "@/lib/standings";
import { ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

const STEP_MS = 1100;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}

// Reveal steps: 0 eyebrow · 1 third · 2 second · 3 champion+confetti · 4 your rank + button.
export function WinnerCelebrationOverlay({
  open,
  onClose,
  rows,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  rows: LeaderboardRow[];
  currentUserId: string;
}) {
  const [step, setStep] = useState(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const podium = rows.slice(0, 3);
  const champion = rows[0];
  const me = rows.find((row) => row.user.id === currentUserId);

  // Drive the staged reveal while open. Reduced motion / short podium jumps to the end.
  useEffect(() => {
    if (!open) {
      setStep(0);
      return;
    }
    if (prefersReducedMotion() || podium.length < 3) {
      setStep(4);
      return;
    }
    setStep(0);
    const timers = [1, 2, 3, 4].map((n) => window.setTimeout(() => setStep(n), STEP_MS * n));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [open, podium.length]);

  // Fire confetti when the champion lands.
  useEffect(() => {
    if (open && step >= 3) void fireConfetti();
  }, [open, step]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || !champion) return null;

  const ordered = podiumOrder(podium);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Campeón del Prode"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-app-bg/80 p-6 backdrop-blur-md"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <p className={cn(ui.label, "text-sm text-app-amber")}>Campeón del Prode 2026</p>

        <div className="grid w-full grid-cols-3 items-end gap-3">
          {ordered.map((row) => (
            <CelebrationPodiumSpot
              key={row.user.id}
              row={row}
              isChampion={row.rank === 1}
              revealed={
                (row.rank === 3 && step >= 1) ||
                (row.rank === 2 && step >= 2) ||
                (row.rank === 1 && step >= 3)
              }
            />
          ))}
        </div>

        {step >= 4 && me && (
          <div className={cn(ui.panel, "w-full p-4")}>
            <p className="text-sm font-bold text-app-muted">
              {me.rank === 1 ? (
                "¡Sos el campeón! 🏆"
              ) : (
                <>
                  Terminaste <strong className="font-black text-app-text">#{me.rank}</strong> de {rows.length}
                </>
              )}
            </p>
          </div>
        )}

        {step >= 4 && <Button onClick={onClose}>Ver tabla</Button>}
      </div>
    </div>
  );
}

function CelebrationPodiumSpot({
  row,
  isChampion,
  revealed,
}: {
  row: LeaderboardRow;
  isChampion: boolean;
  revealed: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border border-app-line bg-app-surface px-2 py-3 transition-all duration-500",
        isChampion && "border-app-amber/60 bg-app-amber/10 py-5 shadow-app-card",
        revealed ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
      )}
    >
      {isChampion && <Trophy className="size-6 text-app-amber" aria-hidden="true" />}
      <span
        className={cn(
          "grid place-items-center rounded-full font-black",
          isChampion ? "size-12 bg-app-amber text-app-bg" : "size-10 bg-app-muted text-app-bg",
        )}
      >
        {getInitials(row.user.displayName)}
      </span>
      <strong className="max-w-full truncate text-sm font-black">{row.user.displayName}</strong>
      <CountUp
        value={row.points}
        run={revealed && isChampion}
        className="text-lg font-black text-app-green"
      />
    </div>
  );
}

function CountUp({ value, run, className }: { value: number; run: boolean; className?: string }) {
  const [display, setDisplay] = useState(run ? 0 : value);
  useEffect(() => {
    if (!run || prefersReducedMotion()) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const duration = 800;
    const tick = (t: number) => {
      const progress = Math.min(1, (t - start) / duration);
      setDisplay(Math.round(value * progress));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, value]);
  return <em className={cn("not-italic", className)}>{display}</em>;
}
