/**
 * PDF builder for talent payout statements.
 *
 * Uses pdf-lib (already installed). Returns a Uint8Array suitable for
 * streaming as application/pdf. No server-only import needed — pure
 * library code that runs in API route handlers.
 *
 * Layout:
 *   Header:  Tulala wordmark + "Payout Statement"
 *   Block 1: Booking details (title, date, venue/client)
 *   Block 2: Payment breakdown (gross, commission, net)
 *   Block 3: Payout status + account-ending (last chars of provider_account_id)
 *   Footer:  Document ID + generated timestamp
 */

import "server-only";

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type PayoutStatementData = {
  bookingId: string;
  bookingTitle: string;
  eventDate: string | null;
  clientName: string | null;
  venueName: string | null;
  currency: string;
  grossCents: number;
  netCents: number;
  commissionBps: number;
  payoutStatus: string;
  transferredAt: string | null;
  accountEnding: string | null; // last 4 chars of provider_account_id
  agencyName: string;
};

function fmtMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`;
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

const INK = rgb(0.04, 0.04, 0.05);
const MUTED = rgb(0.45, 0.45, 0.48);
const ACCENT = rgb(0.059, 0.31, 0.243); // forest green
const DIVIDER = rgb(0.88, 0.88, 0.9);

export async function buildPayoutStatementPdf(
  data: PayoutStatementData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4

  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);

  const { width, height } = page.getSize();
  const marginL = 56;
  const marginR = width - 56;
  let y = height - 64;

  // ── Header ──────────────────────────────────────────────────────────
  page.drawText("TULALA", {
    x: marginL,
    y,
    size: 18,
    font: helveticaBold,
    color: ACCENT,
  });
  page.drawText("Payout Statement", {
    x: marginL,
    y: y - 20,
    size: 11,
    font: helvetica,
    color: MUTED,
  });

  // Right: document reference
  const docRef = `PST-${data.bookingId.slice(0, 8).toUpperCase()}`;
  const refW = helveticaBold.widthOfTextAtSize(docRef, 9);
  page.drawText(docRef, {
    x: marginR - refW,
    y,
    size: 9,
    font: helveticaBold,
    color: MUTED,
  });
  const genLabel = `Generated ${fmtDate(new Date().toISOString())}`;
  const genW = helvetica.widthOfTextAtSize(genLabel, 8);
  page.drawText(genLabel, {
    x: marginR - genW,
    y: y - 14,
    size: 8,
    font: helvetica,
    color: MUTED,
  });

  y -= 52;

  // ── Divider ──────────────────────────────────────────────────────────
  page.drawLine({
    start: { x: marginL, y },
    end: { x: marginR, y },
    thickness: 0.75,
    color: DIVIDER,
  });
  y -= 28;

  // ── Section: Booking details ─────────────────────────────────────────
  const sectionTitle = (label: string) => {
    page.drawText(label.toUpperCase(), {
      x: marginL,
      y,
      size: 7.5,
      font: helveticaBold,
      color: MUTED,
    });
    y -= 18;
  };

  const row = (label: string, value: string) => {
    page.drawText(label, {
      x: marginL,
      y,
      size: 9,
      font: helvetica,
      color: MUTED,
    });
    page.drawText(value, {
      x: marginL + 140,
      y,
      size: 9,
      font: helvetica,
      color: INK,
    });
    y -= 16;
  };

  sectionTitle("Booking details");
  row("Booking title", data.bookingTitle);
  row("Agency", data.agencyName);
  row("Event date", fmtDate(data.eventDate));
  row("Client / project", data.clientName ?? "—");
  row("Venue", data.venueName ?? "—");

  y -= 10;
  page.drawLine({
    start: { x: marginL, y },
    end: { x: marginR, y },
    thickness: 0.5,
    color: DIVIDER,
  });
  y -= 24;

  // ── Section: Payment breakdown ───────────────────────────────────────
  sectionTitle("Payment breakdown");

  const commissionPct = ((data.commissionBps / 10000) * 100).toFixed(1);
  const commissionCents = data.grossCents - data.netCents;

  row("Gross booking value", fmtMoney(data.grossCents, data.currency));
  row(`Agency commission (${commissionPct}%)`, `− ${fmtMoney(commissionCents, data.currency)}`);

  y -= 4;
  page.drawLine({
    start: { x: marginL + 140, y },
    end: { x: marginR, y },
    thickness: 0.5,
    color: DIVIDER,
  });
  y -= 14;

  // Net — larger, darker
  page.drawText("Your net payout", {
    x: marginL,
    y,
    size: 10,
    font: helveticaBold,
    color: INK,
  });
  page.drawText(fmtMoney(data.netCents, data.currency), {
    x: marginL + 140,
    y,
    size: 10,
    font: helveticaBold,
    color: ACCENT,
  });
  y -= 24;

  page.drawLine({
    start: { x: marginL, y },
    end: { x: marginR, y },
    thickness: 0.5,
    color: DIVIDER,
  });
  y -= 24;

  // ── Section: Payout status ───────────────────────────────────────────
  sectionTitle("Payout status");

  row("Status", data.payoutStatus.charAt(0).toUpperCase() + data.payoutStatus.slice(1));
  if (data.transferredAt) {
    row("Transfer date", fmtDate(data.transferredAt));
  }
  if (data.accountEnding) {
    row("Account ending", `••••${data.accountEnding}`);
  }

  y -= 20;

  // ── Footer ──────────────────────────────────────────────────────────
  const footerY = 40;
  page.drawLine({
    start: { x: marginL, y: footerY + 14 },
    end: { x: marginR, y: footerY + 14 },
    thickness: 0.5,
    color: DIVIDER,
  });
  page.drawText(
    "This document is for informational purposes only and does not constitute a tax receipt.",
    {
      x: marginL,
      y: footerY,
      size: 7.5,
      font: helvetica,
      color: MUTED,
    },
  );

  const bytes = await doc.save();
  return bytes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data-fetch + auth-gated wrapper (CONTRACT entry point used by the GET route).
//
// `buildPayoutStatementPdf` above is a pure renderer. The route, however, only
// has a bookingId + the authed user — so this wrapper resolves the talent's own
// payout leg, AUTH-GATES it to that talent, shapes the data, and renders.
// ─────────────────────────────────────────────────────────────────────────────

export type PayoutStatementResult =
  | { ok: true; bytes: Uint8Array; filename: string }
  | { ok: false; reason: "not_found" | "forbidden" | "error" };

type PayoutBookingRow = {
  id: string;
  title: string | null;
  currency_code: string | null;
  event_date: string | null;
  starts_at: string | null;
  venue_name: string | null;
  client_account_name: string | null;
  contact_name: string | null;
  tenant_id: string | null;
};

type PayoutLegRow = {
  talent_profile_id: string | null;
  amount_cents: number | null;
  currency: string | null;
  status: string | null;
  destination_account_id: string | null;
  transferred_at: string | null;
};

const PAYOUT_STATUS_LABEL: Record<string, string> = {
  transferred: "Paid",
  held: "Pending",
  failed: "Failed",
  reversed: "Reversed",
};

export async function generatePayoutStatementPdf(
  bookingId: string,
  authUserId: string,
): Promise<PayoutStatementResult> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "error" };

    const { data: booking, error } = await admin
      .from("agency_bookings")
      .select(
        "id, title, currency_code, event_date, starts_at, venue_name, " +
          "client_account_name, contact_name, tenant_id",
      )
      .eq("id", bookingId)
      .returns<PayoutBookingRow[]>()
      .maybeSingle();
    if (error) {
      logServerError("pdf.payout.load", error);
      return { ok: false, reason: "error" };
    }
    if (!booking) return { ok: false, reason: "not_found" };

    // Resolve the caller's talent profile(s).
    const { data: profiles } = await admin
      .from("talent_profiles")
      .select("id, display_name")
      .eq("user_id", authUserId);
    const profileIds = (profiles ?? []).map((p) => p.id as string).filter(Boolean);
    if (profileIds.length === 0) return { ok: false, reason: "forbidden" };

    // AUTH GATE — caller must own a TALENT payout leg on this booking.
    const { data: legs } = await admin
      .from("booking_payouts")
      .select(
        "talent_profile_id, amount_cents, currency, status, " +
          "destination_account_id, transferred_at",
      )
      .eq("booking_id", bookingId)
      .eq("party", "talent")
      .in("talent_profile_id", profileIds)
      .returns<PayoutLegRow[]>();

    const leg = (legs ?? [])[0] as PayoutLegRow | undefined;
    if (!leg) return { ok: false, reason: "forbidden" };

    const currency =
      (leg.currency as string) || (booking.currency_code as string) || "USD";
    const netCents = typeof leg.amount_cents === "number" ? leg.amount_cents : 0;
    const status = (leg.status as string) || "held";

    // Gross + commission bps from the per-booking commission snapshot (if any).
    const { data: snap } = await admin
      .from("booking_commission_snapshot")
      .select("gross_cents, platform_take_bps")
      .eq("booking_id", bookingId)
      .maybeSingle();

    const accountEnding = await loadAccountEnding(
      admin,
      leg.destination_account_id as string | null,
      leg.talent_profile_id as string | null,
    );

    const brand = await loadBrand(admin, booking.tenant_id as string | null);
    const statementNo = `PST-${bookingId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

    const bytes = await buildPayoutStatementPdf({
      bookingId,
      bookingTitle: (booking.title as string) || "Booking",
      eventDate:
        (booking.event_date as string | null) ?? (booking.starts_at as string | null),
      clientName:
        (booking.client_account_name as string | null) ??
        (booking.contact_name as string | null),
      venueName: (booking.venue_name as string | null) ?? null,
      currency,
      grossCents:
        typeof snap?.gross_cents === "number" ? (snap.gross_cents as number) : netCents,
      netCents,
      commissionBps:
        typeof snap?.platform_take_bps === "number"
          ? (snap.platform_take_bps as number)
          : 0,
      payoutStatus: PAYOUT_STATUS_LABEL[status] ?? status,
      transferredAt: leg.transferred_at as string | null,
      accountEnding,
      agencyName: brand,
    });

    return {
      ok: true,
      bytes,
      filename: `payout-statement-${statementNo}.pdf`,
    };
  } catch (err) {
    logServerError("pdf.payout.generate", err);
    return { ok: false, reason: "error" };
  }
}

/** Last 4 of the destination account; never exposes the full id. */
async function loadAccountEnding(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  destinationAccountId: string | null,
  talentProfileId: string | null,
): Promise<string | null> {
  const fromLeg = last4(destinationAccountId);
  if (fromLeg) return fromLeg;
  if (!talentProfileId) return null;
  try {
    const { data } = await admin
      .from("payout_accounts")
      .select("provider_account_id")
      .eq("owner_type", "talent")
      .eq("owner_id", talentProfileId)
      .order("connected_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return last4((data?.provider_account_id as string | null) ?? null);
  } catch {
    return null;
  }
}

function last4(id: string | null): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  if (trimmed.length < 4) return null;
  return trimmed.slice(-4);
}

async function loadBrand(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string | null,
): Promise<string> {
  if (!tenantId) return "Tulala";
  try {
    const { data } = await admin
      .from("agencies")
      .select("display_name")
      .eq("id", tenantId)
      .maybeSingle();
    return (data?.display_name as string | null) || "Tulala";
  } catch {
    return "Tulala";
  }
}
