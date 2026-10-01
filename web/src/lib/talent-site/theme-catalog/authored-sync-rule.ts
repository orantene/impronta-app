/**
 * TEMPLATE FACTORY: the sync rule for EDITOR-AUTHORED design versions. Pure.
 *
 * The template editor publishes design versions into `talent_theme_versions`
 * with `source = 'authored'`. The code sync compares the code payload with the
 * latest snapshot of ANY source, so without this rule the next sync after an
 * editor publish would bump a version and draft a release that REVERTS the
 * editor's work.
 *
 * An authored latest is "reflected" once a committed overlay
 * (`collection/authored/<slug>.overlay.json`) declares `authoredVersion` at or
 * past it: the code has caught up, and code changes flow normally again.
 *
 *   hash(code) == hash(latest)       -> unchanged
 *   latest authored, not reflected   -> authored_pending (skip: no snapshot,
 *     no release); conflict when latest.meta.code_hash exists and differs from
 *     hash(code), i.e. the code moved since the editor based its work on it
 *   otherwise                        -> code_change (today's behaviour)
 */

export interface SnapshotMeta {
  code_hash?: unknown;
  [key: string]: unknown;
}

export interface LatestSnapshotState {
  version: number;
  source?: string | null;
  meta?: SnapshotMeta | null;
}

export type AuthoredSyncDecision =
  | { kind: "unchanged" }
  | { kind: "authored_pending"; latestVersion: number; conflict: boolean }
  | { kind: "code_change" };

/** True unless the snapshot is authored AND the overlay has not caught up to it. */
export function isAuthoredReflected(
  latest: Pick<LatestSnapshotState, "version" | "source">,
  overlayVersion: number,
): boolean {
  return latest.source !== "authored" || overlayVersion >= latest.version;
}

export function decideAuthoredSync(input: {
  codeHash: string;
  latestHash: string;
  latest: LatestSnapshotState;
  overlayVersion: number;
}): AuthoredSyncDecision {
  if (input.codeHash === input.latestHash) return { kind: "unchanged" };
  if (!isAuthoredReflected(input.latest, input.overlayVersion)) {
    const based = input.latest.meta?.code_hash;
    return {
      kind: "authored_pending",
      latestVersion: input.latest.version,
      conflict: typeof based === "string" && based.length > 0 && based !== input.codeHash,
    };
  }
  return { kind: "code_change" };
}

export const AUTHORED_GATE_COPY = {
  en: "This version was made in the template editor and the code does not include it yet. Commit its overlay and sync before opening it to talents or making it the default.",
  es: "Esta versión se hizo en el editor de plantillas y el código aún no la incluye. Confirma su overlay y sincroniza antes de abrirla a talentos o hacerla predeterminada.",
} as const;

export type ChannelGateTarget = "draft" | "demos" | "optin" | "default";

export type AuthoredChannelGate =
  | { ok: true }
  | { ok: false; code: "authored_pending"; error: string; errorEs: string };

/**
 * Release manager gate: "Open to talents" (optin) and "Make default" are
 * refused while the release's to_version snapshot is authored and not yet
 * reflected in code. Draft, dry run and demos stay allowed. A missing
 * snapshot (null) is not authored, so it passes.
 */
export function checkAuthoredChannelGate(
  target: ChannelGateTarget,
  snapshot: Pick<LatestSnapshotState, "version" | "source"> | null,
  overlayVersion: number,
): AuthoredChannelGate {
  if (target !== "optin" && target !== "default") return { ok: true };
  if (!snapshot || isAuthoredReflected(snapshot, overlayVersion)) return { ok: true };
  return { ok: false, code: "authored_pending", error: AUTHORED_GATE_COPY.en, errorEs: AUTHORED_GATE_COPY.es };
}
