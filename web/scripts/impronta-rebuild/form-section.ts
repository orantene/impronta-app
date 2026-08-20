/**
 * form-section.ts — bind a seeded form to a real `cms_sections` row.
 *
 * WHY THIS EXISTS. `/api/cms/forms/submit` reads `__tulala_section` from the
 * POST body and 400s "Missing section reference." when it is absent, BEFORE
 * any write. The renderer only emits that hidden input when the form node
 * carries `props.sectionId` (render.tsx). The seeded contact form carried no
 * sectionId, so every brief a visitor sent was refused and lost — verified on
 * the live site, both locales, before this module was written.
 *
 * The old code knew: shared.ts said sectionId "must be set to a real
 * cms_sections row id at seed time" and then nothing set it. A comment is not
 * a mechanism. This is the mechanism.
 *
 * It follows the image-slot pattern deliberately — a token in the tree, a
 * resolution pass that runs BEFORE any page is written, and an abort if the
 * token cannot be resolved. A seeder that writes a page whose form cannot
 * submit is worse than a seeder that refuses to run.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Placeholder a page module puts in `form.props.sectionId`.
 *
 * It is UUID-SHAPED rather than a `slot://` token like the image slots use,
 * because the form schema validates `sectionId` as a uuid — a readable token
 * would fail `validateBuilderNodeTree` and the page could never be authored or
 * tested. The value is a valid v4 uuid that no database will ever mint as a
 * row id (all-zero prefix), so it stays unmistakable in a diff while passing
 * the schema. The seeders abort if one survives resolution.
 */
export const FORM_SECTION_SLOT = "00000000-0000-4000-8000-00000000f0f0";

/** How many form nodes in this tree still await a real section id. */
export function countFormSectionSlots(value: unknown): number {
  let n = 0;
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (!v || typeof v !== "object") return;
    for (const entry of Object.values(v as Record<string, unknown>)) {
      if (entry === FORM_SECTION_SLOT) n += 1;
      else walk(entry);
    }
  };
  walk(value);
  return n;
}

/**
 * Swap every slot token for the resolved id. Returns the new tree plus how
 * many tokens survived — a non-zero survivor count is a bug, not a warning.
 */
export function applyFormSectionResolution<T>(
  tree: T,
  sectionId: string,
): { tree: T; unresolved: number } {
  const swap = (v: unknown): unknown => {
    if (v === FORM_SECTION_SLOT) return sectionId;
    if (Array.isArray(v)) return v.map(swap);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, entry] of Object.entries(v as Record<string, unknown>)) {
        out[k] = swap(entry);
      }
      return out;
    }
    return v;
  };
  const next = swap(tree) as T;
  return { tree: next, unresolved: countFormSectionSlots(next) };
}

/**
 * The tenant's live form-intake section, or null.
 *
 * Only a NON-archived row counts: the endpoint itself refuses archived
 * sections ("Form is no longer accepting submissions"), so resolving to one
 * would reproduce the same silent dead-end in a different colour. Oldest first
 * so re-seeds keep pointing at the same row rather than drifting between
 * duplicates.
 */
export async function resolveFormSectionId(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("cms_sections")
    .select("id, status, created_at")
    .eq("tenant_id", tenantId)
    .eq("section_type_key", "contact_form")
    .neq("status", "archived")
    .order("created_at", { ascending: true })
    .limit(1);
  const row = (data ?? [])[0] as { id: string } | undefined;
  return row?.id ?? null;
}

/** The abort message, kept here so both seeders phrase it identically. */
export function describeMissingFormSection(tenant: string): string {
  return [
    `Tenant ${tenant} has no usable contact_form section, and a page in this seed contains a form.`,
    `Without one the form renders but every submission is refused with 400 "Missing section reference."`,
    `Create a contact_form section for the tenant (Website → Sections), then re-run.`,
  ].join("\n");
}
