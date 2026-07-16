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

/**
 * Fire a celebratory confetti sequence: an opening burst, side cannons firing
 * inward, and a lingering finale wave. No-ops on the server or under reduced motion.
 */
export async function fireConfetti(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const { default: confetti } = await import("canvas-confetti");
  const colors = tokenColors();

  // Opening burst across the top.
  for (const x of [0.2, 0.5, 0.8]) {
    confetti({ particleCount: 70, spread: 75, startVelocity: 50, origin: { x, y: 0.55 }, colors });
  }

  // Side cannons firing inward from the lower corners.
  confetti({ particleCount: 80, angle: 60, spread: 72, startVelocity: 55, origin: { x: 0, y: 0.7 }, colors });
  confetti({ particleCount: 80, angle: 120, spread: 72, startVelocity: 55, origin: { x: 1, y: 0.7 }, colors });

  // A slower, wider finale wave that drifts down.
  window.setTimeout(() => {
    for (const x of [0.35, 0.65]) {
      confetti({ particleCount: 50, spread: 100, startVelocity: 38, decay: 0.92, scalar: 1.1, origin: { x, y: 0.4 }, colors });
    }
  }, 350);
}
