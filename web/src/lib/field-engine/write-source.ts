// src/lib/field-engine/write-source.ts
//
// The SERVER-ONLY env reader for the Phase 2.5c field-engine WRITE repoint.
//
// The shell write path (`syncProfileShellDynFieldValues`) asks this module
// which store it should write FIRST for the `shell` surface:
//   • `a` (default) — write System A `field_values` first, then fire-and-forget
//     the A→B mirror (`mirrorWriteToCanonical`). This is today's behaviour,
//     byte-for-byte.
//   • `b`           — write System B `talent_profile_field_values` first (the
//     canonical store, now the read source of truth), then mirror B→A
//     (`mirrorWriteToLegacy`) so residual legacy readers + the reconcile cron
//     stay fresh until the mirror is deleted in T2.6.
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
