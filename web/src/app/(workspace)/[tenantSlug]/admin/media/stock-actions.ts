"use server";

/**
 * stock-actions.ts — the tenant-side read of the platform lifestyle stock.
 *
 * READ-ONLY by construction (D-TPL-6): the folder the Media page shows is a
 * projection of `queryLifestyleStockForType` for this workspace's business
 * type, not rows the tenant owns. There is no rename, move or delete here,
 * and the existing folder actions refuse asset ids that are not the tenant's.
 * "Use" and "favourite" go through the same paths as any URL a page places.
 */

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { queryLifestyleStockForType, type LifestyleStockPhoto } from "@/lib/media/platform-stock";
import { resolveTenantBusinessType } from "@/lib/site-admin/builder-core/site-templates/tenant-business-type";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { businessTypeById } from "@/lib/words/business-types";
import { logServerError } from "@/lib/server/safe-error";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface LifestyleStockShelf {
  typeId: string;
  family: string;
  source: "business_type_id" | "industry_preset" | "default";
  /** Human label in the dashboard locale, or null when the type is unset (never an id). */
  typeLabel: string | null;
  photos: LifestyleStockPhoto[];
}

export async function actionListLifestyleStock(): Promise<ActionResult<LifestyleStockShelf>> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data: agency, error } = await admin
    .from("agencies")
    .select("settings")
    .eq("id", auth.tenantId)
    .maybeSingle<{ settings: unknown }>();
  if (error) {
    logServerError("stock.list.settings", error);
    return { ok: false, error: "Could not load workspace settings." };
  }
  const type = resolveTenantBusinessType(agency?.settings ?? null);
  const photos = await queryLifestyleStockForType(admin, { businessType: type.typeId, family: type.family });
  const row = type.source === "default" ? null : businessTypeById(type.typeId);
  const typeLabel = row ? row.label.es : null;
  return { ok: true, data: { typeId: type.typeId, family: type.family, source: type.source, typeLabel, photos } };
}
