// src/lib/field-engine/write-source.ts
//
// The SERVER-ONLY env reader for the Phase 2.5c field-engine WRITE repoint.
//
// The shell write path (`syncProfileShellDynFieldValues`) asks this module
// which store it should write for the `shell` surface:
//   • `b` (default, live) — write System B `talent_profile_field_values` ONLY
//     (the canonical store + read source of truth) via `mirrorWriteToCanonical`.
//     T2.6 step 3 deleted the B→A mirror, so System A `field_values` is frozen.
//   • `a` (kill switch)   — write System A `field_values` first, then fire-and-
//     forget the A→B mirror (`mirrorWriteToCanonical`). Documented rollback only.
//
// This module is server-only (it reads `process.env` for the live flag). The
// PURE pieces (the flag grammar + the dispatch decision) live in
// write-source-types.ts so they stay client-safe and unit-testable without env.

import "server-only";

import {
  parseFieldEngineWriteSourceFlags,
  writeSourceForSurface,
  type FieldEngineWriteSource,
  type FieldEngineWriteSourceFlags,
  type FieldEngineWriteSurface,
} from "@/lib/field-engine/write-source-types";

/** Read the live per-surface write flags from the environment (server-only). */
export function getFieldEngineWriteSourceFlags(): FieldEngineWriteSourceFlags {
  return parseFieldEngineWriteSourceFlags(process.env.FIELD_ENGINE_WRITE_SOURCE);
}

/** The active write source for one surface, resolved from the live env flags. */
export function activeWriteSource(
  surface: FieldEngineWriteSurface,
  flags: FieldEngineWriteSourceFlags = getFieldEngineWriteSourceFlags(),
): FieldEngineWriteSource {
  return writeSourceForSurface(flags, surface);
}
