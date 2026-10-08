import "server-only";

import { loadMeData } from "@/lib/me/load-me";
import { bookingClientFeeLines } from "@/lib/billing/processing-fee-payer";
import { loadBookingCommissionSnapshots } from "@/lib/billing/commission-engine";
import { resolveCancellationWindow } from "@/lib/bookings/cancellation-window";
import { CLIENT_THREAD, INTERNAL_NOTE_KIND } from "@/lib/messaging/thread-rule";
import { requestNowMs } from "@/lib/projects/request-clock";
import { bookingOfferingId, loadBookingCancelPolicy, type BookingCancelPolicy } from "@/lib/scheduling/booking-cancel-policy";
import { refundableCentsFromPolicy } from "@/lib/scheduling/cancel-booking";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { groupVisits, shapeReceiptLines, type ReceiptLine } from "./area-pure";

/** Every query here is `client_user_id = session user` AND `tenant_id = this site's tenant`. */

export async function loadVisitGroups(userId: string, tenantId: string) {
  const me = await loadMeData(userId, tenantId);
  return groupVisits([...me.upcoming, ...me.waitingOnYou, ...me.past], Date.now());
}

export type VisitDetail = {
  inquiryId: string;
  bookingId: string | null;
  service: string;
  status: string;
  startsAt: string | null;
  eventDate: string | null;
  place: string | null;
  amountCents: number | null;
  currency: string;
  paymentStatus: string | null;
  paidCents: number;
  /** Cancellation facts, from the same source the engine and `/manage` use. */
  policy: { enforceable: boolean; insideWindow: boolean; deadlineIso: string | null; refundIfCancelled: number };
  offeringId: string | null;
  canManage: boolean;
  payCode: string | null;
};

export async function loadVisitDetail(userId: string, tenantId: string, inquiryId: string): Promise<VisitDetail | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data: inq, error } = await admin
    .from("inquiries")
    .select("id, company, status, event_date, event_location")
    .eq("id", inquiryId)
    .eq("client_user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("clientAccount.visit.inquiry", error);
    return null;
  }
  if (!inq) return null;
  const i = inq as { id: string; company: string | null; status: string | null; event_date: string | null; event_location: string | null };
  const { data: bk, error: bkErr } = await admin
    .from("agency_bookings")
    .select("id, title, status, starts_at, order_id, currency_code, total_client_revenue, payment_status, client_user_id, venue_name, venue_address")
    .eq("source_inquiry_id", inquiryId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (bkErr) {
    logServerError("clientAccount.visit.booking", bkErr);
    return null;
  }
  const b = bk as {
    id: string;
    title: string | null;
    status: string | null;
    starts_at: string | null;
    order_id: string | null;
    currency_code: string | null;
    total_client_revenue: number | string | null;
    payment_status: string | null;
    client_user_id: string | null;
    venue_name: string | null;
    venue_address: string | null;
  } | null;

  const currency = (b?.currency_code ?? "USD").toUpperCase();
  let paidCents = 0;
  let payCode: string | null = null;
  let offeringId: string | null = null;
  let policy: BookingCancelPolicy = { cancelFreeHours: null, lateCancelRefund: "none", depositCents: null };
  if (b?.order_id) {
    const { data: txns, error: txnErr } = await admin
      .from("booking_transactions")
      .select("gross_amount_cents, status")
      .eq("order_id", b.order_id);
    if (txnErr) logServerError("clientAccount.visit.paid", txnErr);
    for (const x of (txns ?? []) as Array<{ gross_amount_cents: number; status: string }>) {
      if (x.status === "paid") paidCents += Number(x.gross_amount_cents) || 0;
    }
    policy = await loadBookingCancelPolicy(admin, { tenantId, orderId: b.order_id });
    offeringId = await bookingOfferingId(admin, b.order_id);
    const { data: link, error: linkErr } = await admin
      .from("payment_links")
      .select("code")
      .eq("tenant_id", tenantId)
      .eq("order_id", b.order_id)
      .eq("status", "open")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (linkErr) logServerError("clientAccount.visit.payLink", linkErr);
    payCode = (link as { code?: string } | null)?.code ?? null;
  }
  const nowMs = requestNowMs();
  const window = resolveCancellationWindow({ cancellationHours: policy.cancelFreeHours, startsAt: b?.starts_at ?? null, eventDate: null, nowMs });
  const status = (b?.status ?? i.status ?? "").toLowerCase();
  const closed = ["cancelled", "completed", "archived", "declined", "expired", "closed"].includes(status);
  const startMs = b?.starts_at ? Date.parse(b.starts_at) : NaN;
  const amount = b?.total_client_revenue == null ? null : Math.round(Number(b.total_client_revenue) * 100);
  return {
    inquiryId,
    bookingId: b?.id ?? null,
    service: b?.title?.trim() || i.company?.trim() || "",
    status,
    startsAt: b?.starts_at ?? null,
    eventDate: i.event_date,
    place: [b?.venue_name, b?.venue_address].filter(Boolean).join(" · ") || i.event_location,
    amountCents: amount !== null && Number.isFinite(amount) ? amount : null,
    currency,
    paymentStatus: b?.payment_status ?? null,
    paidCents,
    policy: {
      enforceable: window.enforceable,
      insideWindow: window.insideWindow,
      deadlineIso: window.deadlineIso ?? null,
      refundIfCancelled: refundableCentsFromPolicy({
        paidCents,
        cancelFreeHours: policy.cancelFreeHours,
        startsAt: b?.starts_at ?? null,
        nowMs,
        lateCancelRefund: policy.lateCancelRefund,
        depositCents: policy.depositCents,
      }),
    },
    offeringId,
    // The server action re-checks ownership; this only decides whether to show the buttons.
    canManage: !!b && b.client_user_id === userId && !closed && Number.isFinite(startMs) && startMs > nowMs,
    payCode,
  };
}

