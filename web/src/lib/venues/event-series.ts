import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import type { PurchaseLineInput } from "@/lib/orders/purchase-types";
import type { VenueAdmin } from "./locations";

export async function expandEventSeriesLines(
  admin: VenueAdmin,
  input: { tenantId: string; lines: PurchaseLineInput[] },
): Promise<{ ok: true; lines: PurchaseLineInput[] } | { ok: false; reason: "empty_order" | "engine_error" }> {
  const out: PurchaseLineInput[] = [];
  for (const line of input.lines) {
    const seriesId = line.eventSeriesId;
    if (!seriesId) {
      out.push(line);
      continue;
    }
    if (typeof admin.from !== "function") return { ok: false, reason: "engine_error" };
    const { data, error } = await admin
      .from("sessions")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("event_series_id", seriesId)
      .eq("status", "scheduled")
      .order("starts_at", { ascending: true });
    if (error) {
      logServerError("venues.expandEventSeriesLines", error);
      return { ok: false, reason: "engine_error" };
    }
    const nights = ((data ?? []) as { id: string }[]).map((s) => s.id);
    if (nights.length === 0) return { ok: false, reason: "empty_order" };
    for (const sessionId of nights) {
      out.push({ ...line, sessionId, eventSeriesId: undefined });
    }
  }
  if (out.length === 0) return { ok: false, reason: "empty_order" };
  return { ok: true, lines: out };
}
