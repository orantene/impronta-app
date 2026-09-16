/**
 * portal_entry — the engine seam.
 *
 * A customer is a Supabase auth session on this host (auth is host-local;
 * see the auth shell notes), signed in by the existing e-mail code flow.
 * Signed out, the read says so and points at `/me`; signed in, it answers
 * the three lists: bookings from `loadMeData` (the /me page's own reader),
 * tickets by holder e-mail (signed codes, like `ticketLookup`), orders by
 * the customer rows that carry this user.
 */

import type { MeData } from "@/lib/me/shape-me";

import type { StorefrontAdmin } from "./admin";
import type { PortalEntryData, PortalEntryInput, PortalEntryProps, PortalEntryResult, PortalTicket } from "./portal-entry.types";
import { mapEngineRefusal } from "./refusals";
import type { StorefrontIdentity } from "./request-context";

export type PortalEntryDeps = {
  admin: StorefrontAdmin;
  identity: StorefrontIdentity;
  locale: "en" | "es";
  loadMe: (userId: string, tenantId: string) => Promise<MeData>;
  signAdmissionToken: (admissionId: string, tokenVersion: number) => string | null;
  /** The OTP flow's own action, fed the form it expects. */
  requestCode: (form: FormData) => Promise<{ step: "sent"; email: string; notice: string } | { step: "email" | "code"; error: string } | undefined>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function readPortalEntryCore(
  deps: PortalEntryDeps,
  tenantId: string,
  props: PortalEntryProps,
): Promise<{ ok: true; data: PortalEntryData } | { ok: false; reason: string }> {
  if (!UUID.test(tenantId)) return { ok: false, reason: "invalid_request" };
  const label = props.label?.trim() || null;
  if (!deps.identity.userId) return { ok: true, data: { signedIn: false, label, signInPath: "/me" } };
  try {
    const me = await deps.loadMe(deps.identity.userId, tenantId);
    const bookings = [...me.upcoming, ...me.waitingOnYou, ...me.past].map((b) => ({
      id: b.id,
      title: b.title,
      status: b.status,
      eventDate: b.eventDate,
      eventLocation: b.eventLocation,
      kind: b.kind,
      path: `/c/${encodeURIComponent(b.id)}`,
    }));

    const { data: customers, error: cErr } = await deps.admin.from("customers").select("id").eq("tenant_id", tenantId).eq("user_id", deps.identity.userId);
    if (cErr) return { ok: false, reason: "unavailable" };
    const customerIds = ((customers ?? []) as Array<{ id: string }>).map((c) => c.id);
    let orders: Extract<PortalEntryData, { signedIn: true }>["orders"] = [];
    if (customerIds.length > 0) {
      const { data, error: oErr } = await deps.admin
        .from("orders")
        .select("id, receipt_code, status, total_cents, currency, created_at")
        .eq("tenant_id", tenantId)
        .in("customer_id", customerIds)
        .in("status", ["pending_payment", "paid", "fulfilled", "partially_refunded", "refunded"])
        .order("created_at", { ascending: false })
        .limit(20);
      if (oErr) return { ok: false, reason: "unavailable" };
      orders = ((data ?? []) as Array<{ id: string; receipt_code: string | null; status: string; total_cents: number | string; currency: string; created_at: string }>).map((o) => ({
        id: o.id,
        receiptCode: o.receipt_code,
        path: o.receipt_code ? `/r/${encodeURIComponent(o.receipt_code)}` : null,
        status: o.status,
        totalCents: Number(o.total_cents ?? 0),
        currency: o.currency || "USD",
        createdAtIso: new Date(o.created_at).toISOString(),
      }));
    }

    const tickets: PortalTicket[] = [];
    const email = deps.identity.email?.trim().toLowerCase();
    if (email) {
      const { data, error: aErr } = await deps.admin
        .from("admissions")
        .select("id, token_version, holder_name, holder_email, session_id, starts_at, status")
        .eq("tenant_id", tenantId)
        .eq("holder_email", email)
        .order("starts_at", { ascending: false })
        .limit(20);
      if (aErr) return { ok: false, reason: "unavailable" };
      for (const a of (data ?? []) as Array<{ id: string; token_version: number; holder_name: string | null; session_id: string | null; starts_at: string | null; status: string }>) {
        const code = deps.signAdmissionToken(a.id, Number(a.token_version));
        if (!code) continue;
        tickets.push({ code, path: `/ticket/${encodeURIComponent(code)}`, holderName: a.holder_name, sessionId: a.session_id, startsAtIso: a.starts_at ? new Date(a.starts_at).toISOString() : null, status: a.status });
      }
    }
    return {
      ok: true,
      data: {
        signedIn: true,
        label,
        customer: { name: deps.identity.displayName, email: deps.identity.email },
        bookings,
        tickets,
        orders,
        portalPath: "/me",
      },
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function actPortalEntryCore(deps: PortalEntryDeps, input: PortalEntryInput): Promise<PortalEntryResult> {
  if (!input || !UUID.test(input.tenantId ?? "") || input.op !== "request_code") return mapEngineRefusal("invalid_request", deps.locale);
  const email = (input.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) return mapEngineRefusal("invalid", deps.locale);
  try {
    const form = new FormData();
    form.set("email", email);
    form.set("next", input.nextPath && input.nextPath.startsWith("/") ? input.nextPath : "/me");
    form.set("create", "1");
    form.set("locale", deps.locale);
    const state = await deps.requestCode(form);
    if (state && state.step === "sent") return { ok: true, op: "request_code", email: state.email, notice: state.notice };
    // The flow's own sentence is already translated; the bucket is ours.
    const message = state && "error" in state ? state.error : null;
    const mapped = mapEngineRefusal("rate_limited", deps.locale);
    return message ? { ...mapped, message } : mapped;
  } catch {
    return mapEngineRefusal("engine_error", deps.locale);
  }
}