export type ThreadRow = { id: string; title: string; lastBody: string | null; lastAt: string | null };
export type ThreadMessage = { id: string; body: string; createdAt: string; mine: boolean };

export async function loadThreads(userId: string, tenantId: string): Promise<ThreadRow[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data: inqs, error } = await admin
    .from("inquiries")
    .select("id, company, created_at")
    .eq("client_user_id", userId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    logServerError("clientAccount.threads.inquiries", error);
    return [];
  }
  const rows = (inqs ?? []) as Array<{ id: string; company: string | null }>;
  if (rows.length === 0) return [];
  const { data: msgs, error: msgErr } = await admin
    .from("inquiry_messages")
    .select("inquiry_id, body, created_at")
    .eq("tenant_id", tenantId)
    .eq("thread_type", CLIENT_THREAD)
    .is("deleted_at", null)
    .neq("message_kind", INTERNAL_NOTE_KIND)
    .in("inquiry_id", rows.map((r) => r.id))
    .order("created_at", { ascending: false })
    .limit(500);
  if (msgErr) logServerError("clientAccount.threads.messages", msgErr);
  const last = new Map<string, { body: string; at: string }>();
  for (const m of (msgs ?? []) as Array<{ inquiry_id: string; body: string; created_at: string }>) {
    if (!last.has(m.inquiry_id)) last.set(m.inquiry_id, { body: m.body, at: m.created_at });
  }
  return rows
    .filter((r) => last.has(r.id))
    .map((r) => ({ id: r.id, title: r.company?.trim() || "", lastBody: last.get(r.id)?.body ?? null, lastAt: last.get(r.id)?.at ?? null }))
    .sort((a, b) => Date.parse(b.lastAt ?? "") - Date.parse(a.lastAt ?? ""));
}

export async function loadThread(userId: string, tenantId: string, inquiryId: string): Promise<{ title: string; messages: ThreadMessage[] } | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data: inq, error } = await admin
    .from("inquiries")
    .select("id, company")
    .eq("id", inquiryId)
    .eq("client_user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("clientAccount.thread.inquiry", error);
    return null;
  }
  if (!inq) return null;
  const { data: msgs, error: msgErr } = await admin
    .from("inquiry_messages")
    .select("id, body, created_at, sender_user_id")
    .eq("tenant_id", tenantId)
    .eq("inquiry_id", inquiryId)
    .eq("thread_type", CLIENT_THREAD)
    .is("deleted_at", null)
    .neq("message_kind", INTERNAL_NOTE_KIND)
    .order("created_at", { ascending: true })
    .limit(300);
  if (msgErr) {
    logServerError("clientAccount.thread.messages", msgErr);
    return null;
  }
  return {
    title: (inq as { company: string | null }).company?.trim() || "",
    messages: ((msgs ?? []) as Array<{ id: string; body: string; created_at: string; sender_user_id: string | null }>).map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.created_at,
      mine: m.sender_user_id === userId,
    })),
  };
}

