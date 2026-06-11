/** Up to two initials from a display name, uppercased. Falls back to "?" when blank. */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

/**
 * Visual left-to-right order for a podium: second, first, third (so first place
 * sits in the raised center). Arrays with fewer than three entries are unchanged.
 */
export function podiumOrder<T>(rows: T[]): T[] {
  if (rows.length === 3) return [rows[1]!, rows[0]!, rows[2]!];
  return rows;
}
