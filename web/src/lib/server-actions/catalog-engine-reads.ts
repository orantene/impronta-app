"use server";

/**
 * Reads for the catalog's Package 2 screens: an offering's components
 * (PackageEditor composition) and its dated price phases (E02 / W03).
 *
 * The writers live in `scheduling-engine.ts` and are never re-exported here.
 * Both reads are staff-guarded and tenant-scoped; a failure is a reason
 * code, never an empty list dressed as "no rows".
 */

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

const uuid = z.string().uuid();

export type OfferingComponentRow = {
  componentOfferingId: string;
  qty: number;
  required: boolean;
};

export type OfferingPricePhaseRow = {
  id: string;
  label: string;
  startsAt: string;
  endsAt: string | null;
  priceCents: number;
  variantId: string | null;
};

type ReadFail = { ok: false; reason: "invalid" | "not_allowed" | "unavailable" };

async function guard() {
  const staff = await requireWorkspaceStaffAction();
  if (!staff.ok) return { ok: false as const, reason: "not_allowed" as const };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  return { ok: true as const, tenantId: staff.tenantId, admin };
}

export async function loadOfferingComponentsAction(
  offeringId: string,
): Promise<{ ok: true; components: OfferingComponentRow[] } | ReadFail> {
  const g = await guard();
  if (!g.ok) return g;
  if (!uuid.safeParse(offeringId).success) return { ok: false, reason: "invalid" };
  const { data, error } = await tenantScopedQuery(g.admin, "offering_components", g.tenantId)
    .select("component_offering_id, qty, required")
    .eq("offering_id", offeringId);
  if (error) {
    logServerError("catalog.loadOfferingComponents", error);
    return { ok: false, reason: "unavailable" };
  }
  const rows = (data ?? []) as Array<{ component_offering_id: string; qty: number; required: boolean }>;
  return {
    ok: true,
    components: rows.map((r) => ({ componentOfferingId: r.component_offering_id, qty: Number(r.qty), required: r.required !== false })),
  };
}

export async function loadOfferingPricePhasesAction(
  offeringId: string,
): Promise<{ ok: true; phases: OfferingPricePhaseRow[] } | ReadFail> {
  const g = await guard();
  if (!g.ok) return g;
  if (!uuid.safeParse(offeringId).success) return { ok: false, reason: "invalid" };
  const { data, error } = await tenantScopedQuery(g.admin, "offering_price_phases", g.tenantId)
    .select("id, label, starts_at, ends_at, price_cents, variant_id")
    .eq("offering_id", offeringId)
    .order("starts_at", { ascending: true });
  if (error) {
    logServerError("catalog.loadOfferingPricePhases", error);
    return { ok: false, reason: "unavailable" };
  }
  const rows = (data ?? []) as Array<{
    id: string;
    label: string;
    starts_at: string;
    ends_at: string | null;
    price_cents: number;
    variant_id: string | null;
  }>;
  return {
    ok: true,
    phases: rows.map((r) => ({
      id: r.id,
      label: r.label,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      priceCents: Number(r.price_cents),
      variantId: r.variant_id,
    })),
  };
}
