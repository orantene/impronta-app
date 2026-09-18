"use server";

/**
 * Server actions for the `ticket_picker` block's inspector: the tenant's
 * events to sell, and the tiers of one event so the operator can author
 * per-tier copy and imagery next to the tier they belong to.
 *
 * Same contract as the links picker: tenant from the WORKSPACE SURFACE via
 * `requireWorkspaceStaffAction`, capability-gated, no tenant id in the
 * signature; `{ ok }` results, never throws.
 */

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";

export type InspectorEvent = { id: string; title: string; status: string; startsAt: string | null };
export type InspectorTier = { variantId: string; label: string; amountCents: number; isHidden: boolean };

export async function listEventsForInspectorAction(): Promise<
  { ok: true; events: InspectorEvent[] } | { ok: false; error: string }
> {
  const guard = await requireWorkspaceStaffAction({ capability: "agency.site_admin.pages.edit" });
  if (!guard.ok) return { ok: false, error: guard.error };
  try {
    const { data, error } = await guard.supabase
      .from("events")
      .select("id, title, status, sessions(starts_at)")
      .eq("tenant_id", guard.tenantId)
      .in("status", ["published", "draft"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const events = ((data ?? []) as Array<{ id: string; title: string | null; status: string; sessions?: Array<{ starts_at: string | null }> | null }>).map((e) => ({
      id: e.id,
      title: e.title ?? "",
      status: e.status,
      startsAt: (e.sessions ?? []).map((s) => s.starts_at).filter((x): x is string => Boolean(x)).sort()[0] ?? null,
    }));
    return { ok: true, events };
  } catch (error) {
    logServerError("events:listEventsForInspectorAction", error);
    return { ok: false, error: "Could not load your events." };
  }
}

export async function listEventTiersForInspectorAction(input: { eventId: string }): Promise<
  { ok: true; tiers: InspectorTier[] } | { ok: false; error: string }
> {
  const guard = await requireWorkspaceStaffAction({ capability: "agency.site_admin.pages.edit" });
  if (!guard.ok) return { ok: false, error: guard.error };
  const eventId = typeof input?.eventId === "string" ? input.eventId.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return { ok: true, tiers: [] };
  try {
    const { data: event, error: eErr } = await guard.supabase
      .from("events")
      .select("offering_id")
      .eq("tenant_id", guard.tenantId)
      .eq("id", eventId)
      .maybeSingle();
    if (eErr) throw eErr;
    const offeringId = (event as { offering_id?: string | null } | null)?.offering_id ?? null;
    if (!offeringId) return { ok: true, tiers: [] };
    const { data, error } = await guard.supabase
      .from("talent_offering_variants")
      .select("id, label, amount_cents, is_hidden, sort_order")
      .eq("offering_id", offeringId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    const tiers = ((data ?? []) as Array<{ id: string; label: string; amount_cents: number | null; is_hidden: boolean | null }>).map((v) => ({
      variantId: v.id,
      label: v.label,
      amountCents: v.amount_cents ?? 0,
      isHidden: Boolean(v.is_hidden),
    }));
    return { ok: true, tiers };
  } catch (error) {
    logServerError("events:listEventTiersForInspectorAction", error);
    return { ok: false, error: "Could not load the event's tickets." };
  }
}

export type InspectorLinkedEvent = { id: string; title: string; status: string };

/**
 * EVENT PROGRAM — the event that claims the page being edited through
 * `events.page_id`, or null. Draft AND published: the operator is building the
 * page for an event that may not be live yet, and the block must bind to it
 * the same way the public render will once both publish. Used by the
 * `event_program` inspector to hide its event select on a linked page.
 */
export async function resolveLinkedEventForPageInspectorAction(input: { pageId: string }): Promise<
  { ok: true; event: InspectorLinkedEvent | null } | { ok: false; error: string }
> {
  const guard = await requireWorkspaceStaffAction({ capability: "agency.site_admin.pages.edit" });
  if (!guard.ok) return { ok: false, error: guard.error };
  const pageId = typeof input?.pageId === "string" ? input.pageId.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(pageId)) return { ok: true, event: null };
  try {
    const { data, error } = await guard.supabase
      .from("events")
      .select("id, title, status")
      .eq("tenant_id", guard.tenantId)
      .eq("page_id", pageId)
      .in("status", ["published", "draft"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const row = data as { id: string; title: string | null; status: string } | null;
    return { ok: true, event: row ? { id: row.id, title: row.title ?? "", status: row.status } : null };
  } catch (error) {
    logServerError("events:resolveLinkedEventForPageInspectorAction", error);
    return { ok: false, error: "Could not resolve the page's event." };
  }
}
