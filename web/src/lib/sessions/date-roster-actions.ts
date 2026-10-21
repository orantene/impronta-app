"use server";

/**
 * The participant list of one date, with the price each person bought
 * (TUL-1344 slice 8). Staff only, tenant scoped in every query. One reader of
 * tickets: it asks `readAdmissionsRoster` who holds a place (the till and the
 * back office share that rule) and adds only the price label and the email.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { summariseDateRoster, type DateRosterSummary, type RosterRow } from "@/lib/sessions/date-roster";

export type DateRosterResult = { ok: true; summary: DateRosterSummary } | { ok: false; error: string };

export async function loadDateRoster(tenantId: string, sessionId: string): Promise<DateRosterResult> {
  try {
    const staff = await requireWorkspaceStaffAction({ capability: "agency.workspace.view" });
    if (!staff.ok) return { ok: false, error: staff.error };
    if (staff.tenantId !== tenantId) return { ok: false, error: "Not authorized for this workspace." };
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return { ok: false, error: "That is not a date." };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable." };

    const { data: session, error: sErr } = await admin
      .from("sessions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", sessionId)
      .maybeSingle();
    if (sErr) {
      logServerError("sessions.dateRoster.session", sErr);
      return { ok: false, error: "Could not read the participants." };
    }
    if (!session) return { ok: false, error: "That date is not in this workspace." };

    const { data: admissions, error: aErr } = await admin
      .from("admissions")
      .select("id, holder_name, holder_email, party_size, admitted_count, status, order_line_id")
      .eq("tenant_id", tenantId)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (aErr) {
      logServerError("sessions.dateRoster.admissions", aErr);
      return { ok: false, error: "Could not read the participants." };
    }
    const rows = admissions ?? [];

    const lineIds = [...new Set(rows.map((a) => a.order_line_id).filter((v): v is string => typeof v === "string"))];
    const variantByLine = new Map<string, string>();
    if (lineIds.length > 0) {
      const { data: lines, error: lErr } = await admin
        .from("order_lines")
        .select("id, variant_id")
        .in("id", lineIds);
      if (lErr) {
        logServerError("sessions.dateRoster.lines", lErr);
        return { ok: false, error: "Could not read the participants." };
      }
      for (const l of lines ?? []) if (typeof l.variant_id === "string") variantByLine.set(String(l.id), l.variant_id);
    }
    const variantIds = [...new Set(variantByLine.values())];
    const labelByVariant = new Map<string, string>();
    if (variantIds.length > 0) {
      const { data: variants, error: vErr } = await admin
        .from("talent_offering_variants")
        .select("id, label")
        .in("id", variantIds);
      // A failed label read is cosmetic: the counts still stand, the price column is blank.
      if (vErr) logServerError("sessions.dateRoster.variants", vErr);
      for (const v of variants ?? []) labelByVariant.set(String(v.id), String(v.label));
    }

    const roster: RosterRow[] = rows.map((a) => {
      const variantId = a.order_line_id ? variantByLine.get(String(a.order_line_id)) : undefined;
      return {
        admissionId: String(a.id),
        name: typeof a.holder_name === "string" && a.holder_name.trim() ? a.holder_name.trim() : null,
        email: typeof a.holder_email === "string" && a.holder_email ? a.holder_email : null,
        tierLabel: variantId ? labelByVariant.get(variantId) ?? null : null,
        partySize: Number(a.party_size) || 1,
        admittedCount: Number(a.admitted_count) || 0,
        status: String(a.status),
      };
    });
    return { ok: true, summary: summariseDateRoster(roster) };
  } catch (error) {
    logServerError("sessions.dateRoster", error);
    return { ok: false, error: "Could not read the participants." };
  }
}
