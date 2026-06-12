// src/lib/field-engine/read-source-public-sidebar.ts
//
// T2.2 — PUBLIC PROFILE SIDEBAR visibility + order repoint (the live surface).
//
// The /t/[profileCode] sidebar renders six taxonomy sections — fit_labels,
// skills, languages, industries, event_types, tags — and gates each one with a
// `fieldVisibility` object computed in page.tsx. Today page.tsx reads the
// per-key ROW SHAPE from legacy System A (`field_definitions`) and routes each
// row through `isResolvedFieldVisibleInPublicProfileSidebar`. This module lifts
// that computation behind the shared seam as `readA` (byte-identical to today)
// and adds a `readB` that sources the same row shape from canonical System B
// (`profile_field_definitions`), returning the IDENTICAL `SidebarFieldVisibility`
// object. The caller (page.tsx) calls the seam; the `public_sidebar` flag decides
// A vs B.
//
// WHAT MOVES — and what does NOT:
//   • VISIBILITY (this module). The visibility DECISION was already canonical
//     before T2.2: `isResolvedFieldVisibleInPublicProfileSidebar` consults
//     `profile_field_definitions` (System B) via the bridged-key path for the
//     actual show/hide call; the legacy `field_definitions` row it receives is
//     used ONLY for the base guard (active + non-archived). So A and B agree on
//     visibility BY CONSTRUCTION — the only thing that changes when we flip to
//     B is WHERE the base-guard row shape comes from. readB reproduces the base
//     guard from B's `deprecated_at` (deprecated ⇒ !active) so the resolver
//     yields the same decision. See the `skills` note below.
//   • ORDER. The rendered top-to-bottom sequence of the sidebar sections is
//     HARD-CODED in JSX (`_light/SkillsExperienceBlock.tsx`: Best for → Skills →
//     Industries → Events → Tags; languages renders in its own fixed block).
//     NOTHING in the live render reads `field_definitions.sort_order` or
//     `profile_field_definitions.display_order`. The legacy order helper
//     `getOrderedPublicProfileSections` (public-profile-field-order.ts) has ZERO
//     live callers. Therefore the A `sort_order` {20,30,40,50,60,70} vs B
//     `display_order` {100,350,360,365,370,...} divergence CANNOT reorder the
//     sidebar — the relative render sequence is identical (in fact fixed) under
//     either store. We still expose `readSidebarSectionOrder` so the order slice
//     reads from the active source for any future caller, and prove sequence
//     equivalence in the test, but it is NOT on the live render path.
//
// THE `skills` HAZARD (handled explicitly):
//   System B's `skills` row is DEPRECATED (`deprecated_at` set), NOT missing.
//   The canonical visibility batch loader skips deprecated rows, so the resolver
//   returns FALSE for `skills` — i.e. the skills section is HIDDEN on the live
//   site TODAY (verified read-only against prod ref pluhdapdnuiulvxmyspd,
//   2026-06-11: skills final_visible=false; the other five true). readA gets a
//   live `field_definitions.skills` row (active=true) and the resolver still
//   returns false via the canonical path. readB must NOT let `deprecated_at IS
//   NULL` drop the skills row into the "no row ⇒ default visible (true)"
//   fallback page.tsx uses — that would REVEAL the section (a regression). So
//   readB fetches the six rows WITHOUT filtering deprecated, and maps
//   `deprecated_at` → a synthetic `active=false`/`archived_at=deprecated_at`
//   base-guard row. The resolver's base guard (`!active`) then returns false for
//   skills, matching readA exactly.
//
// SCOPE: visibility + order for the six sidebar sections only. Labels are the
// T2.0 proof slice (read-source-public-sidebar-labels.ts) and are not touched
// here (the live sidebar labels are hard-coded UI strings, not DB-driven).

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldSurfaceReaderPair } from "@/lib/field-engine/read-source";
import { readFieldSurface } from "@/lib/field-engine/read-source";
import {
  isResolvedFieldVisibleInPublicProfileSidebar,
  type PublicSurfaceContext,
} from "@/lib/field-engine/public-surface-visibility";

/** The six public-profile sidebar taxonomy keys, in the array order page.tsx
 *  uses for the parallel resolver calls. This is the legacy `_SIDEBAR_KEYS`
 *  tuple, unchanged. */
export const PUBLIC_SIDEBAR_KEYS = [
  "fit_labels",
  "skills",
  "languages",
  "industries",
  "event_types",
  "tags",
] as const;

export type PublicSidebarKey = (typeof PUBLIC_SIDEBAR_KEYS)[number];

/** The projected output — the exact `fieldVisibility` shape page.tsx passes to
 *  `LightProfileLayout`. Identical from A or B so the caller is frozen. */
export type SidebarFieldVisibility = {
  showFitLabels: boolean;
  showSkills: boolean;
  showLanguages: boolean;
  showIndustries: boolean;
  showEventTypes: boolean;
  showTags: boolean;
};

/** The base-guard row shape the sidebar resolver consumes. The resolver reads
 *  only `key`, `active`, `archived_at` (base guard) + `tenant_id` (unused for
 *  the sidebar); the three legacy visibility columns are carried for back-compat
 *  with the resolver signature but Sub-Task 5 stopped consulting them, so we set
 *  them to the same neutral values from either store. */
