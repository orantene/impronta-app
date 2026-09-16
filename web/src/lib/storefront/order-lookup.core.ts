/**
 * order_lookup — the engine seam.
 *
 * A receipt code alone is not proof: the e-mail must match the buyer or a
 * ticket holder. The order is read by its exact `receipt_code`; when only
 * the last four digits were typed, the ticket engine's own `ticketLookup`
 * (rate-limited, e-mail matched) finds the admissions. Resend and transfer
 * are the `/ticket/<code>` page's own functions.
 */

import type { StorefrontAdmin } from "./admin";
import type { LookedUpOrder, LookedUpTicket, OrderLookupData, OrderLookupInput, OrderLookupProps, OrderLookupResult } from "./order-lookup.types";
import { mapEngineRefusal } from "./refusals";

export type OrderLookupDeps = {
  admin: StorefrontAdmin;
  locale: "en" | "es";
  ticketLookup: (admin: StorefrontAdmin, input: { tenantId: string; email: string; last4OfReceipt: string }) => Promise<{ ok: true; codes: string[] } | { ok: false; reason: string }>;
  loadTicketByCode: (admin: StorefrontAdmin, input: { tenantId: string; code: string }) => Promise<{ ok: true; admissionId: string; holderName: string | null; holderEmail: string | null; startsAt: string | null; sessionId: string | null; status: string; code: string } | { ok: false; reason: string }>;
  ticketResend: (admin: StorefrontAdmin, input: { tenantId: string; code: string }) => Promise<{ ok: true } | { ok: false; reason: string }>;
  ticketTransfer: (admin: StorefrontAdmin, input: { tenantId: string; code: string; toName: string; toEmail: string }) => Promise<{ ok: true; code: string } | { ok: false; reason: string }>;
  signAdmissionToken: (admissionId: string, tokenVersion: number) => string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function readOrderLookupCore(
  deps: OrderLookupDeps,
  tenantId: string,
  props: OrderLookupProps,
): Promise<{ ok: true; data: OrderLookupData } | { ok: false; reason: string }> {
  if (!UUID.test(tenantId)) return { ok: false, reason: "invalid_request" };
  const title = props.title?.trim() || null;
  const code = (props.code ?? "").trim();
  const email = (props.email ?? "").trim().toLowerCase();
  if (!code || !email) return { ok: true, data: { title, result: null } };
  if (!email.includes("@")) return { ok: false, reason: "invalid" };
  try {
    let order: LookedUpOrder | null = null;
    const tickets: LookedUpTicket[] = [];
    const { data: orderRow, error } = await deps.admin
      .from("orders")
      .select("id, receipt_code, status, total_cents, currency, created_at, customer_id")
      .eq("tenant_id", tenantId)
      .eq("receipt_code", code)
      .maybeSingle();
    if (error) return { ok: false, reason: "unavailable" };
    if (orderRow) {
      let buyerEmail: string | null = null;
      if (orderRow.customer_id) {
        const { data: customer, error: cErr } = await deps.admin.from("customers").select("id, email").eq("id", orderRow.customer_id).maybeSingle();
        // The buyer's e-mail is the PROOF; an unreadable proof refuses rather than denies.
        if (cErr) return { ok: false, reason: "unavailable" };
        buyerEmail = customer && typeof customer.email === "string" ? customer.email.toLowerCase() : null;
      }
      const { data: lineRows, error: lErr } = await deps.admin.from("order_lines").select("id, label, units, total_cents").eq("order_id", orderRow.id).order("sort_order", { ascending: true });
      if (lErr) return { ok: false, reason: "unavailable" };
      const lineIds = ((lineRows ?? []) as Array<{ id: string }>).map((l) => l.id);
      const { data: admissions, error: aErr } = lineIds.length
        ? await deps.admin.from("admissions").select("id, token_version, holder_name, holder_email, session_id, starts_at, status").eq("tenant_id", tenantId).in("order_line_id", lineIds)
        : { data: [], error: null };
      if (aErr) return { ok: false, reason: "unavailable" };
      const held = ((admissions ?? []) as Array<{ id: string; token_version: number; holder_name: string | null; holder_email: string | null; session_id: string | null; starts_at: string | null; status: string }>)
        .filter((a) => (a.holder_email ?? "").toLowerCase() === email);
      // Proof: the buyer's e-mail, or a ticket in this order held by this e-mail.
      if (buyerEmail !== email && held.length === 0) return { ok: false, reason: "not_found" };
      order = {
        receiptCode: String(orderRow.receipt_code),
        path: `/r/${encodeURIComponent(String(orderRow.receipt_code))}`,
        status: String(orderRow.status ?? ""),
        totalCents: Number(orderRow.total_cents ?? 0),
        currency: String(orderRow.currency ?? "USD"),
        createdAtIso: new Date(String(orderRow.created_at)).toISOString(),
        lines: ((lineRows ?? []) as Array<{ label: string; units: number | string; total_cents: number | string }>).map((l) => ({
          label: l.label,
          units: Number(l.units ?? 0),
          totalCents: Number(l.total_cents ?? 0),
        })),
      };
      for (const a of held) {
        const signed = deps.signAdmissionToken(a.id, Number(a.token_version));
        if (!signed) continue;
        tickets.push({ code: signed, path: `/ticket/${encodeURIComponent(signed)}`, holderName: a.holder_name, sessionId: a.session_id, startsAtIso: a.starts_at ? new Date(a.starts_at).toISOString() : null, status: a.status });
      }
      return { ok: true, data: { title, result: { order, tickets } } };
    }
    // Not an exact receipt code: try the ticket engine with the last four.
    const last4 = code.replace(/\D/g, "").slice(-4);
    if (last4.length !== 4) return { ok: false, reason: "not_found" };
    const found = await deps.ticketLookup(deps.admin, { tenantId, email, last4OfReceipt: last4 });
    if (!found.ok) return { ok: false, reason: found.reason };
    for (const c of found.codes) {
      const t = await deps.loadTicketByCode(deps.admin, { tenantId, code: c });
      if (!t.ok) continue;
      tickets.push({ code: c, path: `/ticket/${encodeURIComponent(c)}`, holderName: t.holderName, sessionId: t.sessionId, startsAtIso: t.startsAt ? new Date(t.startsAt).toISOString() : null, status: t.status });
    }
    return { ok: true, data: { title, result: { order: null, tickets } } };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function actOrderLookupCore(deps: OrderLookupDeps, input: OrderLookupInput): Promise<OrderLookupResult> {
  if (!input || !UUID.test(input.tenantId ?? "")) return mapEngineRefusal("invalid_request", deps.locale);
  const code = (input.code ?? "").trim();
  if (code.length < 8) return mapEngineRefusal("invalid_request", deps.locale);
  try {
    if (input.op === "resend") {
      const r = await deps.ticketResend(deps.admin, { tenantId: input.tenantId, code });
      return r.ok ? { ok: true, op: "resend" } : mapEngineRefusal(r, deps.locale);
    }
    if (input.op === "transfer") {
      const toName = (input.toName ?? "").trim();
      const toEmail = (input.toEmail ?? "").trim().toLowerCase();
      if (!toName || !toEmail.includes("@")) return mapEngineRefusal("identity_required", deps.locale);
      const r = await deps.ticketTransfer(deps.admin, { tenantId: input.tenantId, code, toName, toEmail });
      return r.ok ? { ok: true, op: "transfer", code: r.code, path: `/ticket/${encodeURIComponent(r.code)}` } : mapEngineRefusal(r, deps.locale);
    }
    return mapEngineRefusal("invalid_request", deps.locale);
  } catch {
    return mapEngineRefusal("engine_error", deps.locale);
  }
}
