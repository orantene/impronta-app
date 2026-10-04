/** Sorted, JSON-clean copy of `DesignPayload.palettes`; undefined when empty. Pure, no imports. */
export function canonicalPalettes(
  p: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined,
): Record<string, Record<string, string>> | undefined {
  if (!p) return undefined;
  const out: Record<string, Record<string, string>> = {};
  for (const k of Object.keys(p).sort()) {
    const inner = p[k] ?? {};
    const keys = Object.keys(inner).sort();
    if (keys.length === 0) continue;
    out[k] = Object.fromEntries(keys.map((t) => [t, inner[t]!]));
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
