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
const OLD_TO_NEW_KEY: Record<string, string> = Object.fromEntries(
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
// ---------------------------------------------------------------------------
export async function mirrorWriteToCanonical(
  supabase: MirrorSupabase,
  legacyKey: string,
  talentProfileId: string,
  value: unknown, // text | number | boolean | null
): Promise<void> {
  const newKey = OLD_TO_NEW_KEY[legacyKey];
  if (!newKey) return; // not in the 17-key bridge — no-op

  try {
    const { data: newDef, error: defErr } = await supabase
      .from("profile_field_definitions")
      .select("id")
      .eq("field_key", newKey)
      .maybeSingle();
    if (defErr) {
       
      console.warn("[mirrorWriteToCanonical] def lookup failed", { newKey, error: defErr });
      return;
    }
    if (!newDef) return;
    const fieldDefinitionId = newDef.id as string;

    if (value === null || value === undefined) {
      const { error: delErr } = await supabase
        .from("talent_profile_field_values")
        .delete()
        .eq("talent_profile_id", talentProfileId)
        .eq("field_definition_id", fieldDefinitionId);
      if (delErr) {
         
        console.warn("[mirrorWriteToCanonical] delete failed", { newKey, error: delErr });
      }
      return;
    }

    // Resolve tenant_id the same way P5-β's backfill migration does
    // (first active roster row, deterministic by created_at ASC).
    // tenant_id is nullable on talent_profile_field_values — freelance /
    // orphan talent (no active roster) writes with tenant_id = NULL.
    const { data: rosterRow } = await supabase
      .from("agency_talent_roster")
      .select("tenant_id, created_at")
      .eq("talent_profile_id", talentProfileId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const tenantId = (rosterRow?.tenant_id ?? null) as string | null;

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
       
      console.warn("[mirrorWriteToCanonical] upsert failed", { newKey, error: upErr });
    }
  } catch (err) {
     
    console.warn("[mirrorWriteToCanonical] unexpected error", { legacyKey, err });
  }
}
