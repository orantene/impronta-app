import "server-only";

import { parseTenantCommercialTerms } from "@/lib/billing/commercial-terms";
import { resolveTenantBrand, type EmailBrand } from "@/lib/brand/resolve-tenant-brand";
import { sendEmailResult } from "@/lib/email";
import { resolveTenantReplyTo } from "@/lib/email/resend-client";
import {
  renderTicketIssuedEmail,
  ticketIssuedSubject,
  type TicketEmailAdmission,
  type TicketEmailLocale,
} from "@/lib/email/ticket-issued";
import { nightLabelWithCity, resolvePublicZone } from "@/lib/events/public-event-time";
import {
  refundPolicySentence,
  renderTicketPdf,
  ticketPdfFilename,
  type TicketPdfLine,
  type TicketPdfReceipt,
} from "@/lib/events/ticket-pdf";
import { logServerError } from "@/lib/server/safe-error";
import { signAdmissionToken } from "@/lib/sessions/admission-token";

/**
 * Ticket delivery: the one path that e-mails a guest their admission(s) with
 * the QR, the code, the `/ticket/<token>` link, and the PDF that is receipt
 * and ticket in one (one page per admission).
 *
 * Every minter (Stripe webhook, POS counter, door settle, $0 web order, comp)
 * calls in here after `mintAdmissionsForPaidOrder`; resend and the Event Day
 * "Delivery" sheet call in with `force`. Nothing else composes a ticket mail.
 * The public download route (`/api/tickets/<token>/pdf`) reuses the same
 * facts loader and renderer through `buildTicketPdfForAdmission`, so the
 * file a guest downloads is byte-for-byte the file they were mailed.
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
 *
 * LOCALE (D-163). The guest's, never the desk's. The chain is:
 *   1. an explicit GUEST locale (the page the guest bought on);
 *   2. `customers.locale` on the order's customer;
 *   3. the workspace's PUBLIC default site locale
 *      (`agency_business_identity.default_locale`, what the storefront
 *      serves unprefixed);
 *   4. the brand resolver's locale (same source, cached); then "en".
 * Staff-triggered sends (a comp, the Delivery sheet) pass NO locale: the
 * language the desk's dashboard is in says nothing about the guest.
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

const ADMISSION_COLUMNS =
  "id, token_version, holder_name, holder_email, session_id, order_line_id, customer_id, party_size, status";

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

function normalizeLocale(raw: string | null | undefined): TicketEmailLocale | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  return s.startsWith("es") ? "es" : "en";
}

/**
 * The locale chain, pure so it can be pinned. `explicit` is a GUEST locale
 * only; a caller holding a staff session passes null (see D-163 above).
 */
export function pickTicketLocale(candidates: {
  explicit: string | null | undefined;
  customer: string | null | undefined;
  tenantDefault: string | null | undefined;
  brand: string | null | undefined;
}): TicketEmailLocale {
  return (
    normalizeLocale(candidates.explicit) ??
    normalizeLocale(candidates.customer) ??
    normalizeLocale(candidates.tenantDefault) ??
    normalizeLocale(candidates.brand) ??
    "en"
  );
}

