/**
 * BUILDER 2027 · P2B — which native kinds have a LIVE engine to delegate to.
 *
 * Split out of `native-live-block-renderer.tsx` on purpose: that module imports
 * the curated directory engine and the auth area, so anything importing it
 * drags Supabase and `server-only` along. This list is the one piece a pure
 * test (and any client-side caller) needs, so it lives alone with no imports at
 * all.
 *
 * `header_search` and `header_language` are deliberately ABSENT. They are fully
 * native already — a real GET form, and the locale row the shell threads on
 * `options.availableLocales` — so they have nothing to delegate to, and adding
 * them here would claim an engine that does not exist.
 */
export const NATIVE_LIVE_BLOCK_KINDS = [
  "directory",
  "header_account",
  "header_inquiry",
] as const;

export type NativeLiveBlockKind = (typeof NATIVE_LIVE_BLOCK_KINDS)[number];

const KIND_SET: ReadonlySet<string> = new Set(NATIVE_LIVE_BLOCK_KINDS);

export function isNativeLiveBlockKind(kind: string): boolean {
  return KIND_SET.has(kind);
}