type SidebarGuardRow = {
  key: string;
  active: boolean;
  archived_at: string | null;
  tenant_id: string | null;
  public_visible: boolean;
  profile_visible: boolean;
  internal_only: boolean;
};

/** Map an ordered boolean array (one per PUBLIC_SIDEBAR_KEYS entry) into the
 *  named `SidebarFieldVisibility` object — byte-identical to page.tsx's
 *  `{ showFitLabels: _fv0 ?? true, ... }` assembly. */
function toVisibility(flags: (boolean | undefined)[]): SidebarFieldVisibility {
  return {
    showFitLabels: flags[0] ?? true,
    showSkills: flags[1] ?? true,
    showLanguages: flags[2] ?? true,
    showIndustries: flags[3] ?? true,
    showEventTypes: flags[4] ?? true,
    showTags: flags[5] ?? true,
  };
}

/** Run the canonical sidebar resolver across the six keys, given a per-key
 *  guard-row lookup. Missing key → `true` (the page.tsx "render all sections"
 *  fallback). Shared by readA and readB so the ONLY difference between the two
 *  is where the guard rows come from. */
async function resolveSidebarVisibility(
  ctx: PublicSurfaceContext,
  rowByKey: Map<string, SidebarGuardRow>,
): Promise<SidebarFieldVisibility> {
  const checks = await Promise.all(
    PUBLIC_SIDEBAR_KEYS.map((key) => {
      const row = rowByKey.get(key);
      return row
        ? isResolvedFieldVisibleInPublicProfileSidebar(row, ctx)
        : Promise.resolve(true);
    }),
  );
  return toVisibility(checks);
}

// ── B-reader: canonical System B (profile_field_definitions) ─────────────────
//
// Sources the SAME base-guard row shape from System B. Fetches the six keys
// WITHOUT a `deprecated_at IS NULL` filter (so the deprecated `skills` row is
// present, not missing) and maps each B row into a `SidebarGuardRow`:
//   active      ← deprecated_at IS NULL  (deprecated ⇒ base guard fails ⇒ false)
//   archived_at ← deprecated_at          (same effect via the second base guard)
// The legacy visibility columns are set to the neutral values the resolver no
// longer consults. The resolver then makes the identical canonical decision it
// already makes today — so readB === readA for every key, including the
// deliberately-hidden `skills`.
async function readSidebarVisibilityFromB(
  supabase: SupabaseClient | null,
  tenantId: string | null,
): Promise<SidebarFieldVisibility> {
  if (!supabase) {
    return {
      showFitLabels: true,
      showSkills: true,
      showLanguages: true,
      showIndustries: true,
      showEventTypes: true,
      showTags: true,
    };
  }
  const ctx: PublicSurfaceContext = { supabase, tenantId };
  const { data } = await supabase
    .from("profile_field_definitions")
    .select("field_key, deprecated_at")
    .in("field_key", [...PUBLIC_SIDEBAR_KEYS]);

  type BRow = { field_key: string; deprecated_at: string | null };
  const rowByKey = new Map<string, SidebarGuardRow>(
    ((data ?? []) as BRow[]).map((r) => [
      r.field_key,
      {
        key: r.field_key,
        // Deprecated B row ⇒ synthetic !active / archived so the resolver's
        // base guard returns false — matching the live "skills hidden"
        // behaviour without depending on the canonical batch loader's
        // deprecated-skip (defence in depth: both paths agree).
        active: r.deprecated_at == null,
        archived_at: r.deprecated_at,
        tenant_id: null,
        public_visible: true,
        profile_visible: true,
        internal_only: false,
      },
    ]),
  );
  return resolveSidebarVisibility(ctx, rowByKey);
}

/** The visibility reader pair, exposed so the test + harness can run A and B
 *  side by side via `readFieldSurfaceBoth` without going through the env flag. */
export const sidebarVisibilityReaderPair: FieldSurfaceReaderPair<
  [SupabaseClient | null, string | null],
  SidebarFieldVisibility
> = {
  // T3.2 — System A removed: the legacy `field_definitions` base-guard A-reader
  // was deleted. Both legs read canonical System B (`profile_field_definitions`),
  // synthesizing the base-guard row from `deprecated_at` so the canonical
  // visibility resolver yields the identical decision (incl. the hidden `skills`).
  readA: readSidebarVisibilityFromB,
  readB: readSidebarVisibilityFromB,
};

/**
 * PUBLIC entry — read the public-profile sidebar section visibility for the
 * `public_sidebar` surface. The caller passes its public Supabase client + the
 * host tenant. (T3.2: System A removed — both seam legs read canonical System B
 * `profile_field_definitions`; the visibility decision is unchanged, incl. the
 * deliberately-hidden deprecated `skills` section.)
 */
export function readPublicSidebarVisibility(
  supabase: SupabaseClient | null,
  tenantId: string | null,
): Promise<SidebarFieldVisibility> {
  return readFieldSurface(
    "public_sidebar",
    sidebarVisibilityReaderPair,
    supabase,
    tenantId,
  );
}