export type ReceiptRow = { code: string; title: string; paidCents: number; currency: string; paidAt: string | null };

type OwnedOrderBooking = { id: string; title: string | null; order_id: string; tenant_id: string; currency_code: string | null };

async function ownedBookingsWithOrders(userId: string, tenantId: string): Promise<OwnedOrderBooking[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("agency_bookings")
    .select("id, title, order_id, tenant_id, currency_code")
    .eq("client_user_id", userId)
    .eq("tenant_id", tenantId)
    .not("order_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    logServerError("clientAccount.receipts.bookings", error);
    return [];
  }
  return (data ?? []) as OwnedOrderBooking[];
}

export async function loadReceipts(userId: string, tenantId: string): Promise<ReceiptRow[]> {
  const admin = createServiceRoleClient();
  const bookings = await ownedBookingsWithOrders(userId, tenantId);
  if (!admin || bookings.length === 0) return [];
  const orderIds = bookings.map((b) => b.order_id);
  const [orders, txns] = await Promise.all([
    admin.from("orders").select("id, receipt_code").eq("tenant_id", tenantId).in("id", orderIds).not("receipt_code", "is", null),
    admin.from("booking_transactions").select("order_id, gross_amount_cents, currency, paid_at, status").in("order_id", orderIds).eq("status", "paid"),
  ]);
  if (orders.error) logServerError("clientAccount.receipts.orders", orders.error);
  if (txns.error) logServerError("clientAccount.receipts.txns", txns.error);
  const codes = new Map<string, string>();
  for (const o of (orders.data ?? []) as Array<{ id: string; receipt_code: string }>) codes.set(o.id, o.receipt_code);
  const paid = new Map<string, { cents: number; currency: string | null; at: string | null }>();
  for (const t of (txns.data ?? []) as Array<{ order_id: string; gross_amount_cents: number; currency: string | null; paid_at: string | null }>) {
    const cur = paid.get(t.order_id);
    paid.set(t.order_id, {
      cents: (cur?.cents ?? 0) + (Number(t.gross_amount_cents) || 0),
      currency: t.currency ?? cur?.currency ?? null,
      at: [cur?.at, t.paid_at].filter(Boolean).sort().pop() ?? null,
    });
  }
  const out: ReceiptRow[] = [];
  for (const b of bookings) {
    const code = codes.get(b.order_id);
    const p = paid.get(b.order_id);
    if (!code || !p || p.cents <= 0) continue;
    out.push({ code, title: b.title?.trim() || "", paidCents: p.cents, currency: (p.currency ?? b.currency_code ?? "USD").toUpperCase(), paidAt: p.at });
  }
  return out;
}

export type ReceiptDetail = {
  code: string;
  title: string;
  seller: string;
  currency: string;
  paidCents: number;
  paidAt: string | null;
  lines: ReceiptLine[];
};

