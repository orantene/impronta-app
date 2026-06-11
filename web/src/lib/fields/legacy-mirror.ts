// ============================================================================
// legacy-mirror.ts — legacy ⇄ canonical field-value bridge.
//
// HISTORY: this module used to hold a BI-directional bridge between the OLD
// `field_values` (System A) and the NEW `talent_profile_field_values`
// (System B) tables. T2.6 step 3 removed the B→A leg (`mirrorWriteToLegacy`)
// entirely — the product write paths now write System B ONLY and System A is
// frozen. What remains is the FORWARD bridge:
//
//   • `mirrorWriteToCanonical` (A→B) — under the default B-first write source
//     this is the PRIMARY System B write helper (it does the slug→label vocab
//     translation + delete-on-null + workflow_state/role). Still used by the
//     shell write path (B-first), the admin/talent kill-switch A-first path,
//     and the reconcile cron's A→B heal.
//   • `NEW_TO_OLD_KEY` / `OLD_TO_NEW_KEY` — the 17-key A↔B bridge maps, still
//     consumed by many read-source modules (directory cards/facets/search,
//     ai-search-doc, dashboard-nav, public-surface-visibility, …) and the
//     reconcile cron.
//
// NOT a "use server" module — a plain helper imported by the server actions.
// When System A is dropped (Phase 3) this whole file can be deleted alongside
// its remaining call sites.
// ============================================================================

import { improntaLog } from "@/lib/server/structured-log";
import { logServerError } from "@/lib/server/safe-error";
import { matchLabelOption } from "@/lib/fields/coerce-select-value";

// The 17-key A↔B bridge: canonical (new) field_key → legacy (old) field key.
// Only includes keys whose legacy equivalent existed; new-only keys are absent.
// Still consumed by the surviving forward bridge (`mirrorWriteToCanonical`),
// the reconcile cron, and many read-source modules. Removable only when System
// A is dropped (Phase 3).
export const NEW_TO_OLD_KEY: Record<string, string> = {
  "physical.body_type":     "body_type",
  "physical.dress_size":    "clothing_size",
  "identity.dob":           "date_of_birth",
  "physical.eye_color":     "eye_color",
  "physical.hair_color":    "hair_color",
  "physical.hair_length":   "hair_length",
  "physical.height_cm":     "height_cm",
  "physical.shoe_size_eu":  "shoe_size",
  "experience.years_total": "years_experience",
  "experience.level":                  "experience_level",
  "experience.notable_work":           "notable_work",
  "experience.professional_highlights":"professional_highlights",
  "availability.status":               "availability_status",
  "availability.available_for":        "available_for",
  "travel.willing":                    "willing_to_travel",
  "travel.scope":                      "travel_scope",
  "media.website_url":                 "website_url",
};

// Helper-local supabase typing. The real client carries deep generics
// that fight TS in this narrow scope; we already validate at the call
// sites — `any` keeps the helper readable and isolated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MirrorSupabase = any;

// NOTE: `mirrorWriteToLegacy` (the B→A reverse mirror) was DELETED in T2.6
// step 3. The product write paths now write System B only; System A
// `field_values` is frozen. The forward bridge (`mirrorWriteToCanonical`,
// below) is retained.

// Reverse map (legacy key → canonical key) for the canonical-mirror.
// Derived once from NEW_TO_OLD_KEY so the two stay in lockstep.
export const OLD_TO_NEW_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(NEW_TO_OLD_KEY).map(([newKey, oldKey]) => [oldKey, newKey]),
);

// ---------------------------------------------------------------------------
// mirrorWriteToCanonical — legacy → canonical bridge (Phase 5-γ).
//
// `syncProfileShellDynFieldValues` (talent self-edit shell + admin shell)
// writes ONLY to legacy `field_values`. For the 17 bridged keys, every NEW
// shell edit drifts canonical `talent_profile_field_values`. P5-β backfilled
// the historical data; this helper closes the forward drift by mirroring
// each shell write into canonical as well.
//
// Fire-and-forget semantically — errors are logged + swallowed so a failed
// canonical mirror never blocks the legacy write the caller already trusts.
// When the OLD tables are dropped (Phase 5 cutover), the call sites should
// be flipped to write canonical-first and this whole bridge can be deleted.
//
// PERFORMANCE — batching context (§11.2 active gap, fixed):
//   - The single-call path does 2 DB round-trips for lookups (def id +
//     tenant id) before the upsert. A shell save touching all 17 bridged
//     keys without batching = 51 round-trips (3 per key).
//   - Callers that handle a batch of edits (the shell sync loop) should
//     hoist the lookups via `prefetchMirrorCanonicalContext` and pass the
//     returned context to each `mirrorWriteToCanonical` call. That drops
//     the 17-key save to 2 + 17×1 = 19 round-trips. Backwards compatible:
//     when `context` is omitted, the helper falls back to the original
//     per-call lookup path.
// ---------------------------------------------------------------------------

