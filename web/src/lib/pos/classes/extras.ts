/**
 * extras.ts — what the front desk can ADD to an appointment's sale at the
 * chair (board B02: "Add to Laura's appointment"): the workspace's published
 * catalog, services and products alike, each with its price and, for a timed
 * service, its minutes.
 *
 * The write is the Counter's own `posAddLine` (one line on the same order,
 * with the sale's version carried), so an extra added here is exactly a line
 * added at the register. What the engine does NOT do is re-check the
 * appointment's TIME when a timed service is added: the board's "Ends 13:35 ·
 * next client 14:00" needs a person's calendar to be re-planned, and no such
 * writer exists (D-POS-19). The sheet says the minutes and says the time is
 * not re-planned, rather than pretending to.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

export type ClassesExtra = {
  readonly offeringId: string;
  readonly title: string;
  readonly amountCents: number;
  /** `talent_offerings.kind`: service | package | product. */
  readonly kind: string;
  /** Minutes a timed service takes; null for a product or an untimed service. */
  readonly durationMinutes: number | null;
};

export type ClassesExtrasResult = { ok: true; extras: ClassesExtra[] } | { ok: false; error: string };

export async function loadClassesExtras(
  admin: Pick<SupabaseClient, "from">,
  tenantId: string,
): Promise<ClassesExtrasResult> {
  const read = await admin
    .from("talent_offerings")
    .select("id, title, amount_cents, duration_minutes, kind, owner_kind")
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(80);
  if (read.error) {
    logServerError("pos.classes.extras", read.error);
    return { ok: false, error: "Could not load the catalog." };
  }
  const extras: ClassesExtra[] = [];
  for (const r of read.data ?? []) {
    const amount = typeof r.amount_cents === "number" ? r.amount_cents : Number(r.amount_cents ?? 0) || 0;
    extras.push({
      offeringId: String(r.id),
      title: (typeof r.title === "string" && r.title.trim()) || String(r.id).slice(0, 8),
      amountCents: amount,
      kind: typeof r.kind === "string" ? r.kind : "service",
      durationMinutes: typeof r.duration_minutes === "number" && r.duration_minutes > 0 ? r.duration_minutes : null,
    });
  }
  return { ok: true, extras };
}
