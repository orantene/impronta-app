// src/lib/field-engine/read-source.ts
//
// The SHARED READ SEAM for the Phase 2 field-engine unification.
//
// Each reader surface (T2.1–T2.5) implements a pair of readers behind this seam:
//   • a readA leg and a readB leg, each returning the SAME output type `T`.
//
// `readFieldSurface` dispatches to one of the two based on the per-surface flag
// (`FIELD_ENGINE_READ_SOURCE`, parsed in read-source-types.ts). Because both
// readers return the identical `T`, the surface's CALLER never changes when a
// surface is flipped — only the flag does.
//
// PHASE 3 NOTE (T3.2 / T3.2b): System A is retired. The collapsed surfaces
// (directory facets/search/card-values/cards, ai-search-doc, public-sidebar)
// now point BOTH legs at their canonical System B reader — the legacy System A
// `field_values` / `field_definitions` legs were deleted. The seam shell + the
// per-surface flag are kept so the call sites stay frozen and the flag grammar
// is preserved, but for a collapsed surface the flag no longer switches stores
// (both `a` and `b` resolve to the same B reader).
//
// SAFE-FALLBACK: a readB throw is caught, logged, and the readA leg re-run. For
// a not-yet-collapsed surface that degrades to System A; for a collapsed surface
// both legs are B, so this simply re-runs the B read (no System-A fallback
// exists anymore).
//
// This module is server-only (it reads `process.env` for the live flags). The
// PURE pieces (the flag grammar + the dispatch decision) live in
// read-source-types.ts so they stay client-safe and unit-testable without env.

import "server-only";

import {
  parseFieldEngineReadSourceFlags,
  readSourceForSurface,
  type FieldEngineReadSource,
  type FieldEngineReadSourceFlags,
  type FieldEngineReadSurface,
} from "@/lib/field-engine/read-source-types";
import { logServerError } from "@/lib/server/safe-error";

/** Read the live per-surface flags from the environment (server-only). */
export function getFieldEngineReadSourceFlags(): FieldEngineReadSourceFlags {
  return parseFieldEngineReadSourceFlags(process.env.FIELD_ENGINE_READ_SOURCE);
}

/** The active source for one surface, resolved from the live env flags. */
export function activeReadSource(
  surface: FieldEngineReadSurface,
  flags: FieldEngineReadSourceFlags = getFieldEngineReadSourceFlags(),
): FieldEngineReadSource {
  return readSourceForSurface(flags, surface);
}

/**
 * A surface's reader pair. Both functions take the surface's own argument shape
 * `A` and return the SAME output shape `T`. T2.1–T2.5 each supply one of these.
 *
 *   readA — read System A exactly as the surface does today (the baseline; this
 *           is literally the surface's existing reader, lifted behind the seam).
 *   readB — read System B and project to the identical `T`.
 *
 * Keeping both in one object makes the seam the single place a surface's two
 * code paths meet, and makes the test ("A and B agree for this slice") trivial
 * to write against the pair directly.
 */
export interface FieldSurfaceReaderPair<Args extends unknown[], T> {
  readA: (...args: Args) => Promise<T>;
  readB: (...args: Args) => Promise<T>;
}

/**
 * Dispatch a surface read to the readA or readB leg per the live flag.
 *
 * Behaviour:
 *   - flag `a` → `readA(...)`. For a collapsed surface (T3.2b) readA IS the B
 *                reader, so this still reads canonical System B.
 *   - flag `b` → `readB(...)`; if it throws, log + re-run `readA(...)`. For a
 *                not-yet-collapsed surface that degrades to System A; for a
 *                collapsed surface readA is also B, so it re-runs the B read.
 *
 * `surface` names which flag governs this call. `pair` is the surface's
 * reader pair. `args` are forwarded verbatim to whichever reader runs.
 */
export async function readFieldSurface<Args extends unknown[], T>(
  surface: FieldEngineReadSurface,
  pair: FieldSurfaceReaderPair<Args, T>,
  ...args: Args
): Promise<T> {
  const source = activeReadSource(surface);
  if (source === "a") return pair.readA(...args);
  try {
    return await pair.readB(...args);
  } catch (err) {
    logServerError(`field-engine.readFieldSurface.${surface}.b`, err);
    // Re-run readA. For a collapsed surface readA is the same B reader (no
    // System-A fallback exists anymore); for a non-collapsed surface this
    // degrades to System A so a broken B-read never hardens.
    return pair.readA(...args);
  }
}

/**
 * Test/diagnostic helper: run BOTH readers and return them side by side. The
 * parity harness (scripts/field-parity-harness.mjs) proves agreement at the
 * DB-row level; this proves agreement at the surface's PROJECTED-OUTPUT level
 * (the shape the caller actually consumes). T2.1–T2.5 use this to assert their
 * surface's A-read and B-read produce equal `T` for the proof cohort before
 * flipping the flag. NOT used on the hot path.
 */
export async function readFieldSurfaceBoth<Args extends unknown[], T>(
  pair: FieldSurfaceReaderPair<Args, T>,
  ...args: Args
): Promise<{ a: T; b: T }> {
  const [a, b] = await Promise.all([pair.readA(...args), pair.readB(...args)]);
  return { a, b };
}