/** The receipt of ONE order this client owns on this tenant. Amounts are read from the ledger. */
export async function loadReceiptDetail(userId: string, tenantId: string, code: string): Promise<ReceiptDetail | null> {
  const admin = createServiceRoleClient();
  if (!admin || !code) return null;
  const { data: order, error } = await admin
    .from("orders")
    .select("id")
    .eq("receipt_code", code)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("clientAccount.receipt.order", error);
    return null;
  }
  const orderId = (order as { id?: string } | null)?.id;
  if (!orderId) return null;
  const { data: bk, error: bkErr } = await admin
    .from("agency_bookings")
    .select("id, title, currency_code")
    .eq("order_id", orderId)
    .eq("tenant_id", tenantId)
    .eq("client_user_id", userId)
    .limit(1)
    .maybeSingle();
  if (bkErr) {
    logServerError("clientAccount.receipt.booking", bkErr);
    return null;
  }
  const b = bk as { id: string; title: string | null; currency_code: string | null } | null;
  if (!b) return null;
  const [{ data: txns, error: txnErr }, { data: ag, error: agErr }] = await Promise.all([
    admin.from("booking_transactions").select("gross_amount_cents, currency, paid_at").eq("order_id", orderId).eq("status", "paid"),
    admin.from("agencies").select("display_name").eq("id", tenantId).maybeSingle(),
  ]);
  if (txnErr) logServerError("clientAccount.receipt.txns", txnErr);
  if (agErr) logServerError("clientAccount.receipt.seller", agErr);
  const paid = (txns ?? []) as Array<{ gross_amount_cents: number; currency: string | null; paid_at: string | null }>;
  const paidCents = paid.reduce((s, t) => s + (Number(t.gross_amount_cents) || 0), 0);
  if (paidCents <= 0) return null;
  let lines: ReceiptLine[];
  try {
    lines = shapeReceiptLines(bookingClientFeeLines(await loadBookingCommissionSnapshots(admin, b.id), paidCents), paidCents);
  } catch (e) {
    logServerError("clientAccount.receipt.lines", e);
    lines = shapeReceiptLines([], paidCents);
  }
  return {
    code,
    title: b.title?.trim() || "",
    seller: (ag as { display_name?: string | null } | null)?.display_name?.trim() || "",
    currency: (paid[0]?.currency ?? b.currency_code ?? "USD").toUpperCase(),
    paidCents,
    paidAt: paid.map((t) => t.paid_at).filter(Boolean).sort().pop() ?? null,
    lines,
  };
}

export async function loadAccountProfile(userId: string) {
  const admin = createServiceRoleClient();
  if (!admin) return { name: "", phone: "", locale: "en", marketingOptIn: false };
  const [p, c] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    admin.from("client_profiles").select("phone, preferred_locale, marketing_opt_in").eq("user_id", userId).maybeSingle(),
  ]);
  if (p.error) logServerError("clientAccount.settings.profileRead", p.error);
  if (c.error) logServerError("clientAccount.settings.clientRead", c.error);
  const pr = p.data as { display_name?: string | null } | null;
  const cr = c.data as { phone?: string | null; preferred_locale?: string | null; marketing_opt_in?: boolean | null } | null;
  return {
    name: pr?.display_name ?? "",
    phone: cr?.phone ?? "",
    locale: cr?.preferred_locale === "es" ? "es" : "en",
    marketingOptIn: cr?.marketing_opt_in === true,
  };
}

/** Open pay links for this client's unpaid or part-paid bookings on this tenant. */
export async function loadOwedPayLinks(userId: string, tenantId: string): Promise<Array<{ title: string; code: string }>> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("agency_bookings")
    .select("title, order_id")
    .eq("client_user_id", userId)
    .eq("tenant_id", tenantId)
    .in("payment_status", ["unpaid", "partial"])
    .not("order_id", "is", null)
    .limit(50);
  if (error) {
    logServerError("clientAccount.payLinks.bookings", error);
    return [];
  }
  const rows = (data ?? []) as Array<{ title: string | null; order_id: string }>;
  if (rows.length === 0) return [];
  const { data: links, error: linkErr } = await admin
    .from("payment_links")
    .select("code, order_id")
    .eq("tenant_id", tenantId)
    .eq("status", "open")
    .gt("expires_at", new Date().toISOString())
    .in("order_id", rows.map((r) => r.order_id));
  if (linkErr) {
    logServerError("clientAccount.payLinks.links", linkErr);
    return [];
  }
  const byOrder = new Map<string, string>();
  for (const l of (links ?? []) as Array<{ code: string; order_id: string }>) if (!byOrder.has(l.order_id)) byOrder.set(l.order_id, l.code);
  return rows.flatMap((r) => {
    const code = byOrder.get(r.order_id);
    return code ? [{ title: r.title?.trim() || "", code }] : [];
  });
}
