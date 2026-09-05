import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { getPublicTenantScope } from "@/lib/saas/scope";
import { createClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { pickTimezone } from "@/lib/spaces/venue-timezone";
import { signAdmissionToken } from "@/lib/sessions/admission-token";
import { encodeQr } from "@/lib/links/qr";
import { toSvg } from "@/lib/links/qr/render";
import { formatOrderMoney } from "@/lib/orders/money-format";

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

function whenLabel(iso: string | null, timeZone: string): string {
  if (!iso) return "Date to be announced";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date to be announced";
  try {
    return d.toLocaleString(undefined, {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d.toISOString();
  }
}

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
  const raw: unknown = data ?? null;
  const receipt = (Array.isArray(raw) ? ((raw[0] as Receipt | undefined) ?? null) : (raw as Receipt | null));
  if (!receipt || typeof receipt !== "object" || !("order" in receipt) || !receipt.order) notFound();

  // A receipt code is scoped to the tenant that issued it. A valid code from
  // another tenant presented on this host is treated exactly as an unknown one,
  // so a host learns nothing about another workspace's sales.
  if (receipt.order.tenantId !== scope.tenantId) notFound();

  // Venue timezone, through the ladder. Errors logged, never 404: an
  // unreadable zone is not a reason to hide a receipt, and the ladder falls
  // back knowingly.
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
  const { data: zoneRows, error: zoneErr } = venueIds.length
    ? await supabase.from("venues").select("id, timezone").in("id", venueIds)
    : { data: [] as Array<Record<string, unknown>>, error: null };
  if (zoneErr) logServerError("receipt.read/venueZones", zoneErr);

  const { data: agencyRow, error: agencyErr } = await supabase
    .from("agencies")
    .select("timezone")
    .eq("id", scope.tenantId)
    .maybeSingle();
  if (agencyErr) logServerError("receipt.read/workspaceZone", agencyErr);

  const zone = pickTimezone({
    venue: (zoneRows?.[0]?.timezone as string | null) ?? null,
    workspace: (agencyRow?.timezone as string | null) ?? null,
  }).timezone;

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

  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <div className="text-xs uppercase tracking-wide text-black/50">Receipt</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {isRefunded ? "Refunded" : "Your tickets"}
        </h1>
        <p className="mt-1 text-sm text-black/60">
          {whenLabel(receipt.order.createdAt, zone)} · {money(receipt.order.totalCents, receipt.order.currency)}
        </p>

        {/* Lines */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50">What you bought</h2>
          <ul className="mt-3 divide-y divide-black/10 rounded-lg border border-black/10">
            {receipt.lines.map((l) => (
              <li key={l.id} className="flex items-baseline justify-between gap-4 p-4">
                <div>
                  <div className="font-medium">{l.label}</div>
                  <div className="text-xs text-black/50">
                    {Number(l.units)} × {money(l.unitCents, receipt.order.currency)}
                  </div>
                </div>
                <div className="font-semibold">{money(l.totalCents, receipt.order.currency)}</div>
              </li>
            ))}
          </ul>
          {receipt.order.discountCents > 0 ? (
            <p className="mt-2 text-right text-sm text-black/60">
              Discount −{money(receipt.order.discountCents, receipt.order.currency)}
            </p>
          ) : null}
        </section>

        {/* Admissions — one per person or party, each with its own token */}
        {admissions.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50">
              Show at the door
            </h2>
            <p className="mt-1 text-sm text-black/60">
              One code per {admissions.some((a) => a.partySize > 1) ? "party" : "ticket"}. Each is
              scanned once.
            </p>
            <ul className="mt-3 flex flex-col gap-3">
              {admissions.map((a) => (
                <li
                  key={a.id}
                  className={`rounded-xl border p-4 ${
                    a.status === "valid" ? "border-black/10" : "border-black/10 opacity-60"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <div>
                      <div className="font-medium">
                        {a.holderName ?? (a.partySize > 1 ? `Party of ${a.partySize}` : "Ticket")}
                      </div>
                      <div className="text-xs text-black/50">
                        {a.session ? whenLabel(a.session.startsAt, zone) : "Date to be announced"}
                        {a.partySize > 1 ? ` · admits ${a.partySize}` : null}
                      </div>
                    </div>
                    {a.status !== "valid" ? (
                      <span className="text-xs font-semibold uppercase text-black/50">{a.status}</span>
                    ) : a.admittedCount >= a.partySize ? (
                      <span className="text-xs font-semibold uppercase text-black/50">Used</span>
                    ) : null}
                  </div>

                  {a.status === "valid" ? (
                    a.token ? (
                      <div className="mt-3">
                        {a.qrSvg ? (
                          // The SVG is produced by our own encoder from our own
                          // signed token — no user-authored markup reaches it.
                          // Its viewBox INCLUDES the four-module quiet zone; do
                          // not crop or pad it away with CSS — a code flush
                          // against a dark panel is the commonest door failure.
                          <div
                            className="mx-auto w-[240px] max-w-full rounded-md bg-white p-2"
                            aria-label="Ticket QR code"
                            role="img"
                            dangerouslySetInnerHTML={{ __html: a.qrSvg }}
                          />
                        ) : null}
                        {/* The typed code is always shown: it is what the door
                            reads when a camera cannot, and the only thing shown
                            when the code could not be drawn. */}
                        <code className="mt-2 block break-all rounded-md bg-black/[0.04] px-3 py-2 font-mono text-[12px] leading-relaxed">
                          {a.token}
                        </code>
                        <p className="mt-1 text-[11px] text-black/40">
                          {a.qrSvg
                            ? "Scan at the door, or show this code."
                            : "Show this code at the door. It can be typed in."}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-black/60">
                        This ticket cannot be shown yet. Please contact the venue.
                      </p>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="mt-10 text-xs text-black/40">
          Keep this link private. Anyone with it can see this receipt.
        </p>
      </main>
      <PublicFooter />
    </>
  );
}
