// Festive fallbacks matching the amber/green/brand tokens (used if the CSS
// custom properties can't be read).
const FALLBACK_COLORS = ["#fbbf24", "#22c55e", "#818cf8"];

function tokenColors(): string[] {
  if (typeof window === "undefined") return FALLBACK_COLORS;
  const styles = getComputedStyle(document.documentElement);
  const colors = ["--amber", "--green", "--brand"]
    .map((name) => styles.getPropertyValue(name).trim())
    .filter(Boolean);
  return colors.length ? colors : FALLBACK_COLORS;
}

/** Fire a celebratory confetti burst. No-ops on the server or under reduced motion. */
export async function fireConfetti(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const confettiModule = await import("canvas-confetti");
  const confetti = (confettiModule as any).default;
  const colors = tokenColors();
  for (const x of [0.25, 0.5, 0.75]) {
    confetti({ particleCount: 60, spread: 70, startVelocity: 45, origin: { x, y: 0.6 }, colors });
  }
}
