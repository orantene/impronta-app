/**
 * Deterministic placeholder portrait for a discoverable talent that has not
 * uploaded a real card photo yet.
 *
 * Hashes a stable key (the talent id) to one of pravatar.cc's 70 stock
 * portraits, so the same person always shows the same face across loads,
 * pages, and the directory grid / list / map surfaces — never an
 * initials-in-a-box, which reads as "unfinished" (the directory's #1
 * acceptance blocker).
 *
 * Fallback only: every call site prefers a real Supabase media_asset and uses
 * this solely when none exists. Seed imagery is prototype-grade — once talent
 * upload their own card photo it always wins. Any other discoverable surface
 * that needs placeholder imagery should reuse this so it stays consistent.
 *
 * pravatar.cc is allow-listed in next.config.ts (images.remotePatterns); the
 * directory cards render via a plain <img>, so no optimizer hop is needed.
 */
const PRAVATAR_COUNT = 70;

export function deterministicSeedPhoto(key: string): string {
  // FNV-1a-style 32-bit string hash — stable and well-distributed across the
  // 70 portraits, so visually-adjacent ids don't collapse onto the same face.
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const img = (Math.abs(h) % PRAVATAR_COUNT) + 1;
  return `https://i.pravatar.cc/400?img=${img}`;
}
