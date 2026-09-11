import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { submitOrderToPreparation } from "@/lib/preparation/tickets";
import type { VenueAdmin } from "./locations";

export type PrepFireResult =
  | { ok: true; submitted: number }
  | { ok: false; reason: "not_found" | "unavailable" | "invalid" };

export async function prepFireCourse(
  admin: VenueAdmin,
  input: { tenantId: string; visitId: string; courseSeq: number; operationKey: string },
): Promise<PrepFireResult> {
  if (input.operationKey.trim().length < 8) return { ok: false, reason: "invalid" };
  if (input.courseSeq < 1) return { ok: false, reason: "invalid" };
  try {
    const { data, error } = await admin
      .from("orders")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("visit_id", input.visitId);
    if (error) {
      logServerError("venues.prepFireCourse.orders", error);
      return { ok: false, reason: "unavailable" };
    }
    const orders = (data ?? []) as { id: string }[];
    if (orders.length === 0) return { ok: false, reason: "not_found" };
    let submitted = 0;
    for (const order of orders) {
      const r = await submitOrderToPreparation(admin, {
        tenantId: input.tenantId,
        orderId: order.id,
        destination: "table",
        courseSeq: input.courseSeq,
      });
      if (r.ok) submitted += 1;
    }
    if (submitted === 0) return { ok: false, reason: "not_found" };
    return { ok: true, submitted };
  } catch (error) {
    logServerError("venues.prepFireCourse", error);
    return { ok: false, reason: "unavailable" };
  }
}
