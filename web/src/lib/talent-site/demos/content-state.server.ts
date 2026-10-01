import "server-only";

/**
 * I/O half of the reference-demo content step: read the rows a demo holds
 * (`loadContentSnapshot`, also the backup), apply a fixture's planned writes
 * (`applyReferenceContent`) and put a backup back (`restoreContentSnapshot`).
 * Every entry point asserts the demo guard first and never touches a talent
 * that is not a registry demo. Planning lives in fixture-plan.ts (pure).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PROFILE_COLUMNS, planContentRestore, TABLE_SPECS, type ContentSnapshot } from "./content-restore";
import { loadDemoContentFixture } from "./content-fixture";
import {
  CONTENT_FIELD_KEYS,
  desiredLanguages,
  fixtureSkipped,
  planFaqOps,
  planFieldValues,
  planLanguages,
  planOfferingOps,
  planProfilePatch,
  type ChildOps,
  type ExistingOffering,
} from "./fixture-plan";
import { assertDemoTarget } from "./guard.server";
import type { DemoRegistryEntry, DemoStepId } from "./types";

type Admin = SupabaseClient;
type Row = Record<string, unknown>;

async function rows(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as Row[] | null) ?? [];
}

/** Read every row the content step can change, plus the field-key map of the touched definitions. */
export async function loadContentSnapshot(
  admin: Admin,
  tpId: string,
): Promise<{ snapshot: ContentSnapshot; fieldKeyById: Map<string, string> }> {
  const offerings = await rows(admin.from("talent_offerings").select("*").eq("talent_profile_id", tpId).order("sort_order"));
  const ids = offerings.map((o) => o.id as string);
  const byOffering = async (table: string) => (ids.length ? rows(admin.from(table).select("*").in("offering_id", ids)) : []);
  const defs = await rows(admin.from("profile_field_definitions").select("id, field_key").in("field_key", [...CONTENT_FIELD_KEYS]));
  const fieldKeyById = new Map(defs.map((d) => [d.id as string, d.field_key as string]));
  const defIds = [...fieldKeyById.keys()];
  const [media, variants, addons, faq, fields, languages, location, profile] = await Promise.all([
    byOffering("talent_offering_media"),
    byOffering("talent_offering_variants"),
    byOffering("talent_offering_addons"),
    rows(admin.from("talent_faq_items").select("*").eq("talent_profile_id", tpId).order("sort_order")),
    defIds.length
      ? rows(admin.from("talent_profile_field_values").select("*").eq("talent_profile_id", tpId).in("field_definition_id", defIds))
      : [],
    rows(admin.from("talent_languages").select("*").eq("talent_profile_id", tpId)),
    rows(admin.from("talent_location_settings").select("*").eq("talent_profile_id", tpId)),
    rows(admin.from("talent_profiles").select(PROFILE_COLUMNS.join(", ")).eq("id", tpId)),
  ]);
  return {
    snapshot: {
      talent_offerings: offerings,
      talent_offering_media: media,
      talent_offering_variants: variants,
      talent_offering_addons: addons,
      talent_faq_items: faq,
      talent_profile_field_values: fields,
      talent_languages: languages,
      talent_location_settings: location,
      talent_profiles: profile,
    },
    fieldKeyById,
  };
}

const must = (e: { message: string } | null, what: string) => {
  if (e) throw new Error(`${what}: ${e.message}`);
};

async function writeChildren(admin: Admin, table: string, offeringId: string, ops: ChildOps | Row[]) {
  const c: ChildOps = Array.isArray(ops) ? { insert: ops, update: [], delete: [] } : ops;
  if (c.insert.length) {
    const { error } = await admin.from(table).insert(c.insert.map((r) => ({ ...r, offering_id: offeringId })));
    must(error, table);
  }
  for (const u of c.update) {
    const { error } = await admin.from(table).update({ ...u.patch, updated_at: new Date().toISOString() }).eq("id", u.id);
    must(error, table);
  }
  if (c.delete.length) {
    const { error } = await admin.from(table).delete().in("id", c.delete);
    must(error, table);
  }
}

export interface ReferenceContentResult {
  changed: DemoStepId[];
  skipped: string[];
}

/**
 * Apply a REFERENCE demo's mockup content (tagline, bio, city, languages,
 * services, FAQ, height). Plans first from the live rows; `write: false` only
 * reports. A second run on applied state plans nothing.
 */
