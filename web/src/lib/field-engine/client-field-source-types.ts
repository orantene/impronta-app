// src/lib/field-engine/client-field-source-types.ts
//
// PURE TYPES + the per-surface flag for the "repoint the client field
// catalog to the DB" work (profile-field-engine unification, P1).
//
// This module is intentionally dependency-free (no server-only imports, no
// React, no Supabase). It is imported by BOTH:
//   • the SERVER loader (`client-field-source.ts`, "server-only") which
//     resolves the DB catalog and produces a `ClientFieldSourcePayload`, and
//   • the CLIENT components (registration wizard `light-03.tsx`, the talent
//     editor drawer `TalentProfileShellDrawer.tsx`) which consume the payload
//     off the AdminShell bridge.
//
// Splitting the types out keeps the "never import the server-only service
// into a 'use client' component" rule intact (same precedent as
// `profile-editor/layout-types.ts`).

import type { RegFieldKind, RegFieldChannel } from
  "@/components/admin/shell/internal/state/types";

// ── Flag ───────────────────────────────────────────────────────────────────
//
// `FIELD_ENGINE_CLIENT_SOURCE` decides whether the CLIENT field surfaces
// (registration wizard + editor dynamic groups + validation) read the static
// `field-catalog.ts` (today's behaviour) or the DB `profile_field_definitions`
// registry (the "one engine" target). Per-surface granularity so the wizard,
// drawer and validation can flip independently as each is proven safe.
//
// Default is `static` for EVERY surface → byte-identical to today. The server
// loader only does the (heavier) DB resolve + injects a payload when a surface
// is flipped to `db`; when `static`, it injects `null` and the client falls
// back to its existing static path untouched.
//
// Read once on the server from `process.env`. A single env var sets every
// surface; the rarely-needed per-surface override uses a comma list like
// `wizard:db,drawer:static`.

export type FieldEngineClientSource = "static" | "db";

export type FieldEngineClientSurface = "wizard" | "drawer" | "validation";

export type FieldEngineClientSourceFlags = Record<
  FieldEngineClientSurface,
  FieldEngineClientSource
>;

export const FIELD_ENGINE_CLIENT_SURFACES: readonly FieldEngineClientSurface[] = [
  "wizard",
  "drawer",
  "validation",
] as const;

/** The safe default — every surface reads the static catalog. */
export const DEFAULT_FIELD_ENGINE_CLIENT_SOURCE_FLAGS: FieldEngineClientSourceFlags = {
  wizard: "static",
  drawer: "static",
  validation: "static",
};

/**
 * Parse `FIELD_ENGINE_CLIENT_SOURCE` into per-surface flags.
 *
 * Accepted forms (case-insensitive):
 *   - unset / ""        → all surfaces `static`
 *   - "static"          → all `static`
 *   - "db"              → all `db`
 *   - "wizard:db"       → wizard `db`, rest `static`
 *   - "wizard:db,drawer:db,validation:static" → explicit per-surface
 *
 * Unknown tokens are ignored (fail safe to `static`). Pure — no env access —
 * so it is trivially testable and client-safe.
 */
export function parseFieldEngineClientSourceFlags(
  raw: string | null | undefined,
): FieldEngineClientSourceFlags {
  const flags: FieldEngineClientSourceFlags = {
    ...DEFAULT_FIELD_ENGINE_CLIENT_SOURCE_FLAGS,
  };
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "") return flags;
  if (value === "static" || value === "db") {
    for (const s of FIELD_ENGINE_CLIENT_SURFACES) flags[s] = value;
    return flags;
  }
  for (const part of value.split(",")) {
    const [surfaceRaw, sourceRaw] = part.split(":").map((x) => x.trim());
    const surface = surfaceRaw as FieldEngineClientSurface;
    const source = sourceRaw as FieldEngineClientSource;
    if (
      FIELD_ENGINE_CLIENT_SURFACES.includes(surface) &&
      (source === "static" || source === "db")
    ) {
      flags[surface] = source;
    }
  }
  return flags;
}

// ── Serializable DTOs (cross the server→client bridge) ──────────────────────

/**
 * One dynamic (type-specific) field, projected from the DB catalog into the
 * exact shape the wizard + drawer already consume (`RegField`). `id` is the
 * SHORT id (last dotted segment of `field_key`) — preserving the wizard +
 * drawer storage-key convention. `fieldKey` carries the full DB key for
 * traceability / the parity assertion.
 */
export type ClientDynamicFieldDTO = {
  /** Short id (storage key) — last segment of the DB field_key. */
  id: string;
  /** Full DB field_key (e.g. "physical.height_cm"). Diagnostic only. */
  fieldKey: string;
  label: string;
  kind: RegFieldKind;
  optional?: boolean;
  placeholder?: string;
  helper?: string;
  options?: string[];
  subsection?: "physical" | "wardrobe";
  sensitive?: boolean;
  defaultVisibility?: ReadonlyArray<RegFieldChannel>;
  /** DB display_order — lets the client preserve catalog ordering. */
  displayOrder: number;
};

/**
 * The payload carried on the AdminShell bridge when at least one client field
 * surface is flipped to `db`. `null` everywhere = every surface is `static`
 * (the default) and the client uses its existing static path untouched.
 */
export type ClientFieldSourcePayload = {
  /** Per-surface resolved source flags (so the client reads the right path). */
  flags: FieldEngineClientSourceFlags;
  /**
   * DB-resolved type-specific (`render_mode='catalog'`) fields, grouped by
   * talent-type parent slug. Only populated for surfaces flipped to `db`.
   * Empty/absent for a parent = the client falls back to static for it.
   */
  dynamicFieldsByParent: Record<string, ClientDynamicFieldDTO[]>;
  /** ISO timestamp the payload was resolved — for cache/debug. */
  generatedAt: string;
};
