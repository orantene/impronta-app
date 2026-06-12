// src/lib/field-engine/read-source-directory-facet-config.ts
//
// T3.1 — DIRECTORY FACET CONFIG read seam (the facet's selectable VOCAB + slider
// BOUNDS), repointed from legacy System A (`field_definitions.config`) to
// canonical System B (`profile_field_definitions.directory_filter_config`).
//
// CONTEXT. T2.1 moved the facet VALUE-store read to System B but deliberately
// LEFT the facet CONFIG (the `filter_options` vocab, the height slider bounds,
// `filter_type`, `sort_order`) on System A's `field_definitions.config` jsonb,
// because B had no home for it. T3.1's migration adds a `directory_filter_config`
// jsonb column to System B and populates it from A for every directory-filterable
// field; this module reads it. Once every facet-config reader is on B, System A's
// `field_definitions` registry can be retired.
//
// WHAT THIS MODULE PROVIDES. Two pure-shape config slices, each read behind the
// same `directory_facets` flag the value-store repoint uses (so config + value
// flip together) with the SAME safe-fallback-to-A discipline:
//   • the facet OPTION VOCAB (`filter_options`) per legacy field key, and
//   • the height-range slider BOUNDS (min/max) + enabled flag.
//
// THE VOCAB IS SLUG-BASED ON PURPOSE. The B `directory_filter_config.filter_
// options` was populated (in the T3.1 migration) with A's option SLUGS — exactly
// the vocabulary the value store filters by — NOT B's label `options`. That keeps
// the whole directory pipeline slug-based end to end: the sidebar renders slug
// option ids, the apply step validates incoming slugs, and the value-store reader
// (read-source-directory-facets.ts) translates each slug into B's stored value via
// the existing vocab bridge. So flipping config to B is byte-identical to A for
// every non-stale key, and an EXPLAINED correction for the 3 stale keys whose B
// EDIT `options` (a different column) had drifted from the stored vocab.
//
// GENDER stays bare-label (the canonical 14-option vocab, identical in A and B).

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { activeReadSource } from "@/lib/field-engine/read-source";
import { logServerError } from "@/lib/server/safe-error";
import { OLD_TO_NEW_KEY } from "@/lib/fields/legacy-mirror";

/** The directory-facet-config slice (the shape A's `field_definitions.config`
 *  exposed today: an optional vocab list + optional slider bounds). */
export type DirectoryFacetConfig = {
  /** Selectable facet vocab — option SLUGS for scalar facets, bare labels for
   *  gender. Null when the field has no enum vocab (taxonomy/location/number). */
  filterOptions: string[] | null;
  /** Slider lower bound (height/years). Null for non-range facets. */
  min: number | null;
  /** Slider upper bound. Null for non-range facets. */
  max: number | null;
};

const EMPTY_CONFIG: DirectoryFacetConfig = {
  filterOptions: null,
  min: null,
  max: null,
};

/** True when this surface should read facet CONFIG from canonical System B.
 *  Governed by the SAME `directory_facets` flag as the value-store repoint, so
 *  config + values flip (and roll back) together. */
export function directoryFacetConfigReadsB(): boolean {
  return activeReadSource("directory_facets") === "b";
}

// ── A-side parsing (legacy `field_definitions.config`) ───────────────────────
// Lifted to match the existing readers byte-for-byte: prefer explicit
// `config.filter_options`, else `config.options[].value`.

function filterOptionsFromAConfig(
  config: Record<string, unknown> | null | undefined,
): string[] | null {
  const raw = config?.filter_options;
  if (Array.isArray(raw)) {
    const out = raw
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim());
    if (out.length) return out;
  }
  const optionRows = config?.options;
  if (!Array.isArray(optionRows)) return null;
  const out = optionRows
    .filter(
      (x): x is { value: string } =>
        x !== null &&
        typeof x === "object" &&
        typeof (x as { value?: unknown }).value === "string" &&
        (x as { value: string }).value.trim().length > 0,
    )
    .map((x) => x.value.trim());
  return out.length ? out : null;
}

function numberOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Parse a System A `field_definitions.config` jsonb into the config slice. The
 *  caller already has the A row in hand (the facet readers load it), so this is a
 *  pure projection — no DB. Used as the A-baseline + the safe fallback. */
