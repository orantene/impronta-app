/**
 * generation-context.server.ts — what the builder's "describe your page"
 * generator needs to stop assuming a talent agency: the tenant's business
 * family + name, and an image-by-role resolver over its own media and the
 * lifestyle stock for its type. One read each; never throws (the generator
 * falls back to its neutral register and the marketing photos).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { queryLifestyleStockForType } from "@/lib/media/platform-stock";
import { logServerError } from "@/lib/server/safe-error";
import { businessTypeById } from "@/lib/words/business-types";

import { buildImageResolver, type CandidateImage } from "./image-resolver";
import { resolveTenantBusinessType } from "./tenant-business-type";
import type { ImageRole, ImageSlotKey } from "./types";

const ROLES: ReadonlySet<string> = new Set(["hero", "wide", "portrait", "gallery", "team", "detail"]);

export async function resolveGenerationContext(
  admin: SupabaseClient,
  tenantId: string,
): Promise<{ business: { family: string; businessName: string | null; typeLabel: string | null }; imageForRole: (role: string) => string | null }> {
  try {
    const { data: agency, error } = await admin.from("agencies").select("display_name, settings").eq("id", tenantId).maybeSingle<{ display_name: string | null; settings: unknown }>();
    if (error) throw error;
    const type = resolveTenantBusinessType(agency?.settings ?? null);
    const typeRow = businessTypeById(type.typeId);
    const [{ data: owner }, stock] = await Promise.all([
      admin.from("media_assets").select("storage_path, bucket_id, width, height, alt").eq("tenant_id", tenantId).is("deleted_at", null).is("owner_talent_profile_id", null).order("created_at", { ascending: false }).limit(24),
      queryLifestyleStockForType(admin, { businessType: type.typeId, family: type.family }),
    ]);
    const candidates: CandidateImage[] = [
      ...((owner ?? []) as Array<{ storage_path: string | null; bucket_id: string | null; width: number | null; height: number | null; alt: string | null }>)
        .filter((r) => !!r.storage_path)
        .map((r) => ({ src: admin.storage.from(r.bucket_id ?? "media-public").getPublicUrl(r.storage_path as string).data.publicUrl, width: r.width, height: r.height, alt: { es: r.alt ?? "", en: r.alt ?? "" }, owner: true })),
      ...stock.map<CandidateImage>((s) => ({ src: s.url, width: s.width, height: s.height, alt: s.alt, role: s.role, owner: false })),
    ];
    const { resolve } = buildImageResolver(candidates);
    let n = 0;
    return {
      business: { family: type.family, businessName: agency?.display_name ?? null, typeLabel: typeRow?.label.en ?? null },
      imageForRole: (role) => {
        if (!ROLES.has(role)) return null;
        n += 1;
        // The generator may ask for the same role many times; give each ask a
        // distinct slot key so the resolver hands out different frames.
        const slot = (role === "gallery" ? `gallery-${((n - 1) % 4) + 1}` : role) as ImageSlotKey;
        return resolve(slot, role as ImageRole)?.src ?? null;
      },
    };
  } catch (error) {
    logServerError("generation-context", error);
    return { business: { family: "custom", businessName: null, typeLabel: null }, imageForRole: () => null };
  }
}
