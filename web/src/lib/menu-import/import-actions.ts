"use server";

/**
 * import-actions.ts — preview a menu import, then apply the plan a human saw.
 *
 * TWO ACTIONS, NEVER ONE. `previewMenuImport` returns the plan and writes
 * nothing; `applyMenuImport` writes. 117 rows is far past what a person can
 * audit after the fact, so the confirm step is the product, not a flag.
 *
 * THE PLAN IS NEVER SENT BACK BY THE CLIENT. Apply re-reads the file, re-parses
 * and re-plans server-side, then writes what IT computed. A client-supplied plan
 * is a client-supplied price list — the same lesson as the payInPerson flag the
 * order engine used to trust.
 */

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { parseRestauradminMenu, type ImportedMenu } from "./parse-restauradmin";
import { planMenuImport, SOURCE_ID_KEY, type ExistingOffering, type ImportPlan } from "./plan-import";

/** A menu export is bigger than a form post and smaller than a file upload. */
const MAX_SOURCE_BYTES = 2_000_000;

export type PreviewResult =
  | { ok: true; plan: ImportPlan }
  | { ok: false; error: string };

export type ApplyResult =
  | { ok: true; created: number; updated: number; skipped: number }
  | { ok: false; error: string };

type Auth = { ok: true; tenantId: string } | { ok: false; error: string };

async function authorize(tenantId: string): Promise<Auth> {
  const staff = await requireWorkspaceStaffAction();
  if (!staff.ok) return { ok: false, error: staff.error };
  if (staff.tenantId !== tenantId) {
    return { ok: false, error: "Not authorized for this workspace." };
  }
  return { ok: true, tenantId: staff.tenantId };
}

function parseSource(source: string): { ok: true; doc: unknown } | { ok: false; error: string } {
  if (typeof source !== "string" || !source.trim()) {
    return { ok: false, error: "Paste a menu export first." };
  }
  if (source.length > MAX_SOURCE_BYTES) {
    return { ok: false, error: "That export is too large to import here." };
  }
  try {
    return { ok: true, doc: JSON.parse(source) };
  } catch {
    // Named, not "invalid input": an operator who pasted half a file needs to
    // know it was the JSON and not their permissions.
    return { ok: false, error: "That file is not valid JSON." };
  }
}

/**
 * Every workspace-owned offering, as the planner needs it.
 *
 * Includes rows WITHOUT a source id on purpose: the planner must see a
 * hand-typed item to know it is not an orphan, and must never claim it.
 */
async function loadExisting(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string,
): Promise<ExistingOffering[]> {
  const { data, error } = await admin
    .from("talent_offerings")
    .select("id, title, amount_cents, currency, category, attributes")
    .eq("tenant_id", tenantId)
    .eq("owner_kind", "workspace");
  if (error) {
    logServerError("menuImport.loadExisting", error);
    throw error;
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    title: typeof r.title === "string" ? r.title : "",
    amountCents: typeof r.amount_cents === "number" ? r.amount_cents : null,
    currency: typeof r.currency === "string" ? r.currency : "",
    category: typeof r.category === "string" ? r.category : null,
    attributes:
      r.attributes && typeof r.attributes === "object"
        ? (r.attributes as Record<string, unknown>)
        : null,
  }));
}

