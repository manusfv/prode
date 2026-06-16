// Map a football-data.org team TLA to our team id. Our team ids are the FIFA
// TLAs lowercased (verified: all 32 played teams matched with zero exceptions).
// Add an entry here only if a real mismatch shows up in the unmatched log.
const TLA_OVERRIDES: Record<string, string> = {};

export function resolveTeamId(tla: string, knownIds: Set<string>): string | null {
  const id = TLA_OVERRIDES[tla] ?? tla.toLowerCase();
  return knownIds.has(id) ? id : null;
}
