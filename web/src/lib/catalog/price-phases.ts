import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { num } from "@/lib/pos/sale-rows";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type PricePhaseReason = "overlap" | "invalid" | "not_found" | "unavailable";

export async function livePhasePrice(
  admin: Admin,
  input: { tenantId: string; offeringId: string; variantId?: string | null; nowIso?: string },
): Promise<{ ok: true; priceCents: number | null; phaseId: string | null } | { ok: false; reason: "unavailable" }> {
  const now = input.nowIso ?? new Date().toISOString();
  const { data, error } = await admin
    .from("offering_price_phases")
    .select("id, price_cents, starts_at, ends_at, variant_id")
    .eq("tenant_id", input.tenantId)
    .eq("offering_id", input.offeringId)
    .lte("starts_at", now);
  if (error) {
    logServerError("catalog.livePhasePrice", error);
    return { ok: false, reason: "unavailable" };
  }
  const rows = ((data ?? []) as Array<{
    id: string;
    price_cents: number;
    starts_at: string;
    ends_at: string | null;
    variant_id: string | null;
  }>).filter((row) => {
    if (row.starts_at > now) return false;
    if (row.ends_at && row.ends_at <= now) return false;
    if (input.variantId) return row.variant_id === input.variantId || row.variant_id == null;
    return row.variant_id == null;
  });
  rows.sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1));
  const hit = rows[0];
  if (!hit) return { ok: true, priceCents: null, phaseId: null };
  return { ok: true, priceCents: num(hit.price_cents), phaseId: hit.id };
}

export async function setOfferingPricePhase(
  admin: Admin,
  input: {
    tenantId: string;
    offeringId: string;
    variantId?: string | null;
    label: string;
    startsAt: string;
    endsAt?: string | null;
    priceCents: number;
  },
): Promise<{ ok: true; phaseId: string } | { ok: false; reason: PricePhaseReason }> {
  const label = input.label.trim();
  if (!label || !Number.isInteger(input.priceCents) || input.priceCents < 0) return { ok: false, reason: "invalid" };
  if (input.endsAt && input.endsAt <= input.startsAt) return { ok: false, reason: "overlap" };
  const { data, error } = await admin
    .from("offering_price_phases")
    .insert({
      tenant_id: input.tenantId,
      offering_id: input.offeringId,
      variant_id: input.variantId ?? null,
      label,
      starts_at: input.startsAt,
      ends_at: input.endsAt ?? null,
      price_cents: input.priceCents,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    logServerError("catalog.setOfferingPricePhase", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!data) return { ok: false, reason: "unavailable" };
  return { ok: true, phaseId: String((data as { id: string }).id) };
}
