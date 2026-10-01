/** Stable JSON (object keys sorted at every depth) for change detection. */
export function stableJson(v: unknown): string {
  return JSON.stringify(v ?? null, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );
}

/** True when two values are the same JSON regardless of key order. */
export function sameStable(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b);
}
