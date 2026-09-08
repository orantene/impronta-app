/**
 * C37 — gallery delivery/selection on the existing booking record.
 * Print add-ons stay extra lines on the same order (POS addLine), not a
 * second commercial object.
 */

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export async function selectGalleryAssets(
  admin: Admin,
  input: {
    tenantId: string;
    deliverableId: string;
    assetIds: string[];
  },
): Promise<{ ok: true; assetIds: string[] } | { ok: false; reason: "not_found" | "wrong_tenant" | "invalid" | "unavailable"; error: string }> {
  const ids = [...new Set(input.assetIds.map((id) => id.trim()).filter(Boolean))];
  if (!input.tenantId || !input.deliverableId || ids.length === 0) {
    return { ok: false, reason: "invalid", error: "Pick at least one image." };
  }
  const { data, error } = await admin
    .from("booking_deliverables")
    .select("id, tenant_id, booking_id")
    .eq("id", input.deliverableId)
    .maybeSingle();
  if (error) {
    logServerError("gallery.select.load", error);
    return { ok: false, reason: "unavailable", error: "Could not save the selection." };
  }
  if (!data) return { ok: false, reason: "not_found", error: "That gallery is not on this booking." };
  const row = data as { id: string; tenant_id: string; booking_id: string };
  if (row.tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant", error: "That gallery is not on this booking." };
  }
  const { error: upd } = await admin
    .from("booking_deliverables")
    .update({ selected_asset_ids: ids, updated_at: new Date().toISOString() })
    .eq("id", input.deliverableId)
    .eq("tenant_id", input.tenantId);
  if (upd) {
    logServerError("gallery.select.update", upd);
    return { ok: false, reason: "unavailable", error: "Could not save the selection." };
  }
  return { ok: true, assetIds: ids };
}
