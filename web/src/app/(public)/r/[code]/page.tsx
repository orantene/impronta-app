import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { getPublicTenantScope } from "@/lib/saas/scope";
import { createClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { readPublicEventContext } from "@/lib/events/public-event-context";
import { resolvePublicZone, whenLabel } from "@/lib/events/public-event-time";
import { pickReceipt, receiptBelongsTo } from "@/lib/events/receipt-shape";
import { signAdmissionToken } from "@/lib/sessions/admission-token";
import { encodeQr } from "@/lib/links/qr";
import { toSvg } from "@/lib/links/qr/render";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { getRequestLocale } from "@/i18n/request-locale";
import { COPY, ReceiptPageView, type ReceiptLocale } from "./receipt-page-view";

/**
 * `/r/<code>` — the public receipt. THIS PATH IS PERMANENT.
 *
 * A receipt link is printed on a ticket and emailed to a buyer. It is not a
 * link on a page anyone can update. The VIEW behind it may be replaced (Front
 * Door's F4 will), the PATH may not — moving it strands every ticket already
 * issued, with no way to reach the holders.
 *
 * THE CODE IS THE CREDENTIAL. `orders.receipt_code` is opaque (~100 bits,
 * `generateOpaqueCode`), and possession of it is what this page trusts. So:
 *   - READ ONLY. Nothing here mutates. Cancelling, changing a party size —
 *     anything with a write — needs fresh proof of the holder, because the code
 *     is on paper and in forwarded email. That is Front Door's to build; this
 *     page must never grow a write that trusts the URL.
 *   - NO HOLDER EMAIL. `receipt_for_code` never returns it, and this page
 *     never asks. Anyone holding the paper is an unauthenticated caller,
 *     including the person the ticket was forwarded to.
 *
 * NO QR IMAGE YET, BY RULING. Nothing on the platform can draw a QR — no
 * encoder, no dependency — and rendering is the QR & Links engine's, on their
 * timeline, with their choice of encoder. So each admission shows its signed
 * token as text the door can type or scan-as-text. A receipt that works and
 * looks unfinished beats one that looks finished and does not scan: a QR that
 * renders and does not admit fails in front of a guest at the moment they are
 * being turned away, and staff cannot tell a bad encoder from a bad ticket.
 * When the renderer lands, the QR encodes THIS TOKEN — not the receipt URL.
 * Six seats is one code and six QRs.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your receipt" };

type Params = { params: Promise<{ code: string }> };

type Receipt = {
  order: {
    id: string;
    tenantId: string;
    status: string;
    currency: string;
    subtotalCents: number;
    discountCents: number;
    taxCents: number;
    totalCents: number;
    createdAt: string;
  };
  lines: Array<{
    id: string;
    label: string;
    units: number | string;
    unitCents: number;
    totalCents: number;
    sessionId: string | null;
  }>;
  admissions: Array<{
    id: string;
    tokenVersion: number;
    partySize: number;
    admittedCount: number;
    status: "valid" | "void" | "refunded";
    holderName: string | null;
    sessionId: string | null;
    startsAt: string | null;
    lineSeq: number | null;
  }>;
  sessions: Array<{
    id: string;
    startsAt: string;
    endsAt: string;
    status: string;
    eventId: string | null;
  }>;
};

// Delegates to the ONE order money formatter. This file had a third
// implementation — `${code} ${(cents/100).toFixed(2)}` — which rendered
// "ARS 4500.00": no thousands separator, and a hard /100 that is wrong for
// every zero-decimal currency. It is the surface a CUSTOMER reads at a door,
// so it was the worst of the three places to disagree.
const money = formatOrderMoney;

/**
 * The QR for ONE admission, or null.
 *
 * THE QR CARRIES THE ADMISSION TOKEN, NOT THE RECEIPT URL. Six seats is one
 * receipt code and six QRs; a QR encoding the receipt URL would identify a
 * purchase rather than admit a person, and one scan would let a party of six
 * through on the first phone. Each code verifies on its own at `check_in`.
 *
 * `ecc: "Q"` AT THE CALL SITE, ON PURPOSE. The renderer's default is `M`,
 * chosen for print, where paper is flat and lit. A door is a dim phone screen
 * at a shallow angle; `Q` buys that margin and its cost is one symbol version.
 * Never `H` on this token: `H` stops fitting at ~110 bytes and the token is
 * 100–105, so one added field would turn a working ticket into a refusal.
 *
 * SYMBOL SIZE IS A BUDGET. The signed token is 105 bytes at the version
 * ceiling, and version 8 at `Q` holds 108 — 3 bytes of headroom. Adding a
 * field to `signAdmissionToken`'s payload steps the symbol to version 9
 * silently (still fits, just bigger), and the overflow below only fires past
 * 130. So the loud log here is the early warning; the quiet signal — a
 * larger QR — will already have happened.
 *
 * PER ADMISSION, NEVER PER PAGE. `encodeQr` throws rather than truncating
 * (a truncated token scans beautifully and admits nobody). Caught here so a
 * long token costs one honest gap on one ticket, not a 500 on the receipt
 * for the buyer — the wrong person at the wrong moment. The typed code
 * remains the fallback the door can read.
 */
function qrFor(token: string, admissionId: string): string | null {
  try {
    return toSvg(encodeQr(token, { ecc: "Q" }).matrix);
  } catch (err) {
    // A bug about the TOKEN, not the renderer: it grew past a door-scannable
    // symbol. Fix upstream in `signAdmissionToken`; do not raise `ecc` here.
    logServerError(
      `receipt.qr/overflow admission=${admissionId} bytes=${Buffer.byteLength(token, "utf8")}`,
      err,
    );
    return null;
  }
}

export default async function ReceiptPage({ params }: Params) {
  const { code } = await params;
  // A code that could not have been minted is refused before any read: the
  // generator's floor is 16, and the DB CHECK mirrors it.
  if (!code || code.length < 16 || code.length > 64) notFound();

  const scope = await getPublicTenantScope();
  if (!scope) notFound();

  const supabase = await createClient();
  if (!supabase) notFound();

  // One call. Error destructured and acted on: a refusal must not render as
  // "no receipt", which is what an unknown code also looks like.
  // TOLERANT OF BOTH SHAPES, ON PURPOSE. `receipt_for_code` is scalar jsonb
  // today (a miss = one NULL) and moves to SETOF jsonb (a miss = zero rows,
  // PostgREST hands back an array) in a migration applied only AFTER this
  // page is on the running build. Changing the function's shape under the
  // deployed page turned every unknown code into a 500 for four minutes on
  // 2026-09-06 (…804, rolled back by …805). A function SHAPE change is
  // code-first; schema-first is for additive schema.
  const { data, error } = await supabase.rpc("receipt_for_code", { p_code: code });
  if (error) {
    logServerError("receipt.read", error);
    notFound();
  }
  // The shape decision is pure and pinned (`receipt-shape.test.ts`): `[]`,
  // `[null]`, `null`, an object without an order — every one refuses, none
  // throws. A guest holding a printed code gets a 404 page, never a 500.
  const picked = pickReceipt(data);
  if (!picked) notFound();
  // A receipt code is scoped to the tenant that issued it. A valid code from
  // another tenant presented on this host is treated exactly as an unknown one,
  // so a host learns nothing about another workspace's sales.
  if (!receiptBelongsTo(picked, scope.tenantId)) notFound();
  const receipt = picked as unknown as Receipt;

  // Venue + workspace zones. The anon client cannot read `venues` (staff-only
  // SELECT) or `agencies` (no anon policy) — a read returns zero rows, not an
  // error — so these are read server-side, by key, timezone only. And with NO
  // zone the night is a sentence, never a date: a ticket that names the wrong
  // night sends the guest to a shut door.
  const sessionIds = receipt.sessions.map((s) => s.id);
  const { data: venueRows, error: venueErr } = sessionIds.length
    ? await supabase.from("sessions").select("id, venue_id").in("id", sessionIds)
    : { data: [] as Array<Record<string, unknown>>, error: null };
  if (venueErr) logServerError("receipt.read/sessionVenues", venueErr);

  const venueIds = [
    ...new Set(
      (venueRows ?? []).map((v) => v.venue_id as string | null).filter((v): v is string => Boolean(v)),
    ),
  ];
  const ctx = await readPublicEventContext({ tenantId: scope.tenantId, venueId: venueIds[0] ?? null });
  const zone = resolvePublicZone({ venue: ctx.venueTimezone, workspace: ctx.workspaceTimezone });

  const sessionById = new Map(receipt.sessions.map((s) => [s.id, s]));

  // The token is signed HERE, in the app, from the id and version the database
  // returned. The database never holds the signing secret and never mints a
  // token, because a DB function that could mint a valid ticket must never
  // exist. `null` means the secret is unset — shown as such, never as a token
  // that will not verify.
  const admissions = receipt.admissions.map((a) => {
    const token = signAdmissionToken(a.id, a.tokenVersion);
    return {
      ...a,
      token,
      qrSvg: token ? qrFor(token, a.id) : null,
      session: a.sessionId ? (sessionById.get(a.sessionId) ?? null) : null,
    };
  });

  const isRefunded = receipt.order.status === "refunded";
  const rawLocale = await getRequestLocale();
  const locale: ReceiptLocale = rawLocale.toLowerCase().startsWith("es") ? "es" : "en";
  const t = (k: string) => COPY[locale][k] ?? COPY.en[k] ?? k;
  const moneyLabel = (cents: number) =>
    cents === 0 ? t("free") : money(cents, receipt.order.currency);

  const eventIds = [...new Set(receipt.sessions.map((s) => s.eventId).filter((id): id is string => Boolean(id)))];
  const { data: eventRows, error: eventErr } = eventIds.length
    ? await supabase.from("events").select("id, slug, title").eq("tenant_id", scope.tenantId).in("id", eventIds)
    : { data: [] as Array<{ id: string; slug: string | null; title: string | null }>, error: null };
  if (eventErr) logServerError("receipt.read/events", eventErr);
  const eventHref = eventRows?.[0]?.slug ? `/events/${eventRows[0].slug as string}` : null;

  return (
    <>
      <PublicHeader />
      <div className="flex-1" style={{ background: "var(--token-color-background)" }}>
      <ReceiptPageView
        locale={locale}
        isRefunded={isRefunded}
        createdAtLabel={whenLabel(receipt.order.createdAt, zone, locale)}
        totalLabel={moneyLabel(receipt.order.totalCents)}
        eventHref={eventHref}
        discountLabel={
          receipt.order.discountCents > 0
            ? t("discount").replace("{amount}", money(receipt.order.discountCents, receipt.order.currency))
            : null
        }
        lines={receipt.lines.map((l) => ({
          id: l.id,
          label: l.label,
          qtyLabel: `${Number(l.units)} × ${moneyLabel(l.unitCents)}`,
          totalLabel: moneyLabel(l.totalCents),
        }))}
        admissions={admissions.map((a) => {
          const used = a.status === "valid" && a.admittedCount >= a.partySize;
          return {
            id: a.id,
            holder: a.holderName ?? (a.partySize > 1 ? t("party").replace("{n}", String(a.partySize)) : t("ticket")),
            when: a.session ? whenLabel(a.session.startsAt, zone, locale) : t("tba"),
            admits: a.partySize > 1 ? t("admits").replace("{n}", String(a.partySize)) : null,
            badge: a.status !== "valid" ? a.status : used ? t("used") : null,
            token: a.token,
            qrSvg: a.qrSvg,
            canShow: a.status === "valid" && !used,
          };
        })}
      />
      </div>
      <PublicFooter />
    </>
  );
}
