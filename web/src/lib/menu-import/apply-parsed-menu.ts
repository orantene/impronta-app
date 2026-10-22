import "server-only";

/**
 * apply-parsed-menu.ts — the menu import WRITE PATH, as a plain server module (TUL-1744).
 *
 * It lived in `import-actions.ts`, a "use server" file, so `applyParsedMenu(admin, tenantId, menu)`
 * was an exported server action that takes an already-authorised tenant id and a database client as
 * ARGUMENTS and authorises nothing itself. Server-action arguments come from the client; a function
 * like that must never be reachable as an action. Both callers (the staff action and provisioning)
 * establish the right to write first, then import this on the server.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { insertPatch, updatePatch } from "./import-patch";
import type { ImportedMenu } from "./parse-restauradmin";
import { planMenuImport, SOURCE_ID_KEY, type ExistingOffering } from "./plan-import";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";

export type ApplyResult =
  | { ok: true; created: number; updated: number; skipped: number }
  | { ok: false; error: string };

/**
 * Every workspace-owned offering, as the planner needs it.
 *
 * Includes rows WITHOUT a source id on purpose: the planner must see a
 * hand-typed item to know it is not an orphan, and must never claim it.
 */
export async function loadExisting(
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
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
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
        .update(updatePatch(patch))
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
        .insert(insertPatch(patch))
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

