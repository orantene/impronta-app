import "server-only";

/**
 * stock-retire.server.ts — retiring a pool asset is a PER-TENANT swap (03 §5):
 * every assignment holding it moves to the best remaining pool image for the
 * same slot, and the pages that carry the old src are rewritten. Slots a user
 * replaced by hand are left alone. Nothing here deletes bytes; the retired
 * row keeps its object so anything not swapped still renders.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { assignmentSourceForLevel } from "@/lib/site-admin/builder-core/site-templates/image-resolver";

import { swapImageSrcInTenantPages } from "./page-image-swap.server";
import { queryLifestyleStockForType, type StockRole } from "./platform-stock";

export async function retireStockAssetForTenants(admin: SupabaseClient, stockId: string): Promise<{ tenants: number; swapped: number; kept: number }> {
  const out = { tenants: 0, swapped: 0, kept: 0 };
  try {
    const { data: asset, error: assetError } = await admin.from("platform_stock_images").select("id, family, business_type, role").eq("id", stockId).maybeSingle();
    if (assetError || !asset) return out;
    const a = asset as { family: string; business_type: string | null; role: StockRole };
    const { data: rows, error } = await admin
      .from("tenant_asset_assignments")
      .select("id, tenant_id, page_role, slot, src")
      .eq("asset_id", stockId)
      .is("replaced_by_user_at", null)
      .limit(2000);
    if (error || !rows) return out;
    const byTenant = new Map<string, Array<{ id: string; page_role: string; slot: string; src: string }>>();
    for (const r of rows as Array<{ id: string; tenant_id: string; page_role: string; slot: string; src: string }>) {
      const list = byTenant.get(r.tenant_id) ?? [];
      list.push(r);
      byTenant.set(r.tenant_id, list);
    }
    for (const [tenantId, list] of byTenant) {
      out.tenants += 1;
      const pool = (await queryLifestyleStockForType(admin, { businessType: a.business_type, family: a.family, forTenantId: tenantId })).filter((p) => p.id !== stockId && p.role === a.role);
      const { data: held, error: heldError } = await admin.from("tenant_asset_assignments").select("asset_id").eq("tenant_id", tenantId);
      if (heldError) {
        logServerError("stock-retire.held", heldError);
        out.kept += list.length;
        continue;
      }
      const inUse = new Set(((held ?? []) as Array<{ asset_id: string | null }>).map((h) => h.asset_id).filter(Boolean));
      for (const row of list) {
        const next = pool.find((p) => !inUse.has(p.id)) ?? pool[0] ?? null;
        if (!next) {
          out.kept += 1;
          continue;
        }
        const level = next.originTenantId === tenantId ? "tenant" : next.businessType ? "type" : next.family === a.family ? "family" : "universal";
        const { error: upError } = await admin
          .from("tenant_asset_assignments")
          .update({ asset_id: next.id, src: next.url, source: assignmentSourceForLevel(level), direction: next.direction, selected_at: new Date().toISOString() })
          .eq("id", row.id)
          .is("replaced_by_user_at", null);
        if (upError) {
          logServerError("stock-retire.assignment", upError);
          out.kept += 1;
          continue;
        }
        inUse.add(next.id);
        await swapImageSrcInTenantPages(admin, { tenantId, fromSrc: row.src, toSrc: next.url, toAlt: next.alt });
        out.swapped += 1;
      }
    }
    return out;
  } catch (error) {
    logServerError("stock-retire", error);
    return out;
  }
}
