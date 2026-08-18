/**
 * Normalize operator-entered talent profile codes for directory scope filters.
 * Trims, drops blanks, de-dupes (first occurrence wins), preserves order.
 */
export function normalizeDirectoryProfileCodes(
  codes: readonly string[] | undefined,
): string[] {
  if (!codes?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of codes) {
    const code = raw.trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

/** Cache / seed-signature key: order-insensitive so TAL-1,TAL-2 === TAL-2,TAL-1. */
export function directoryProfileCodesCacheKey(codes: readonly string[] | undefined): string {
  const normalized = normalizeDirectoryProfileCodes(codes);
  if (normalized.length === 0) return "";
  return [...normalized].sort().join(",");
}
