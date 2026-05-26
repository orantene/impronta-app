// ============================================================================
// legacy-mirror.ts — Canonical → legacy field-value bridge.
//
// The new catalog persists to `talent_profile_field_values`; Discover, the
// directory facet filters, and a few legacy surfaces still read the OLD
// `field_values` + `field_definitions` tables. Until the Phase 5 cutover
// drops the old tables, every canonical write must mirror to legacy for the
// bridged keys so those surfaces stay in sync.
//
// This was previously a private helper inside admin-talent-field-values.ts
// (admin write path only). Extracted here so the talent self-edit path
// (talent-field-values-catalog.ts) shares the SAME proven bridge — closing
// the split-brain where talent self-edits never reached Discover.
//
// NOT a "use server" module — it's a plain helper imported by the server
// actions. Behavior is byte-identical to the original admin-only helper.
// When the OLD tables are dropped this whole file becomes a no-op and can
// be deleted alongside its call sites.
// ============================================================================

import { improntaLog } from "@/lib/server/structured-log";
import { logServerError } from "@/lib/server/safe-error";

// Reverse map of the migration's KEY_BRIDGE (new field_key → old key).
// Only includes keys whose old equivalent existed; new-only keys have no
// mirror. When the OLD tables are dropped (Phase 5 cutover), this map
// becomes a no-op and can be removed alongside this function.
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

export async function mirrorWriteToLegacy(
  supabase: MirrorSupabase,
  newKind: string,
  talentProfileId: string,
  newFieldKey: string | undefined,
  value: unknown,
): Promise<void> {
  if (!newFieldKey) return;
  const oldKey = NEW_TO_OLD_KEY[newFieldKey];
  if (!oldKey) return;

  const { data: oldDef } = await supabase
    .from("field_definitions")
    .select("id, value_type")
    .eq("key", oldKey)
    .maybeSingle();
  if (!oldDef) return;

  if (value === null || value === undefined) {
    await supabase
      .from("field_values")
      .delete()
      .eq("talent_profile_id", talentProfileId)
      .eq("field_definition_id", oldDef.id);
    return;
  }

  // Coerce jsonb value to typed columns based on the OLD field's value_type.
  const row: Record<string, unknown> = {
    talent_profile_id: talentProfileId,
    field_definition_id: oldDef.id,
    value_text: null,
    value_number: null,
    value_boolean: null,
    value_date: null,
  };
  const ot = oldDef.value_type as string;
  if (ot === "text" || ot === "textarea") {
    row.value_text = typeof value === "string" ? value : String(value);
  } else if (ot === "number") {
    row.value_number = typeof value === "number" ? value : Number(value);
  } else if (ot === "boolean") {
    row.value_boolean = value === true;
  } else if (ot === "date") {
    row.value_date = typeof value === "string" ? value : null;
  } else {
    // taxonomy / location — out of scope for the bridge
    return;
  }
  // Suppress unused-arg warning — newKind reserved for future divergent
  // coercion (e.g. chips → array on a text column).
  void newKind;

  await supabase
    .from("field_values")
    .upsert(row, {
      onConflict: "talent_profile_id,field_definition_id",
    });
}

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
            .select("id, field_key")
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
    for (const row of (defsR.data ?? []) as Array<{ id: string; field_key: string }>) {
      if (row?.id && row?.field_key) defIdByNewKey.set(row.field_key, row.id);
    }
    const tenantId = ((rosterR as { data?: { tenant_id?: string | null } | null })?.data?.tenant_id ?? null) as
      | string
      | null;
    return { defIdByNewKey, tenantId };
  } catch (err) {
    void improntaLog("legacy_mirror.prefetch_failed", {
      talentProfileId,
      error_message: err instanceof Error ? err.message : String(err),
    });
    return empty;
  }
}

export async function mirrorWriteToCanonical(
  supabase: MirrorSupabase,
  legacyKey: string,
  talentProfileId: string,
  value: unknown, // text | number | boolean | null
  context?: MirrorCanonicalContext,
): Promise<void> {
  const newKey = OLD_TO_NEW_KEY[legacyKey];
  if (!newKey) return; // not in the 17-key bridge — no-op

  try {
    // Def id resolution — from context if provided, otherwise inline lookup
    // (preserves the original single-call behavior).
    let fieldDefinitionId: string | null = null;
    if (context) {
      fieldDefinitionId = context.defIdByNewKey.get(newKey) ?? null;
      if (!fieldDefinitionId) return; // not in catalog — no-op (same as inline path's `if (!newDef) return`)
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
        return;
      }
      if (!newDef) return;
      fieldDefinitionId = newDef.id as string;
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
      return;
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
          value,
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
  } catch (err) {
    logServerError(`legacy_mirror.unexpected[${legacyKey}]`, err);
  }
}