/** Hoisted lookup result returned by `prefetchMirrorCanonicalContext`. The
 *  single-call helper builds an equivalent context inline when context is
 *  omitted — the two paths are byte-identical from the resulting upsert's
 *  point of view. */
export type MirrorCanonicalContext = {
  /** Pre-resolved `profile_field_definitions.id` per canonical (new) field
   *  key. Keys for which no def was found are absent from the map; the
   *  helper no-ops those entries (same as the single-call path). */
  defIdByNewKey: Map<string, string>;
  /** Pre-resolved tenant_id for this talent — first active roster row by
   *  `created_at asc`. Null for freelance/orphan talent (no active roster);
   *  the upsert proceeds with tenant_id = NULL (canonical column is
   *  nullable). */
  tenantId: string | null;
  /** Canonical (System B) select option labels per new field key, used to
   *  translate the incoming legacy slug into B's label vocabulary. Absent /
   *  empty for non-select keys. Hoisted here so the batch path needs no extra
   *  per-write lookup. */
  labelsByNewKey: Map<string, string[]>;
};

/** Prefetch the def-id lookup + tenant resolution that
 *  `mirrorWriteToCanonical` needs. Call ONCE before a batch loop, pass the
 *  returned context to every mirror call. Errors are logged + swallowed
 *  (same fire-and-forget contract as the helper itself); if the prefetch
 *  fails the returned context is empty and the per-call path will still
 *  attempt the lookups (degrades gracefully, not faster but not broken).
 *  `legacyKeys` is the list of LEGACY keys the caller is about to edit —
 *  unbridged keys are skipped from the def lookup. */
