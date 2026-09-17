import "server-only";

import { resolveTenantBrand } from "@/lib/brand/resolve-tenant-brand";
import { sendEmailResult } from "@/lib/email";
import { resolveTenantReplyTo } from "@/lib/email/resend-client";
import {
  renderTicketIssuedEmail,
  ticketIssuedSubject,
  type TicketEmailAdmission,
  type TicketEmailLocale,
} from "@/lib/email/ticket-issued";
import { resolvePublicZone, whenLabel } from "@/lib/events/public-event-time";
import { logServerError } from "@/lib/server/safe-error";
import { signAdmissionToken } from "@/lib/sessions/admission-token";

/**
 * Ticket delivery: the one path that e-mails a guest their admission(s) with
 * the QR, the code and the `/ticket/<token>` link.
 *
 * Every minter (Stripe webhook, POS counter, door settle, $0 web order, comp)
 * calls in here after `mintAdmissionsForPaidOrder`; resend and the Event Day
 * "Delivery" sheet call in with `force`. Nothing else composes a ticket mail.
 *
 * SEND EXACTLY ONCE. The webhook retries, the desk double-taps, a comp form
 * re-submits: the claim is `admissions.delivery` (jsonb, null until claimed).
 * A conditional UPDATE `... WHERE delivery IS NULL RETURNING id` is the lock;
 * rows another caller already claimed come back empty and are skipped. A
 * failed send RESETS the claim so the next attempt (webhook retry, resend)
 * can try again — a failure must never look like a delivery.
 *
 * NEVER THROWS. A ticket that could not be mailed is still a valid admission
 * (the receipt page and the door lookup both work); this returns a typed
 * result and logs, it does not fail the payment that produced it.
 */

// Tests inject a fake PostgREST builder, the same shape `VenueAdmin` uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DeliveryAdmin = { from: (table: string) => any };

export type DeliveryResult =
  | { ok: true; sent: number; skipped: number }
  | { ok: false; reason: "channel_unavailable" | "not_found" | "unavailable" | "send_failed" };

type AdmissionRow = {
  id: string;
  token_version: number;
  holder_name: string | null;
  holder_email: string | null;
  session_id: string | null;
  order_line_id: string | null;
  customer_id: string | null;
  party_size: number | null;
  status: string;
};

/**
 * One checked read. PostgREST does not throw: a denied policy or a bad column
 * arrives as `data: null`, and a ticket mail with no night, no title and no
 * tier would go out looking finished. Every fact read below logs and returns
 * null on error, so the caller sees the gap.
 */
async function one<T>(label: string, q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T | null> {
  const { data, error } = await q;
  if (error) {
    logServerError(`events.ticketDelivery/${label}`, error);
    return null;
  }
  return (data ?? null) as T | null;
}

async function many<T>(label: string, q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) {
    logServerError(`events.ticketDelivery/${label}`, error);
    return [];
  }
  return ((data ?? []) as T[]);
}

function pickLocale(raw: string | null | undefined): TicketEmailLocale {
  return (raw ?? "").toLowerCase().startsWith("es") ? "es" : "en";
}

