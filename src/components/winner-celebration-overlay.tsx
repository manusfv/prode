"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { Crown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fireConfetti } from "@/lib/confetti";
import { getInitials, podiumOrder, type LeaderboardRow } from "@/lib/standings";
import { ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

// Reveal cadence (ms from open) for steps 1..4. Step 0 is the eyebrow build-up.
const STEP_DELAYS = [0, 1000, 2100, 3300, 4600];

const medalByRank: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

// Reveal steps: 0 eyebrow · 1 third · 2 second · 3 champion + confetti · 4 your rank + button.
export function WinnerCelebrationOverlay({
  open,
  onClose,
  onDismiss,
  rows,
  currentUserId,
}: {
  open: boolean;
  /** Primary action: dismiss and navigate to the tabla. */
  onClose: () => void;
  /** Dismiss and stay on the current page (X, Esc, backdrop). */
  onDismiss: () => void;
  rows: LeaderboardRow[];
  currentUserId: string;
}) {
  const [step, setStep] = useState(0);
  const reduced = useReducedMotion();
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  const dialogRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const podium = rows.slice(0, 3);
  const champion = rows[0];
  const me = rows.find((row) => row.user.id === currentUserId);

  // Drive the staged reveal while open. Reduced motion / short podium jumps to the end.
  useEffect(() => {
    if (!open) {
      setStep(0);
      return;
    }
    if (reduced || podium.length < 3) {
      setStep(4);
      return;
    }
    setStep(0);
    const timers = [1, 2, 3, 4].map((n) =>
      window.setTimeout(() => setStep(n), STEP_DELAYS[n]),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [open, reduced, podium.length]);

  // Fire confetti when the champion lands.
  useEffect(() => {
    if (open && step === 3) void fireConfetti();
  }, [open, step]);

  // Esc dismisses without navigating.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock background scroll + focus management (move focus in, restore on close).
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  // Pull focus to the primary action once it appears.
  useEffect(() => {
    if (open && step >= 4) buttonRef.current?.focus();
  }, [open, step]);

  // Minimal focus trap: keep Tab within the dialog.
  const onTrapKey = (event: React.KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables || focusables.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const ordered = podiumOrder(podium);

  return (
    <AnimatePresence>
      {open && champion && (
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Campeón del Prode"
          tabIndex={-1}
          onKeyDown={onTrapKey}
          onClick={(event) => {
            if (event.target === event.currentTarget) onDismiss();
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.4 }}
          className="fixed inset-0 z-50 grid place-items-center overflow-x-hidden overflow-y-auto bg-app-bg/85 p-6 outline-none backdrop-blur-lg"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cerrar"
            onClick={onDismiss}
            className="absolute right-4 top-4 text-app-muted hover:text-app-text"
          >
            <X />
          </Button>

          {/* Ambient radial glow: blooms in only once the champion is revealed. */}
          {!reduced && step >= 3 && (
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 size-80 max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-app-amber/15 blur-3xl"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 0.55, scale: [1, 1.06, 1] }}
              transition={{
                opacity: { duration: 1, ease: "easeOut" },
                scale: { duration: 4, repeat: Infinity, ease: "easeInOut" },
              }}
            />
          )}

          <motion.div
            layout={!reduced}
            transition={{ layout: { type: "spring", stiffness: 260, damping: 30 } }}
            className="relative flex w-full max-w-md flex-col items-center gap-7 text-center"
          >
            <motion.p
              className={cn(ui.label, "text-sm text-app-amber")}
              initial={{ opacity: 0, y: reduced ? 0 : -12, letterSpacing: "0.5em" }}
              animate={{ opacity: 1, y: 0, letterSpacing: "0.08em" }}
              transition={{ duration: reduced ? 0 : 0.6, ease: "easeOut" }}
            >
              El campeón del Prode 2026
            </motion.p>

            <div className="grid w-full grid-cols-3 items-end gap-3">
              {ordered.map((row) => (
                <CelebrationPodiumSpot
                  key={row.user.id}
                  row={row}
                  isChampion={row.rank === 1}
                  reduced={Boolean(reduced)}
                  revealed={
                    (row.rank === 3 && step >= 1) ||
                    (row.rank === 2 && step >= 2) ||
                    (row.rank === 1 && step >= 3)
                  }
                />
              ))}
            </div>

            <AnimatePresence>
              {step >= 4 && (
                <motion.div
                  key="outcome"
                  className="flex w-full flex-col items-center gap-4"
                  initial={{ opacity: 0, y: reduced ? 0 : 28, scale: reduced ? 1 : 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 220, damping: 20, delay: 0.15 }
                  }
                >
                  {me && (
                    <div className={cn(ui.panel, "w-full p-4")}>
                      <p className="text-sm font-bold text-app-muted">
                        {me.rank === 1 ? (
                          "¡Sos el campeón! 🏆"
                        ) : (
                          <>
                            Terminaste{" "}
                            <strong className="font-black text-app-text">#{me.rank}</strong> de{" "}
                            {rows.length}
                          </>
                        )}
                      </p>
                    </div>
                  )}
                  <Button ref={buttonRef} onClick={onClose} size="lg" className="h-11 px-10">
                    Ver tabla
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CelebrationPodiumSpot({
  row,
  isChampion,
  revealed,
  reduced,
}: {
  row: LeaderboardRow;
  isChampion: boolean;
  revealed: boolean;
  reduced: boolean;
}) {
  return (
    <motion.div
      className={cn(
        "relative flex flex-col items-center gap-1 rounded-xl border border-app-line bg-app-surface px-2 py-3",
        isChampion && "border-app-amber/60 bg-app-amber/10 py-5 shadow-app-card",
      )}
      initial={{ opacity: 0, y: reduced ? 0 : 48, scale: reduced ? 1 : 0.8 }}
      animate={
        revealed
          ? { opacity: 1, y: 0, scale: 1 }
          : { opacity: 0, y: reduced ? 0 : 48, scale: reduced ? 1 : 0.8 }
      }
      transition={
        reduced
          ? { duration: 0 }
          : isChampion
            ? { type: "spring", stiffness: 240, damping: 12 }
            : { type: "spring", stiffness: 260, damping: 18 }
      }
    >
      {/* Halo behind the champion: fades in on reveal, then breathes. */}
      {isChampion && revealed && !reduced && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 rounded-xl bg-app-amber/35 blur-xl"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: [1, 1.1, 1] }}
          transition={{
            opacity: { duration: 0.9, ease: "easeOut" },
            scale: { duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.6 },
          }}
        />
      )}

      {isChampion && (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: -24, rotate: -20 }}
          animate={revealed ? { opacity: 1, y: 0, rotate: 0 } : {}}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 10, delay: 0.1 }}
        >
          <Crown className="size-6 text-app-amber" aria-hidden="true" />
        </motion.div>
      )}

      <span className="text-lg leading-none" aria-hidden="true">
        {medalByRank[row.rank] ?? "•"}
      </span>
      <span
        className={cn(
          "grid place-items-center rounded-full font-black text-app-bg",
          isChampion ? "size-12" : "size-10",
          row.rank === 1 && "bg-app-amber",
          row.rank === 2 && "bg-app-muted",
          row.rank === 3 && "bg-app-amber/60",
        )}
      >
        {getInitials(row.user.displayName)}
      </span>
      <strong className="max-w-full truncate text-sm font-black">{row.user.displayName}</strong>
      <Counter
        value={row.points}
        active={revealed}
        reduced={reduced}
        className={cn("text-lg font-black text-app-green", isChampion && "text-xl")}
      />
    </motion.div>
  );
}

function Counter({
  value,
  active,
  reduced,
  className,
}: {
  value: number;
  active: boolean;
  reduced: boolean;
  className?: string;
}) {
  const [display, setDisplay] = useState(active && !reduced ? 0 : value);
  useEffect(() => {
    if (!active) return;
    if (reduced) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 1,
      ease: "easeOut",
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });
    return () => controls.stop();
  }, [active, value, reduced]);
  return <em className={cn("not-italic tabular-nums", className)}>{display}</em>;
}