export async function prefetchMirrorCanonicalContext(
  supabase: MirrorSupabase,
  talentProfileId: string,
  legacyKeys: readonly string[],
): Promise<MirrorCanonicalContext> {
  const empty: MirrorCanonicalContext = {
    defIdByNewKey: new Map(),
    tenantId: null,
    labelsByNewKey: new Map(),
  };
  try {
    // Translate the legacy keys the caller cares about to canonical keys
    // (filtering unbridged ones out).
    const newKeys = legacyKeys
      .map((k) => OLD_TO_NEW_KEY[k])
      .filter((k): k is string => typeof k === "string");
    if (newKeys.length === 0) {
      // No bridged keys in this batch — still resolve tenant since the
      // caller may pass single calls into this context later.
    }

    const [defsR, rosterR] = await Promise.all([
      newKeys.length > 0
        ? supabase
            .from("profile_field_definitions")
            .select("id, field_key, kind, options")
            .in("field_key", newKeys)
        : Promise.resolve({ data: [] as Array<{ id: string; field_key: string }>, error: null }),
      supabase
        .from("agency_talent_roster")
        .select("tenant_id, created_at")
        .eq("talent_profile_id", talentProfileId)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    const defIdByNewKey = new Map<string, string>();
    const labelsByNewKey = new Map<string, string[]>();
    for (const row of (defsR.data ?? []) as Array<{
      id: string;
      field_key: string;
      kind?: string;
      options?: unknown;
    }>) {
      if (row?.id && row?.field_key) {
        defIdByNewKey.set(row.field_key, row.id);
        if (row.kind === "select" && Array.isArray(row.options)) {
          labelsByNewKey.set(row.field_key, (row.options as unknown[]).map((o) => String(o)));
        }
      }
    }
    const tenantId = ((rosterR as { data?: { tenant_id?: string | null } | null })?.data?.tenant_id ?? null) as
      | string
      | null;
    return { defIdByNewKey, tenantId, labelsByNewKey };
  } catch (err) {
    void improntaLog("legacy_mirror.prefetch_failed", {
      talentProfileId,
      error_message: err instanceof Error ? err.message : String(err),
    });
    return empty;
  }
}

/**
 * Outcome of a `mirrorWriteToCanonical` call.
 *
 *   - status "noop"     — key not bridged or no catalog def; B untouched.
 *   - status "deleted"  — the canonical row was deleted (value was null/empty).
 *   - status "upserted" — `bValue` is the value persisted to B (the translated
 *                         label for selects, or the coerced scalar otherwise)
 *                         AND `newKey` is the canonical field key.
 *
 * `bValue` originally fed the B→A reverse mirror (deleted in T2.6 step 3) so the
 * slug→label vocab round-trip had a single source of truth. The current callers
 * ignore the return (they call this helper for its System-B write side-effect),
 * so it is retained only as informational diagnostic output.
 */
export type MirrorCanonicalResult =
  | { status: "noop" }
  | { status: "deleted"; newKey: string }
  | { status: "upserted"; newKey: string; bValue: unknown };

export async function mirrorWriteToCanonical(
  supabase: MirrorSupabase,
  legacyKey: string,
  talentProfileId: string,
  value: unknown, // text | number | boolean | null
  context?: MirrorCanonicalContext,
): Promise<MirrorCanonicalResult> {
  const newKey = OLD_TO_NEW_KEY[legacyKey];
  if (!newKey) return { status: "noop" }; // not in the 17-key bridge — no-op

  try {
    // Def id resolution — from context if provided, otherwise inline lookup
    // (preserves the original single-call behavior).
    let fieldDefinitionId: string | null = null;
    if (context) {
      fieldDefinitionId = context.defIdByNewKey.get(newKey) ?? null;
      if (!fieldDefinitionId) return { status: "noop" }; // not in catalog — no-op (same as inline path's `if (!newDef) return`)
    } else {
      const { data: newDef, error: defErr } = await supabase
        .from("profile_field_definitions")
        .select("id")
        .eq("field_key", newKey)
        .maybeSingle();
      if (defErr) {
        void improntaLog("legacy_mirror.def_lookup_failed", {
          newKey,
          error_message: defErr.message ?? String(defErr),
        });
        return { status: "noop" };
      }
      if (!newDef) return { status: "noop" };
      fieldDefinitionId = newDef.id as string;
    }

    // Translate the incoming legacy (System A) slug into the canonical
    // (System B) option *label* so the catalog editor's select chip
    // highlights correctly. The two catalogs use different vocabularies
    // (A = slug, B = label); copying the slug verbatim leaves the chip
    // un-highlighted. Resolve case/slug drift against B's option labels;
    // pass through unchanged when the field isn't a select or nothing matches
    // (never worse than the verbatim copy this replaced).
    let outValue = value;
    if (typeof value === "string" && value.length > 0) {
      let labels = context?.labelsByNewKey.get(newKey) ?? null;
      if (!labels && !context) {
        const { data: catDef } = await supabase
          .from("profile_field_definitions")
          .select("kind, options")
          .eq("id", fieldDefinitionId)
          .maybeSingle();
        labels =
          catDef && catDef.kind === "select" && Array.isArray(catDef.options)
            ? (catDef.options as unknown[]).map((o) => String(o))
            : null;
      }
      if (labels) {
        const matched = matchLabelOption(labels, value);
        if (matched) outValue = matched;
      }
    }

    if (value === null || value === undefined) {
      const { error: delErr } = await supabase
        .from("talent_profile_field_values")
        .delete()
        .eq("talent_profile_id", talentProfileId)
        .eq("field_definition_id", fieldDefinitionId);
      if (delErr) {
        void improntaLog("legacy_mirror.delete_failed", {
          newKey,
          error_message: delErr.message ?? String(delErr),
        });
      }
      return { status: "deleted", newKey };
    }

    // Tenant id resolution — from context if provided, otherwise inline.
    // Same behavior either way: first active roster row by created_at asc,
    // null for freelance/orphan talent.
    let tenantId: string | null;
    if (context) {
      tenantId = context.tenantId;
    } else {
      const { data: rosterRow } = await supabase
        .from("agency_talent_roster")
        .select("tenant_id, created_at")
        .eq("talent_profile_id", talentProfileId)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      tenantId = (rosterRow?.tenant_id ?? null) as string | null;
    }

    const { error: upErr } = await supabase
      .from("talent_profile_field_values")
      .upsert(
        {
          tenant_id: tenantId,
          talent_profile_id: talentProfileId,
          field_definition_id: fieldDefinitionId,
          value: outValue,
          workflow_state: "live",
          last_edited_role: "platform",
        },
        { onConflict: "talent_profile_id,field_definition_id" },
      );
    if (upErr) {
      void improntaLog("legacy_mirror.upsert_failed", {
        newKey,
        error_message: upErr.message ?? String(upErr),
      });
    }
    // `bValue` is the value persisted to B (translated label for selects, the
    // coerced scalar otherwise). It originally fed the B→A reverse mirror
    // (deleted in T2.6 step 3); now informational only. Returned regardless of
    // `upErr` (fire-and-forget: a failed B-write is logged + the reconcile cron
    // is the backstop).
    return { status: "upserted", newKey, bValue: outValue };
  } catch (err) {
    logServerError(`legacy_mirror.unexpected[${legacyKey}]`, err);
  }
  // Unexpected error already logged + swallowed (fire-and-forget); report noop
  // so a B-first caller skips the reverse mirror for this key rather than
  // syncing A off an unknown B state.
  return { status: "noop" };
}
