import "server-only";

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type PackageReason = "cycle" | "overlap" | "invalid" | "not_found" | "unavailable";

export type OfferingComponent = {
  componentOfferingId: string;
  qty: number;
  required: boolean;
};

export function packageRefundShare(input: {
  packageTotalCents: number;
  refundCents: number;
  components: Array<{ componentOfferingId: string; qty: number; unitCents: number }>;
}): Array<{ componentOfferingId: string; cents: number }> {
  const total = Math.max(0, Math.trunc(input.packageTotalCents));
  const refund = Math.max(0, Math.min(Math.trunc(input.refundCents), total));
  const weights = input.components.map((c) => ({
    id: c.componentOfferingId,
    weight: Math.max(0, Math.trunc(c.qty) * Math.max(0, Math.trunc(c.unitCents))),
  }));
  const weightSum = weights.reduce((n, w) => n + w.weight, 0);
  if (weightSum <= 0 || refund === 0) {
    return weights.map((w) => ({ componentOfferingId: w.id, cents: 0 }));
  }
  let allocated = 0;
  return weights.map((w, i) => {
    const cents = i === weights.length - 1 ? refund - allocated : Math.floor((refund * w.weight) / weightSum);
    allocated += cents;
    return { componentOfferingId: w.id, cents };
  });
}

export async function setOfferingComponents(
  admin: Admin,
  input: { tenantId: string; offeringId: string; components: OfferingComponent[] },
): Promise<{ ok: true } | { ok: false; reason: PackageReason }> {
  const ids = new Set<string>();
  for (const c of input.components) {
    if (!c.componentOfferingId || !Number.isInteger(c.qty) || c.qty < 1) return { ok: false, reason: "invalid" };
    if (c.componentOfferingId === input.offeringId) return { ok: false, reason: "cycle" };
    if (ids.has(c.componentOfferingId)) return { ok: false, reason: "overlap" };
    ids.add(c.componentOfferingId);
  }

  const { error: delErr } = await admin
    .from("offering_components")
    .delete()
    .eq("tenant_id", input.tenantId)
    .eq("offering_id", input.offeringId);
  if (delErr) {
    logServerError("catalog.setOfferingComponents.delete", delErr);
    return { ok: false, reason: "unavailable" };
  }
  if (input.components.length === 0) return { ok: true };
  const { error } = await admin.from("offering_components").insert(
    input.components.map((c) => ({
      tenant_id: input.tenantId,
      offering_id: input.offeringId,
      component_offering_id: c.componentOfferingId,
      qty: c.qty,
      required: c.required !== false,
    })),
  );
  if (error) {
    logServerError("catalog.setOfferingComponents.insert", error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true };
}