export function directoryFacetConfigFromAConfig(
  config: Record<string, unknown> | null | undefined,
): DirectoryFacetConfig {
  return {
    filterOptions: filterOptionsFromAConfig(config),
    min: numberOrNull(config?.min),
    max: numberOrNull(config?.max),
  };
}

// ── B-side parsing (`profile_field_definitions.directory_filter_config`) ─────

/** Parse a System B `directory_filter_config` jsonb into the config slice. */
export function directoryFacetConfigFromBConfig(
  config: Record<string, unknown> | null | undefined,
): DirectoryFacetConfig {
  const raw = config?.filter_options;
  let filterOptions: string[] | null = null;
  if (Array.isArray(raw)) {
    const out = raw
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim());
    if (out.length) filterOptions = out;
  }
  return {
    filterOptions,
    min: numberOrNull(config?.min),
    max: numberOrNull(config?.max),
  };
}

/**
 * Read the facet CONFIG for a set of LEGACY field keys from canonical System B.
 * Resolves each legacy key → B `field_key` via the A↔B bridge (gender +
 * date_of_birth are not in the 17-key bridge, so they are mapped explicitly),
 * then reads `directory_filter_config`. Returns a map keyed by the LEGACY key so
 * the callers (which work in A-key space) need no shape change.
 *
 * Keys that don't resolve to a B definition (or have no config row) are ABSENT
 * from the returned map — the caller treats absence as "fall back to the A row's
 * own config", preserving today's behaviour for any not-yet-migrated key.
 */
export async function readDirectoryFacetConfigFromB(
  supabase: SupabaseClient,
  legacyKeys: readonly string[],
): Promise<Map<string, DirectoryFacetConfig>> {
  const out = new Map<string, DirectoryFacetConfig>();
  const uniqLegacy = [...new Set(legacyKeys.map((k) => k.trim()).filter(Boolean))];
  if (uniqLegacy.length === 0) return out;

  // legacy → B field_key. The 17-key bridge covers the scalar facets + height;
  // gender + date_of_birth are canonical-only and mapped explicitly here.
  const EXTRA_BRIDGE: Record<string, string> = {
    gender: "identity.gender",
    date_of_birth: "identity.dob",
    height_cm: "physical.height_cm",
  };
  const legacyToB = new Map<string, string>();
  for (const lk of uniqLegacy) {
    const bKey = OLD_TO_NEW_KEY[lk] ?? EXTRA_BRIDGE[lk];
    if (bKey) legacyToB.set(lk, bKey);
  }
  if (legacyToB.size === 0) return out;

  const bKeys = [...new Set(legacyToB.values())];
  const { data, error } = await supabase
    .from("profile_field_definitions")
    .select("field_key, directory_filter_config")
    .in("field_key", bKeys)
    .is("deprecated_at", null);
  if (error) {
    throw new Error(`[directory] facet config (System B): ${error.message}`);
  }

  const byBKey = new Map<string, Record<string, unknown> | null>();
  for (const row of (data ?? []) as {
    field_key: string;
    directory_filter_config: Record<string, unknown> | null;
  }[]) {
    byBKey.set(row.field_key, row.directory_filter_config ?? null);
  }

  for (const [lk, bKey] of legacyToB) {
    if (!byBKey.has(bKey)) continue; // no B def — caller falls back to A row config
    const cfg = byBKey.get(bKey) ?? null;
    if (cfg == null) continue; // B def present but config not migrated — fall back
    out.set(lk, directoryFacetConfigFromBConfig(cfg));
  }
  return out;
}

/**
 * Resolve the facet config for a set of legacy keys behind the `directory_facets`
 * flag. When the flag is `b`, read System B; if that read THROWS, log + return an
 * empty map so each caller safe-falls-back to the A row config it already holds
 * (never hardens into a broken facet). When the flag is `a`, return an empty map
 * (callers use their A row config — byte-identical to today).
 */
export async function loadDirectoryFacetConfigByLegacyKey(
  supabase: SupabaseClient,
  legacyKeys: readonly string[],
): Promise<Map<string, DirectoryFacetConfig>> {
  if (!directoryFacetConfigReadsB()) return new Map();
  try {
    return await readDirectoryFacetConfigFromB(supabase, legacyKeys);
  } catch (err) {
    logServerError("field-engine.directoryFacetConfig.b", err);
    return new Map();
  }
}
