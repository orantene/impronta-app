/**
 * Records the last few history.pushState/replaceState calls (URL, time, and a
 * short stack) so a stalled server action report can name the component that
 * navigated while it was in flight. Wraps whatever pushState/replaceState is
 * current; Next's own patch (installed later, in the root router effect)
 * keeps calling through this wrapper. Calls Next makes for itself carry
 * `__NA` and are skipped.
 */
type HistoryWrite = { readonly kind: "push" | "replace"; readonly url: string; readonly at: number; readonly stack: string };

const MAX = 10;
const writes: HistoryWrite[] = [];
let installed = false;

function shortStack(): string {
  const lines = (new Error().stack ?? "").split("\n").slice(3, 9);
  return lines.map((line) => line.trim()).join(" | ");
}

export function recordHistoryWrite(kind: HistoryWrite["kind"], url: unknown, now = Date.now()): void {
  if (url == null) return;
  writes.push({ kind, url: String(url), at: now, stack: shortStack() });
  if (writes.length > MAX) writes.shift();
}

export function recentHistoryWrites(): readonly HistoryWrite[] {
  return [...writes];
}

export function installHistoryWriteTrace(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const history = window.history;
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  history.pushState = function pushState(data: unknown, unused: string, url?: string | URL | null) {
    if (!(data as { __NA?: unknown } | null)?.__NA) recordHistoryWrite("push", url);
    return push(data, unused, url);
  };
  history.replaceState = function replaceState(data: unknown, unused: string, url?: string | URL | null) {
    if (!(data as { __NA?: unknown } | null)?.__NA) recordHistoryWrite("replace", url);
    return replace(data, unused, url);
  };
}
