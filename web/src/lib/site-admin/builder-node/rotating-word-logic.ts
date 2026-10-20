/**
 * W-10 rotating word (Solace, TH04): pure helpers. A heading's text holds the
 * `{rotate}` marker; the words are talent-authored (`rotatingWords`, localizable
 * per language through the list overlay, `rotatingWords.0.text`).
 */
export const ROTATE_MARKER = "{rotate}";
export const ROTATE_MAX_WORDS = 6;
export const ROTATE_MAX_CHARS = 24;
export const ROTATE_DEFAULT_MS = 3200;

/** [before, after] around the first marker, or null when the text has none. */
export function splitRotate(text: string): [string, string] | null {
  const at = text.indexOf(ROTATE_MARKER);
  if (at < 0) return null;
  return [text.slice(0, at), text.slice(at + ROTATE_MARKER.length)];
}

/** Trim, drop blanks, dedupe case-insensitively, cap count and length. */
export function cleanRotatingWords(words: ReadonlyArray<{ text?: unknown }> | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words ?? []) {
    const t = typeof w?.text === "string" ? w.text.trim().slice(0, ROTATE_MAX_CHARS) : "";
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length === ROTATE_MAX_WORDS) break;
  }
  return out;
}

export function nextWordIndex(current: number, count: number): number {
  return count <= 1 ? 0 : (current + 1) % count;
}

export function clampRotateMs(ms: number | undefined): number {
  return typeof ms === "number" && Number.isFinite(ms) ? Math.min(Math.max(Math.round(ms), 1500), 8000) : ROTATE_DEFAULT_MS;
}
