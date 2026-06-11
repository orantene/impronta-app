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

import type { RegFieldKind, RegFieldChannel, TaxonomyParentId } from
  "@/components/admin/shell/internal/state/types";

// ── Wizard TaxonomyParentId ↔ DB parent_category slug reconciliation ─────────
//
// The registration wizard + static field catalog (`field-catalog.ts` /
// `TAXONOMY_FIELDS`) key type-specific fields by the fixed `TaxonomyParentId`
// union (`models`, `hosts`, `music`, …). The DB field engine groups its
// type-specific catalog (`render_mode='catalog'`) by the live
// `taxonomy_terms.slug` for the parent_category (`models`, `hosts-promo`,
// `music-djs`, …). Several differ.
//
// VERIFIED against the live DB (`SELECT slug FROM taxonomy_terms WHERE
// term_type='parent_category'`, 2026-06-10) vs the wizard's `TaxonomyParentId`
// union in `state/types.ts`:
//
//   wizard id        →  DB parent_category slug
//   ───────────────────────────────────────────
//   models           →  models                  (exact)
//   hosts            →  hosts-promo             (rename)
//   performers       →  performers              (exact)
//   music            →  music-djs               (rename)
//   creators         →  influencers-creators    (rename)
//   chefs            →  chefs-culinary          (rename)
//   wellness         →  wellness-beauty         (rename)
//   hospitality      →  hospitality-property    (rename)
//   transportation   →  transportation          (exact)
//   photo_video      →  photo-video-creative    (rename)
//   event_staff      →  event-staff             (underscore→hyphen)
//   security         →  security-protection     (rename)
//   services         →  (none — see note)
//
// `services` is the static catch-all bucket whose children span MULTIPLE DB
// parents (cleaning, hospitality, transport, security, catering, retail,
// technical). It has no single DB parent_category equivalent, so it is left
// UNMAPPED on purpose — the selector then returns `null` for it and the wizard
// keeps its existing static `services` field set. Mapping it to any one DB
// parent would render the wrong field set.
export const WIZARD_PARENT_ID_TO_DB_SLUG: Readonly<
  Partial<Record<TaxonomyParentId, string>>
> = {
  models: "models",
  hosts: "hosts-promo",
  performers: "performers",
  music: "music-djs",
  creators: "influencers-creators",
  chefs: "chefs-culinary",
  wellness: "wellness-beauty",
  hospitality: "hospitality-property",
  transportation: "transportation",
  photo_video: "photo-video-creative",
  event_staff: "event-staff",
  security: "security-protection",
  // services: intentionally omitted — no single DB parent (see note above).
} as const;

/** Reverse map: DB parent_category slug → wizard `TaxonomyParentId`. */
export const DB_SLUG_TO_WIZARD_PARENT_ID: Readonly<Record<string, TaxonomyParentId>> =
  Object.fromEntries(
    Object.entries(WIZARD_PARENT_ID_TO_DB_SLUG).map(([wid, slug]) => [slug, wid]),
  ) as Record<string, TaxonomyParentId>;

/**
 * Resolve a wizard-side parent key (which may be a static `TaxonomyParentId`
 * like `hosts` OR already a live DB slug like `hosts-promo`, depending on
 * whether the live taxonomy or the static fallback produced the parent) to the
 * DB parent_category slug used to key `dynamicFieldsByParent`.
 *
 * Order: explicit static→DB map → already-a-DB-slug (identity) → null. Pure.
 */
export function wizardParentKeyToDbSlug(
  parentKey: string,
): string | null {
  const mapped = WIZARD_PARENT_ID_TO_DB_SLUG[parentKey as TaxonomyParentId];
  if (mapped) return mapped;
  // Already a DB slug? (live-taxonomy path passes the slug straight through).
  if (parentKey in DB_SLUG_TO_WIZARD_PARENT_ID) return parentKey;
  return null;
}

// ── Flag ───────────────────────────────────────────────────────────────────
//
// `FIELD_ENGINE_CLIENT_SOURCE` decides whether the CLIENT field surfaces
// (registration wizard + editor dynamic groups + validation) read the static
// `field-catalog.ts` (today's behaviour) or the DB `profile_field_definitions`
// registry (the "one engine" target). Per-surface granularity so the wizard,
// drawer and validation can flip independently as each is proven safe.
//
// Default (T1.4, 2026-06-11): the `wizard` AND `validation` surfaces default to
// `db`; the `drawer` surface stays `static` until separately proven. The
// `validation` flip is gated by a parity proof
// (`field-validation-parity.test.ts`) showing DB-derived pre-save validation is
// decision-identical to the static catalog for every active field — the editor
// drawer's publish gate is already DB-resolver-driven, and the registration
// wizard's `canStep5` reads required/optional off the (already DB-resolved when
// `wizard=db`) rendered field, so the flip changes no accept/reject decision.
// The server loader does the (heavier) DB resolve + injects a payload whenever
// ANY surface is `db`; for a `static` surface the client still uses its
// existing static path untouched. Setting `FIELD_ENGINE_CLIENT_SOURCE=static`
// reverts every surface (including the wizard + validation) to the old static
// catalog — the kill switch. The documented per-surface kill switch for this
// flip alone is `FIELD_ENGINE_CLIENT_SOURCE=validation:static`.
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

/**
 * The default per-surface flags when `FIELD_ENGINE_CLIENT_SOURCE` is unset.
 * The registration `wizard` + `validation` read the DB registration field set;
 * the editor `drawer` stays on the static catalog until separately proven.
 * `FIELD_ENGINE_CLIENT_SOURCE=static` is the kill switch (reverts all → static);
 * `FIELD_ENGINE_CLIENT_SOURCE=validation:static` reverts just the validation flip.
 */
export const DEFAULT_FIELD_ENGINE_CLIENT_SOURCE_FLAGS: FieldEngineClientSourceFlags = {
  wizard: "db",
  drawer: "static",
  validation: "db",
};

/**
 * Parse `FIELD_ENGINE_CLIENT_SOURCE` into per-surface flags.
 *
 * Accepted forms (case-insensitive):
 *   - unset / ""          → the default flags (wizard `db`, validation `db`,
 *                            drawer `static`) — see DEFAULT_FIELD_ENGINE_CLIENT_SOURCE_FLAGS
 *   - "static"            → all `static` (kill switch — reverts every surface)
 *   - "db"                → all `db`
 *   - "drawer:db"         → drawer `db`, others keep the default
 *   - "validation:static" → validation `static`, others keep the default (the
 *                            documented kill switch for the T1.4 validation flip)
 *   - "wizard:static"     → wizard `static`, others keep the default
 *   - "wizard:db,drawer:db,validation:static" → explicit per-surface
 *
 * Per-surface tokens layer on top of the default flags (so naming one surface
 * does not reset the others). Unknown tokens are ignored. Pure — no env access
 * — so it is trivially testable and client-safe.
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
