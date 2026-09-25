/**
 * Optional QA clock. Prefer an injected `now` prop; never call Date.now inside derive.
 * Dev/QA may pin with `?agendaNow=2026-09-24T09:50:00`.
 */

export function readAgendaNowFromSearch(search: string | null | undefined, fallback = new Date()): Date {
  if (!search) return fallback;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = params.get("agendaNow");
  if (!raw) return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function readAgendaNowClient(fallback = new Date()): Date {
  if (typeof window === "undefined") return fallback;
  return readAgendaNowFromSearch(window.location.search, fallback);
}