export async function applyReferenceContent(
  admin: Admin,
  entry: DemoRegistryEntry,
  opts: { write: boolean; hubTenantId: string },
): Promise<ReferenceContentResult> {
  if (!entry.reference || !entry.contentFixture) return { changed: [], skipped: [] };
  const target = await assertDemoTarget(admin, entry.profileCode);
  if (!target.ok) throw new Error(`REFUSE: ${target.reason}`);
  const tpId = target.talentProfileId;
  const fixture = loadDemoContentFixture(entry.contentFixture);
  const { snapshot, fieldKeyById } = await loadContentSnapshot(admin, tpId);

  const existing: ExistingOffering[] = snapshot.talent_offerings.map((o) => ({
    ...(o as ExistingOffering),
    variants: snapshot.talent_offering_variants.filter((v) => v.offering_id === o.id),
    addons: snapshot.talent_offering_addons.filter((a) => a.offering_id === o.id),
  }));
  const offerings = planOfferingOps(fixture, existing);
  const faq = planFaqOps(fixture.faq.items, snapshot.talent_faq_items);
  const haveFields = new Map(snapshot.talent_profile_field_values.map((r) => [fieldKeyById.get(r.field_definition_id as string) ?? "", r.value]));
  const fields = planFieldValues(fixture, haveFields);
  const languages = planLanguages(desiredLanguages(fixture), snapshot.talent_languages);
  const profilePatch = planProfilePatch(fixture, snapshot.talent_profiles[0] ?? {});

  const dirty =
    offerings.length > 0 ||
    faq.length > 0 ||
    fields.length > 0 ||
    languages.upsert.length > 0 ||
    languages.remove.length > 0 ||
    Object.keys(profilePatch).length > 0;
  const skipped = fixtureSkipped(fixture);
  if (!dirty) return { changed: [], skipped };
  if (!opts.write) return { changed: ["content"], skipped };

  const now = new Date().toISOString();
  for (const op of offerings) {
    if (op.op === "insert") {
      const { data, error } = await admin
        .from("talent_offerings")
        .insert({
          talent_profile_id: tpId,
          tenant_id: opts.hubTenantId,
          kind: "service",
          owner_kind: "talent",
          first_published_at: now,
          ...op.row,
        })
        .select("id")
        .single();
      must(error, "talent_offerings");
      const id = (data as { id: string }).id;
      await writeChildren(admin, "talent_offering_variants", id, op.variants);
      await writeChildren(admin, "talent_offering_addons", id, op.addons);
    } else if (op.op === "update") {
      if (Object.keys(op.patch).length) {
        const { error } = await admin.from("talent_offerings").update({ ...op.patch, updated_at: now }).eq("id", op.id).eq("talent_profile_id", tpId);
        must(error, "talent_offerings");
      }
      await writeChildren(admin, "talent_offering_variants", op.id, op.variants);
      await writeChildren(admin, "talent_offering_addons", op.id, op.addons);
    } else {
      const { error } = await admin.from("talent_offerings").update({ status: "archived", updated_at: now }).eq("id", op.id).eq("talent_profile_id", tpId);
      must(error, "talent_offerings");
    }
  }
  for (const op of faq) {
    const q =
      op.op === "insert"
        ? admin.from("talent_faq_items").insert({ talent_profile_id: tpId, ...op.row })
        : admin
            .from("talent_faq_items")
            .update(op.op === "update" ? { ...op.patch, updated_at: now } : { status: "draft", updated_at: now })
            .eq("id", op.id)
            .eq("talent_profile_id", tpId);
    const { error } = await q;
    must(error, "talent_faq_items");
  }
  if (fields.length) {
    const idByKey = new Map([...fieldKeyById].map(([id, k]) => [k, id]));
    for (const [key, value] of fields) {
      const defId = idByKey.get(key);
      if (!defId) throw new Error(`field definition ${key} is missing`);
      const { error } = await admin.from("talent_profile_field_values").upsert(
        {
          tenant_id: opts.hubTenantId,
          talent_profile_id: tpId,
          field_definition_id: defId,
          value,
          workflow_state: "live",
          last_edited_role: "platform",
          updated_at: now,
        },
        { onConflict: "talent_profile_id,field_definition_id" },
      );
      must(error, "talent_profile_field_values");
    }
  }
  if (languages.remove.length) {
    const { error } = await admin.from("talent_languages").delete().eq("talent_profile_id", tpId).in("language_code", languages.remove);
    must(error, "talent_languages");
  }
  if (languages.upsert.length) {
    const { error } = await admin
      .from("talent_languages")
      .upsert(languages.upsert.map((l) => ({ talent_profile_id: tpId, ...l })), { onConflict: "talent_profile_id,language_code" });
    must(error, "talent_languages");
  }
  if (Object.keys(profilePatch).length) {
    const { error } = await admin.from("talent_profiles").update({ ...profilePatch, updated_at: now }).eq("id", tpId);
    must(error, "talent_profiles");
  }
  return { changed: ["content"], skipped };
}

/** Put a backup's content rows back. Asserts the guard; a missing/old snapshot restores nothing. */
export async function restoreContentSnapshot(admin: Admin, profileCode: string, before: ContentSnapshot | undefined): Promise<void> {
  if (!before) return;
  const target = await assertDemoTarget(admin, profileCode);
  if (!target.ok) throw new Error(`REFUSE: ${target.reason}`);
  const { snapshot: current } = await loadContentSnapshot(admin, target.talentProfileId);
  for (const op of planContentRestore(before, current)) {
    if (op.kind === "patch") {
      const { error } = await admin.from("talent_profiles").update(op.patch).eq("id", target.talentProfileId);
      must(error, "talent_profiles");
    } else if (op.kind === "upsert") {
      const { error } = await admin.from(op.table).upsert(op.row, { onConflict: TABLE_SPECS[op.table].onConflict });
      must(error, op.table);
    } else {
      let q = admin.from(op.table).delete();
      for (const [k, v] of Object.entries(op.key)) q = q.eq(k, v as string);
      const { error } = await q;
      must(error, op.table);
    }
  }
}
