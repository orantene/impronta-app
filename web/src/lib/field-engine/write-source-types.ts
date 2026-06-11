// src/lib/field-engine/write-source-types.ts
//
// PURE TYPES + the per-surface flag for the Phase 2.5c field-engine WRITE
// repoint: flip the talent-profile shell write path from "System A first,
// mirror A→B" to "System B first, mirror B→A" — ONE SURFACE AT A TIME, behind
// a per-surface flag that defaults to writing A (today's behaviour).
//
// This module is the WRITE-side twin of `read-source-types.ts`. It is
// intentionally dependency-free (no server-only imports, no React, no
// Supabase) so it can be imported by:
//   • the shell write path (`profile-shell-dyn-field-values.ts`),
//   • the server-only env reader (`write-source.ts`), and
//   • the unit test (`write-source.test.ts`).
//
// MODELLED ON `read-source-types.ts` (same env-var grammar, same global +
// per-surface kill switch, same pure-parser → trivially-unit-testable shape).
//
// DIFFERENCE FROM the read flag: the read flag chooses which *store a reader
// pulls from*. This flag chooses which store the shell *writes to FIRST* and
// which direction the transition-period mirror runs:
//   - `a` (default, today): write `field_values` (System A) FIRST, then
//     fire-and-forget `mirrorWriteToCanonical` (A→B) so canonical stays fresh.
//   - `b`: write `talent_profile_field_values` (System B) FIRST via
//     `mirrorWriteToCanonical`, then mirror `mirrorWriteToLegacy` (B→A) so the
//     residual legacy `field_values` readers + the reconcile cron stay fresh.
// Both paths land BYTE-EQUIVALENT values in BOTH stores; only WHICH store is
// the primary (non-fire-and-forget) target differs. Every surface defaults to
// `a`, so merging this scaffold is 100% behaviour-neutral; the manager flips a
// surface to `b` as a separate activation after the proof + review. The mirror
// itself is NOT deleted here — that is the human-gated T2.6.

// ── Source + surface vocabulary ──────────────────────────────────────────────

/** Which store a surface writes FIRST. `a` = legacy System A
 *  (field_values, then A→B mirror), `b` = canonical System B
 *  (talent_profile_field_values, then B→A mirror). */
export type FieldEngineWriteSource = "a" | "b";

/**
 * The System-A WRITER surfaces repointed in Phase 2.5c, one at a time.
 *   shell — T2.5c — the talent-profile shell editor write path
 *     (`syncProfileShellDynFieldValues`, shared by both the admin roster shell
 *     `admin-talent-profile-sections.ts` and the talent self-edit shell
 *     `talent-self-profile-sections.ts`). This is the BIG one: the primary
 *     write target for every bridged scalar field edit.
 *
 * Future T2.6 surfaces (the OTHER A-writers — NOT in this flag yet):
 * `admin-translation-quick-edit.ts` (value_i18n). That is a separate,
 * non-shell write path; it gets its own surface here when T2.6 repoints it.
 *
 * (The two scalar-field-values A-writer actions — `admin-talent.ts
 * saveAdminTalentScalarFieldValues` + `talent-field-values.ts
 * saveTalentScalarFieldValues` — were dead code rendered nowhere and were
 * DELETED in T2.6 step 2 rather than repointed.)
 */
export type FieldEngineWriteSurface = "shell";

export const FIELD_ENGINE_WRITE_SURFACES: readonly FieldEngineWriteSurface[] = [
  "shell",
] as const;

export type FieldEngineWriteSourceFlags = Record<
  FieldEngineWriteSurface,
  FieldEngineWriteSource
>;

/**
 * The default per-surface flags when `FIELD_ENGINE_WRITE_SOURCE` is unset.
 *
 * T2.6 ACTIVATION: `shell` now defaults to `b` (write canonical System B first,
 * mirror B→A). The T2.5c b-first code path is unchanged — this flip is the ONLY
 * behavioural change. The controlled-write proof (T2.5c, 16/16 byte-equivalent,
 * A stays mirrored, reverted) plus reviewer sign-off + the b-first round-trip
 * regression test (`profile-shell-dyn-field-values.roundtrip.test.ts`) gate this
 * activation.
 *
 * KILL SWITCH / ROLLBACK: `FIELD_ENGINE_WRITE_SOURCE=a` forces every surface
 * back to A-first (instant rollback to the prior, pre-T2.6 behaviour).
 * Per-surface rollback: name just that surface, e.g.
 * `FIELD_ENGINE_WRITE_SOURCE=shell:a`. (Re-aliasing to the prior deploy is the
 * deploy-level fallback.)
 */
export const DEFAULT_FIELD_ENGINE_WRITE_SOURCE_FLAGS: FieldEngineWriteSourceFlags =
  {
    // T2.6 — `shell` activated to `b` (B-first: write canonical System B, then
    // mirror B→A so residual legacy `field_values` readers + the reconcile cron
    // stay fresh until the mirror is deleted). Documented kill switch back to
    // A-first (the prior behaviour): `FIELD_ENGINE_WRITE_SOURCE=shell:a` (or
    // the global `=a`).
    shell: "b",
  };

/**
 * Parse `FIELD_ENGINE_WRITE_SOURCE` into per-surface flags.
 *
 * Accepted forms (case-insensitive, whitespace-tolerant) — identical grammar to
 * `parseFieldEngineReadSourceFlags`:
 *   - unset / ""            → all `a` (the default — behaviour-neutral)
 *   - "a"                   → all `a` (the global kill switch / rollback)
 *   - "b"                   → all `b` (flip every write surface)
 *   - "shell:b"             → that surface `b`, others keep their default
 *   - "shell:a"             → revert just that surface (per-surface rollback)
 *
 * Per-surface tokens layer on top of the default flags (naming one surface does
 * not reset the others). Unknown tokens are ignored. Pure — no env access — so
 * it is trivially testable and import-safe everywhere.
 */
export function parseFieldEngineWriteSourceFlags(
  raw: string | null | undefined,
): FieldEngineWriteSourceFlags {
  const flags: FieldEngineWriteSourceFlags = {
    ...DEFAULT_FIELD_ENGINE_WRITE_SOURCE_FLAGS,
  };
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "") return flags;
  if (value === "a" || value === "b") {
    for (const s of FIELD_ENGINE_WRITE_SURFACES) flags[s] = value;
    return flags;
  }
  for (const part of value.split(",")) {
    const [surfaceRaw, sourceRaw] = part.split(":").map((x) => x.trim());
    const surface = surfaceRaw as FieldEngineWriteSurface;
    const source = sourceRaw as FieldEngineWriteSource;
    if (
      FIELD_ENGINE_WRITE_SURFACES.includes(surface) &&
      (source === "a" || source === "b")
    ) {
      flags[surface] = source;
    }
  }
  return flags;
}

/** Pure helper — which source is active for a surface, given pre-parsed flags. */
export function writeSourceForSurface(
  flags: FieldEngineWriteSourceFlags,
  surface: FieldEngineWriteSurface,
): FieldEngineWriteSource {
  return flags[surface];
}

/** True when the surface writes B-first (canonical). Pure. */
export function surfaceWritesCanonical(
  flags: FieldEngineWriteSourceFlags,
  surface: FieldEngineWriteSurface,
): boolean {
  return flags[surface] === "b";
}
