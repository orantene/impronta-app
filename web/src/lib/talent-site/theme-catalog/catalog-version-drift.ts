/**
 * THEME CORE P1 (audit rec. 5): `talent_theme_catalog.version` lagging the
 * latest snapshot. Pure.
 *
 * A gated sync deliberately leaves the catalog row at its old version AND old
 * payload until "Make default" flips both. That held state must stay. But a row
 * whose stored payload is byte-identical to the latest snapshot's carries the
 * latest payload under a stale number (the audit's Maison v2 "v14 vs v24"
 * shape): only the number is wrong, and pinning new applies to the number the
 * payload really is cannot mis-pair a base. Anything else returns null.
 */
export function catalogDriftVersion(input: {
  priorVersion: number;
  priorHash: string;
  latestVersion: number;
  latestHash: string;
}): number | null {
  if (input.latestVersion <= input.priorVersion) return null;
  return input.priorHash === input.latestHash ? input.latestVersion : null;
}