function isEmail(s: string | null | undefined): s is string {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/** All admissions minted for an order, delivered to the order's contact. */
export async function deliverTicketsForOrder(
  admin: DeliveryAdmin,
  input: { tenantId: string; orderId: string; locale?: string | null; force?: boolean },
): Promise<DeliveryResult> {
  try {
    const { data: lines, error } = await admin
      .from("order_lines")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("order_id", input.orderId);
    if (error) {
      logServerError("events.ticketDelivery/lines", error);
      return { ok: false, reason: "unavailable" };
    }
    const lineIds = ((lines ?? []) as Array<{ id: string }>).map((l) => l.id);
    if (lineIds.length === 0) return { ok: true, sent: 0, skipped: 0 };
    const { data: rows, error: aErr } = await admin
      .from("admissions")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .in("order_line_id", lineIds)
      .eq("status", "valid");
    if (aErr) {
      logServerError("events.ticketDelivery/admissions", aErr);
      return { ok: false, reason: "unavailable" };
    }
    const ids = ((rows ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (ids.length === 0) return { ok: true, sent: 0, skipped: 0 };
    return await deliverAdmissions(admin, {
      tenantId: input.tenantId,
      admissionIds: ids,
      orderId: input.orderId,
      locale: input.locale ?? null,
      force: Boolean(input.force),
    });
  } catch (err) {
    logServerError("events.ticketDelivery/order", err);
    return { ok: false, reason: "unavailable" };
  }
}

/** One admission (a comp, a resend, the Delivery sheet). */
export async function deliverTicketForAdmission(
  admin: DeliveryAdmin,
  input: { tenantId: string; admissionId: string; locale?: string | null; force?: boolean },
): Promise<DeliveryResult> {
  try {
    return await deliverAdmissions(admin, {
      tenantId: input.tenantId,
      admissionIds: [input.admissionId],
      orderId: null,
      locale: input.locale ?? null,
      force: Boolean(input.force),
    });
  } catch (err) {
    logServerError("events.ticketDelivery/admission", err);
    return { ok: false, reason: "unavailable" };
  }
}

async function deliverAdmissions(
  admin: DeliveryAdmin,
  input: { tenantId: string; admissionIds: string[]; orderId: string | null; locale: string | null; force: boolean },
): Promise<DeliveryResult> {
  const claimedAt = new Date().toISOString();

  // 1. Claim. `force` (a resend) skips the null filter and stamps `resent_at`
  //    on top of whatever delivery record exists.
  let claim = admin
    .from("admissions")
    .update(
      input.force
        ? { delivery: { method: "email", claimed_at: claimedAt, resend: true } }
        : { delivery: { method: "email", claimed_at: claimedAt } },
    )
    .eq("tenant_id", input.tenantId)
    .in("id", input.admissionIds)
    .eq("status", "valid");
  if (!input.force) claim = claim.is("delivery", null);
  const { data: claimed, error: cErr } = await claim.select(
    "id, token_version, holder_name, holder_email, session_id, order_line_id, customer_id, party_size, status",
  );
  if (cErr) {
    logServerError("events.ticketDelivery/claim", cErr);
    return { ok: false, reason: "unavailable" };
  }
  const rows = (claimed ?? []) as AdmissionRow[];
  if (rows.length === 0) {
    // Everything was already delivered (or nothing matched). Not an error:
    // this is the webhook's second pass.
    return input.admissionIds.length > 0 && !input.force
      ? { ok: true, sent: 0, skipped: input.admissionIds.length }
      : { ok: false, reason: "not_found" };
  }

  const release = async () => {
    await admin
      .from("admissions")
      .update({ delivery: null })
      .eq("tenant_id", input.tenantId)
      .in("id", rows.map((r) => r.id));
  };

  try {
    // 2. Recipient: the holder's own address, else the order's customer, else
    //    the payer on the transaction.
    const orderId = input.orderId ?? (await orderIdForLine(admin, input.tenantId, rows[0].order_line_id));
    let to = rows.map((r) => r.holder_email).find(isEmail) ?? null;
    let customerLocale: string | null = null;
    if (orderId) {
      const contact = await orderContact(admin, input.tenantId, orderId);
      if (!to && isEmail(contact.email)) to = contact.email;
      customerLocale = contact.locale;
    }
    if (!to) {
      await release();
      return { ok: false, reason: "channel_unavailable" };
    }

    // 3. Locale: the caller's (the page the guest bought on) → the customer's
    //    → the tenant's default → en.
    const brand = await resolveTenantBrand(input.tenantId);
    const locale = pickLocale(input.locale ?? customerLocale ?? brand.locale ?? "en");

    // 4. Facts: the night, the venue, the tier per admission, the receipt.
    const facts = await nightFacts(admin, input.tenantId, rows, orderId);
    const homeHref = brand.homeHref.replace(/\/$/, "");
    const admissions: TicketEmailAdmission[] = [];
    for (const r of rows) {
      const token = signAdmissionToken(r.id, r.token_version);
      if (!token) continue;
      admissions.push({
        code: token,
        qrUrl: `${homeHref}/api/tickets/${encodeURIComponent(token)}/qr.png`,
        ticketUrl: `${homeHref}/ticket/${encodeURIComponent(token)}`,
        tierLabel: facts.tierByAdmission.get(r.id) ?? facts.eventTitle,
        partySize: Math.max(1, r.party_size ?? 1),
        seatLabel: null,
      });
    }
    if (admissions.length === 0) {
      await release();
      return { ok: false, reason: "unavailable" };
    }

    const templateInput = {
      locale,
      brand,
      eventTitle: facts.eventTitle,
      nightLabel: facts.nightLabel,
      venueName: facts.venueName,
      holderName: rows[0].holder_name,
      receiptUrl: facts.receiptCode ? `${homeHref}/r/${encodeURIComponent(facts.receiptCode)}` : null,
      admissions,
      isResend: input.force,
    };

    // 5. Send, branded from the tenant when it has a verified domain.
    const sent = await sendEmailResult({
      to,
      subject: ticketIssuedSubject(templateInput),
      html: renderTicketIssuedEmail(templateInput),
      tenantId: input.tenantId,
      tenantName: brand.accountName,
      replyTo: await resolveTenantReplyTo(input.tenantId),
    });
    if (sent.status === "failed" || (sent.status === "skipped" && process.env.NODE_ENV === "production")) {
      await release();
      logServerError("events.ticketDelivery/send", sent.status === "failed" ? sent.error : "email skipped");
      return { ok: false, reason: "send_failed" };
    }
    await admin
      .from("admissions")
      .update({
        delivery: {
          method: "email",
          to,
          claimed_at: claimedAt,
          sent_at: new Date().toISOString(),
          provider: sent.status,
          ...(input.force ? { resent_at: new Date().toISOString() } : {}),
        },
      })
      .eq("tenant_id", input.tenantId)
      .in("id", rows.map((r) => r.id));
    return { ok: true, sent: rows.length, skipped: input.admissionIds.length - rows.length };
  } catch (err) {
    await release().catch(() => undefined);
    logServerError("events.ticketDelivery/deliver", err);
    return { ok: false, reason: "unavailable" };
  }
}

async function orderIdForLine(admin: DeliveryAdmin, tenantId: string, lineId: string | null): Promise<string | null> {
  if (!lineId) return null;
  const row = await one<{ order_id?: string | null }>("lineOrder", admin.from("order_lines").select("order_id").eq("tenant_id", tenantId).eq("id", lineId).maybeSingle());
  return row?.order_id ?? null;
}

async function orderContact(
  admin: DeliveryAdmin,
  tenantId: string,
  orderId: string,
): Promise<{ email: string | null; locale: string | null; receiptCode: string | null }> {
  const o = await one<{ customer_id?: string | null; receipt_code?: string | null }>(
    "order",
    admin.from("orders").select("customer_id, receipt_code").eq("tenant_id", tenantId).eq("id", orderId).maybeSingle(),
  );
  let email: string | null = null;
  let locale: string | null = null;
  if (o?.customer_id) {
    const c = await one<{ email?: string | null; locale?: string | null }>(
      "customer",
      admin.from("customers").select("email, locale").eq("tenant_id", tenantId).eq("id", o.customer_id).maybeSingle(),
    );
    email = c?.email ?? null;
    locale = c?.locale ?? null;
  }
  if (!email) {
    const txn = await one<{ payer_email?: string | null }>(
      "payer",
      admin.from("booking_transactions").select("payer_email").eq("source_tenant_id", tenantId).eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    );
    email = txn?.payer_email ?? null;
  }
  return { email, locale, receiptCode: o?.receipt_code ?? null };
}

async function nightFacts(
  admin: DeliveryAdmin,
  tenantId: string,
  rows: AdmissionRow[],
  orderId: string | null,
): Promise<{ eventTitle: string; nightLabel: string; venueName: string | null; tierByAdmission: Map<string, string>; receiptCode: string | null }> {
  const sessionId = rows.find((r) => r.session_id)?.session_id ?? null;
  let eventTitle = "";
  let nightLabel = "";
  let venueName: string | null = null;
  let locale: "en" | "es" = "en";
  if (sessionId) {
    const s = await one<{ starts_at?: string | null; event_id?: string | null }>(
      "session",
      admin.from("sessions").select("starts_at, event_id").eq("tenant_id", tenantId).eq("id", sessionId).maybeSingle(),
    );
    if (s?.event_id) {
      const e = await one<{ title?: string | null; venue_id?: string | null }>(
        "event",
        admin.from("events").select("title, venue_id").eq("tenant_id", tenantId).eq("id", s.event_id).maybeSingle(),
      );
      eventTitle = e?.title ?? "";
      let zone: string | null = null;
      if (e?.venue_id) {
        const v = await one<{ name?: string | null; timezone?: string | null }>("venue", admin.from("venues").select("name, timezone").eq("id", e.venue_id).maybeSingle());
        venueName = v?.name ?? null;
        zone = v?.timezone ?? null;
      }
      const w = await one<{ timezone?: string | null; default_locale?: string | null }>("workspace", admin.from("agencies").select("timezone, default_locale").eq("id", tenantId).maybeSingle());
      locale = pickLocale(w?.default_locale);
      const publicZone = resolvePublicZone({ venue: zone, workspace: w?.timezone ?? null });
      nightLabel = s.starts_at ? whenLabel(s.starts_at, publicZone, locale, true) : "";
    }
  }
  const tierByAdmission = new Map<string, string>();
  const lineIds = Array.from(new Set(rows.map((r) => r.order_line_id).filter((x): x is string => Boolean(x))));
  if (lineIds.length > 0) {
    const lines = await many<{ id: string; label: string | null }>("lines", admin.from("order_lines").select("id, label").eq("tenant_id", tenantId).in("id", lineIds));
    const labelByLine = new Map(lines.map((l) => [l.id, l.label ?? ""]));
    for (const r of rows) if (r.order_line_id) tierByAdmission.set(r.id, labelByLine.get(r.order_line_id) || eventTitle);
  }
  let receiptCode: string | null = null;
  if (orderId) {
    const order = await one<{ receipt_code?: string | null }>("receipt", admin.from("orders").select("receipt_code").eq("tenant_id", tenantId).eq("id", orderId).maybeSingle());
    receiptCode = order?.receipt_code ?? null;
  }
  return { eventTitle, nightLabel, venueName, tierByAdmission, receiptCode };
}