/** The workspace's public default site locale, the one the storefront serves unprefixed. */
async function tenantDefaultLocale(admin: DeliveryAdmin, tenantId: string): Promise<string | null> {
  const row = await one<{ default_locale?: string | null }>(
    "identity",
    admin.from("agency_business_identity").select("default_locale").eq("tenant_id", tenantId).maybeSingle(),
  );
  return row?.default_locale ?? null;
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
  const { data: claimed, error: cErr } = await claim.select(ADMISSION_COLUMNS);
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

    // 3. Locale: guest → customer → workspace public default → brand → en.
    const brand = await resolveTenantBrand(input.tenantId);
    const locale = pickTicketLocale({
      explicit: input.locale,
      customer: customerLocale,
      tenantDefault: await tenantDefaultLocale(admin, input.tenantId),
      brand: brand.locale,
    });

    // 4. Facts: the night, the venue, the tier per admission, the receipt.
    const facts = await ticketFacts(admin, input.tenantId, rows, orderId, locale);
    const admissions = signAdmissions(rows, facts, brand);
    if (admissions.length === 0) {
      await release();
      return { ok: false, reason: "unavailable" };
    }

    // 5. The PDF. A render failure is logged and the mail still goes out
    //    with the hosted QR and the link: a guest with no attachment is
    //    better off than a guest with no mail.
    const pdf = await renderPdfSafely({ locale, brand, facts, admissions, holderName: rows[0].holder_name, orderId });

    const homeHref = brand.homeHref.replace(/\/$/, "");
    const templateInput = {
      locale,
      brand,
      eventTitle: facts.eventTitle,
      nightLabel: facts.nightLabel,
      venueName: facts.venueName,
      holderName: rows[0].holder_name,
      receiptUrl: facts.receipt.receiptCode ? `${homeHref}/r/${encodeURIComponent(facts.receipt.receiptCode)}` : null,
      admissions,
      isResend: input.force,
      attachmentName: pdf?.filename ?? null,
    };

    // 6. Send, branded from the tenant when it has a verified domain.
    const sent = await sendEmailResult({
      to,
      subject: ticketIssuedSubject(templateInput),
      html: renderTicketIssuedEmail(templateInput),
      tenantId: input.tenantId,
      tenantName: brand.accountName,
      replyTo: await resolveTenantReplyTo(input.tenantId),
      ...(pdf ? { attachments: [{ filename: pdf.filename, content: pdf.bytes, contentType: "application/pdf" }] } : {}),
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
          attachment: pdf?.filename ?? null,
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

/**
 * The PDF for the order an admission belongs to: every VALID admission on
 * that order, one page each, in the guest's locale (no explicit locale: a
 * download has no buyer page). Null when the admission is not valid, the
 * token version is stale, or nothing can be signed. The route wraps this.
 */
export async function buildTicketPdfForAdmission(
  admin: DeliveryAdmin,
  input: { tenantId: string; admissionId: string; tokenVersion: number },
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const self = await one<AdmissionRow>(
    "pdfAdmission",
    admin.from("admissions").select(ADMISSION_COLUMNS).eq("tenant_id", input.tenantId).eq("id", input.admissionId).maybeSingle(),
  );
  if (!self || self.status !== "valid" || self.token_version !== input.tokenVersion) return null;

  const orderId = await orderIdForLine(admin, input.tenantId, self.order_line_id);
  let rows: AdmissionRow[] = [self];
  if (orderId) {
    const lines = await many<{ id: string }>(
      "pdfLines",
      admin.from("order_lines").select("id").eq("tenant_id", input.tenantId).eq("order_id", orderId),
    );
    const lineIds = lines.map((l) => l.id);
    if (lineIds.length > 0) {
      const siblings = await many<AdmissionRow>(
        "pdfSiblings",
        admin.from("admissions").select(ADMISSION_COLUMNS).eq("tenant_id", input.tenantId).in("order_line_id", lineIds).eq("status", "valid"),
      );
      if (siblings.some((r) => r.id === self.id)) {
        // Stable order: the requested admission first, then the rest by id.
        rows = [self, ...siblings.filter((r) => r.id !== self.id).sort((a, b) => a.id.localeCompare(b.id))];
      }
    }
  }

  const brand = await resolveTenantBrand(input.tenantId);
  const contact = orderId ? await orderContact(admin, input.tenantId, orderId) : { email: null, locale: null, receiptCode: null };
  const locale = pickTicketLocale({
    explicit: null,
    customer: contact.locale,
    tenantDefault: await tenantDefaultLocale(admin, input.tenantId),
    brand: brand.locale,
  });
  const facts = await ticketFacts(admin, input.tenantId, rows, orderId, locale);
  const admissions = signAdmissions(rows, facts, brand);
  if (admissions.length === 0) return null;
  return renderPdfSafely({ locale, brand, facts, admissions, holderName: self.holder_name, orderId });
}

function signAdmissions(rows: AdmissionRow[], facts: TicketFacts, brand: EmailBrand): TicketEmailAdmission[] {
  const homeHref = brand.homeHref.replace(/\/$/, "");
  const admissions: TicketEmailAdmission[] = [];
  for (const r of rows) {
    const token = signAdmissionToken(r.id, r.token_version);
    if (!token) continue;
    admissions.push({
      code: token,
      qrUrl: `${homeHref}/api/tickets/${encodeURIComponent(token)}/qr`,
      ticketUrl: `${homeHref}/ticket/${encodeURIComponent(token)}`,
      tierLabel: facts.tierByAdmission.get(r.id) ?? facts.eventTitle,
      partySize: Math.max(1, r.party_size ?? 1),
      seatLabel: null,
    });
  }
  return admissions;
}

async function renderPdfSafely(args: {
  locale: TicketEmailLocale;
  brand: EmailBrand;
  facts: TicketFacts;
  admissions: TicketEmailAdmission[];
  holderName: string | null;
  orderId: string | null;
}): Promise<{ bytes: Uint8Array; filename: string } | null> {
  try {
    const bytes = await renderTicketPdf({
      locale: args.locale,
      brand: args.brand,
      eventTitle: args.facts.eventTitle,
      nightLabel: args.facts.nightLabel,
      venueName: args.facts.venueName,
      venueAddress: args.facts.venueAddress,
      holderName: args.holderName,
      admissions: args.admissions,
      receipt: args.facts.receipt,
      refundPolicy: args.facts.refundPolicy,
    });
    const filename = ticketPdfFilename(args.locale, args.facts.receipt.receiptCode, (args.orderId ?? "").slice(0, 8));
    return { bytes, filename };
  } catch (err) {
    logServerError("events.ticketDelivery/pdf", err);
    return null;
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

type TicketFacts = {
  eventTitle: string;
  nightLabel: string;
  venueName: string | null;
  venueAddress: string | null;
  tierByAdmission: Map<string, string>;
  receipt: TicketPdfReceipt;
  refundPolicy: string;
};

type OrderLineRow = { id: string; label: string | null; units?: number | string | null; unit_cents?: number | null; total_cents?: number | null };

/**
 * Everything the mail and the PDF state, read in the guest's locale so the
 * night label and the copy agree (they used to be read from two different
 * columns and could disagree).
 */
async function ticketFacts(
  admin: DeliveryAdmin,
  tenantId: string,
  rows: AdmissionRow[],
  orderId: string | null,
  locale: TicketEmailLocale,
): Promise<TicketFacts> {
  const sessionId = rows.find((r) => r.session_id)?.session_id ?? null;
  let eventTitle = "";
  let nightLabel = "";
  let venueName: string | null = null;
  let venueAddress: string | null = null;
  let cutoffHours: number | null = null;
  if (sessionId) {
    const s = await one<{ starts_at?: string | null; event_id?: string | null }>(
      "session",
      admin.from("sessions").select("starts_at, event_id").eq("tenant_id", tenantId).eq("id", sessionId).maybeSingle(),
    );
    if (s?.event_id) {
      const e = await one<{ title?: string | null; venue_id?: string | null; refund_cutoff_hours?: number | null }>(
        "event",
        admin.from("events").select("title, venue_id, refund_cutoff_hours").eq("tenant_id", tenantId).eq("id", s.event_id).maybeSingle(),
      );
      eventTitle = e?.title ?? "";
      cutoffHours = typeof e?.refund_cutoff_hours === "number" ? e.refund_cutoff_hours : null;
      let zone: string | null = null;
      if (e?.venue_id) {
        const v = await one<{
          name?: string | null;
          timezone?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          region?: string | null;
          postal_code?: string | null;
        }>(
          "venue",
          admin.from("venues").select("name, timezone, address_line1, address_line2, city, region, postal_code").eq("id", e.venue_id).maybeSingle(),
        );
        venueName = v?.name ?? null;
        zone = v?.timezone ?? null;
        venueAddress =
          [v?.address_line1, v?.address_line2, [v?.city, v?.region].filter(Boolean).join(", ") || null, v?.postal_code]
            .map((x) => (typeof x === "string" ? x.trim() : ""))
            .filter(Boolean)
            .join(", ") || null;
      }
      const w = await one<{ timezone?: string | null }>("workspace", admin.from("agencies").select("timezone").eq("id", tenantId).maybeSingle());
      const publicZone = resolvePublicZone({ venue: zone, workspace: w?.timezone ?? null });
      nightLabel = nightLabelWithCity(s.starts_at ?? null, publicZone, locale);
    }
  }

  // Lines: the whole order's when we know the order (the receipt lists them
  // all), else just the admissions' own lines.
  const lineIdsOfRows = Array.from(new Set(rows.map((r) => r.order_line_id).filter((x): x is string => Boolean(x))));
  const lines = orderId
    ? await many<OrderLineRow>("lines", admin.from("order_lines").select("id, label, units, unit_cents, total_cents").eq("tenant_id", tenantId).eq("order_id", orderId))
    : lineIdsOfRows.length > 0
      ? await many<OrderLineRow>("lines", admin.from("order_lines").select("id, label, units, unit_cents, total_cents").eq("tenant_id", tenantId).in("id", lineIdsOfRows))
      : [];
  const tierByAdmission = new Map<string, string>();
  const labelByLine = new Map(lines.map((l) => [l.id, l.label ?? ""]));
  for (const r of rows) if (r.order_line_id) tierByAdmission.set(r.id, labelByLine.get(r.order_line_id) || eventTitle);
  const receiptLines: TicketPdfLine[] = lines.map((l) => {
    const qty = Number(l.units ?? 1);
    return {
      label: l.label ?? eventTitle,
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      unitCents: l.unit_cents ?? 0,
      totalCents: l.total_cents ?? 0,
    };
  });

  // The order's money and the transaction's tender.
  let receipt: TicketPdfReceipt = {
    receiptCode: null,
    orderRef: orderId,
    currency: "USD",
    lines: receiptLines,
    subtotalCents: receiptLines.reduce((a, l) => a + l.totalCents, 0),
    discountCents: 0,
    tipCents: 0,
    totalCents: receiptLines.reduce((a, l) => a + l.totalCents, 0),
    tender: { provider: null, paidVia: null },
    paidAt: null,
  };
  if (orderId) {
    const order = await one<{
      receipt_code?: string | null;
      currency?: string | null;
      subtotal_cents?: number | null;
      discount_cents?: number | null;
      tip_cents?: number | null;
      total_cents?: number | null;
    }>("receipt", admin.from("orders").select("receipt_code, currency, subtotal_cents, discount_cents, tip_cents, total_cents").eq("tenant_id", tenantId).eq("id", orderId).maybeSingle());
    const txn = await one<{ provider?: string | null; metadata?: Record<string, unknown> | null; paid_at?: string | null; created_at?: string | null }>(
      "tender",
      admin
        .from("booking_transactions")
        .select("provider, metadata, paid_at, created_at")
        .eq("source_tenant_id", tenantId)
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    const paidVia = txn?.metadata && typeof txn.metadata.paid_via === "string" ? txn.metadata.paid_via : null;
    receipt = {
      ...receipt,
      receiptCode: order?.receipt_code ?? null,
      currency: order?.currency ?? receipt.currency,
      subtotalCents: order?.subtotal_cents ?? receipt.subtotalCents,
      discountCents: order?.discount_cents ?? 0,
      tipCents: order?.tip_cents ?? 0,
      totalCents: order?.total_cents ?? receipt.totalCents,
      tender: { provider: txn?.provider ?? null, paidVia },
      paidAt: txn?.paid_at ?? txn?.created_at ?? null,
    };
  }

  // Refunds: the event's own cutoff, else the workspace commercial default.
  let workspaceKey: string | null = null;
  if (cutoffHours === null) {
    const a = await one<{ settings?: unknown }>("settings", admin.from("agencies").select("settings").eq("id", tenantId).maybeSingle());
    workspaceKey = parseTenantCommercialTerms(a?.settings)?.refundPolicy ?? null;
  }
  const refundPolicy = refundPolicySentence(locale, { cutoffHours, workspaceKey });

  return { eventTitle, nightLabel, venueName, venueAddress, tierByAdmission, receipt, refundPolicy };
}