/** Read-only. Shows what WOULD happen; writes nothing, ever. */
export async function previewMenuImport(
  tenantId: string,
  source: string,
): Promise<PreviewResult> {
  try {
    const auth = await authorize(tenantId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const parsed = parseSource(source);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Database not available." };

    const menu = parseRestauradminMenu(parsed.doc);
    if (menu.items.length === 0 && menu.refused.length === 0) {
      return { ok: false, error: "No menu items found in that file." };
    }
    return { ok: true, plan: planMenuImport(menu, await loadExisting(admin, tenantId)) };
  } catch (error) {
    logServerError("menuImport.preview", error);
    return { ok: false, error: "Could not read that menu." };
  }
}

/**
 * Apply the plan this server computes from the same source.
 *
 * Per row: upsert the offering keyed on `attributes.source_id`, then replace its
 * variants and add-ons. `unchanged` rows are skipped rather than rewritten, so a
 * re-import of an untouched menu costs nothing and leaves `updated_at` alone.
 */
/**
 * THE WRITE PATH, callable without a staff session.
 *
 * Split out of `applyMenuImport` because provisioning cannot call that action:
 * it opens with `requireWorkspaceStaffAction()`, and during signup there is no
 * staff session — the workspace is being created and its owner has no
 * membership yet. That is why a menu import has only ever been reachable by a
 * human finding an admin panel, and why a brief carrying a menu link produced
 * no menu.
 *
 * TAKES AN ALREADY-AUTHORISED TENANT ID. It performs no authorisation of its
 * own, on purpose: a function that both writes and decides who may write is one
 * that gets called from somewhere new and quietly authorises it. Both callers
 * establish the right to write BEFORE calling — the action through
 * `requireWorkspaceStaffAction`, provisioning by having just created the
 * workspace itself.
 */
export async function applyParsedMenu(
  admin: ReturnType<typeof createServiceRoleClient> & object,
  tenantId: string,
  menu: ImportedMenu,
): Promise<ApplyResult> {
  const plan = planMenuImport(menu, await loadExisting(admin, tenantId));
  const itemBySource = new Map(menu.items.map((i) => [i.sourceId, i]));

  let created = 0;
  let updated = 0;
  const skipped = plan.counts.unchanged;

  for (const row of plan.rows) {
    if (row.action === "unchanged") continue;
    const item = itemBySource.get(row.sourceId);
    if (!item) continue;

    const patch = {
      tenant_id: tenantId,
      owner_kind: "workspace",
      talent_profile_id: null,
      kind: "product",
      title: item.title.es || item.title.en,
      description: item.description.es || item.description.en || null,
      title_i18n: { es: item.title.es, en: item.title.en },
      description_i18n: { es: item.description.es, en: item.description.en },
      category: item.category,
      // VERBATIM minor units. See parse-restauradmin's header: multiplying
      // here would price the whole menu a hundred times high.
      amount_cents: item.amountCents,
      currency: item.currency,
      price_type: "flat_package",
      // A tier-only item has no buyable base price, so it is quoted rather
      // than showing a number a customer cannot actually pay.
      price_display: item.amountCents == null ? "quote" : "exact",
      booking_mode: "request",
      status: "draft",
      moderation_state: "approved",
      visibility: "public",
      attributes: { [SOURCE_ID_KEY]: item.sourceId },
      updated_at: new Date().toISOString(),
    };

    let offeringId = row.offeringId;
    if (offeringId) {
      const { error } = await admin
        .from("talent_offerings")
        .update(patch)
        .eq("id", offeringId)
        .eq("tenant_id", tenantId)
        .eq("owner_kind", "workspace");
      if (error) {
        logServerError("menuImport.update", error);
        return { ok: false, error: `Could not update ${patch.title}.` };
      }
      updated += 1;
    } else {
      const { data, error } = await admin
        .from("talent_offerings")
        .insert(patch)
        .select("id")
        .maybeSingle();
      if (error || !data) {
        logServerError("menuImport.insert", error);
        return { ok: false, error: `Could not create ${patch.title}.` };
      }
      offeringId = String((data as { id: string }).id);
      created += 1;
    }

    // Replace-all, scoped to this offering. A tier removed upstream must not
    // survive as a buyable option.
    await admin.from("talent_offering_variants").delete().eq("offering_id", offeringId);
    if (item.variants.length > 0) {
      const { error } = await admin.from("talent_offering_variants").insert(
        item.variants.map((v, i) => ({
          offering_id: offeringId,
          label: v.label,
          amount_cents: v.amountCents,
          sort_order: i,
        })),
      );
      if (error) {
        logServerError("menuImport.variants", error);
        return { ok: false, error: `Could not save options for ${patch.title}.` };
      }
    }

    await admin.from("talent_offering_addons").delete().eq("offering_id", offeringId);
    if (item.addOns.length > 0) {
      const { error } = await admin.from("talent_offering_addons").insert(
        item.addOns.map((a, i) => ({
          offering_id: offeringId,
          label: a.label.es || a.label.en,
          amount_cents: a.amountCents,
          sort_order: i,
        })),
      );
      if (error) {
        logServerError("menuImport.addons", error);
        return { ok: false, error: `Could not save extras for ${patch.title}.` };
      }
    }
  }

  return { ok: true, created, updated, skipped };
}

export async function applyMenuImport(
  tenantId: string,
  source: string,
): Promise<ApplyResult> {
  try {
    const auth = await authorize(tenantId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const parsed = parseSource(source);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Database not available." };

    const menu = parseRestauradminMenu(parsed.doc);
    const result = await applyParsedMenu(admin, tenantId, menu);
    if (!result.ok) return result;

    revalidatePath("/", "layout");
    return result;
  } catch (error) {
    logServerError("menuImport.apply", error);
    return { ok: false, error: "Could not import that menu." };
  }
}
