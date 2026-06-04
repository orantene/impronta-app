/**
 * guest-trust-chip-mapper.ts — server-side mapper from existing trust/inquiry
 * data shapes into GuestTrustChipProps.
 *
 * This file is intentionally NOT marked "use server" — it is a pure mapper
 * function with no I/O, safe to call from both server components and server
 * actions.
 *
 * Callers:
 *   - A server component that has already loaded the TrustSummary from the
 *     data bridge (components/admin/shell/internal/state/types.ts) and the
 *     inquiry row (for contact_email, contact_phone, client_trust).
 *   - The getGuestThreadMessages server action (Lane A) when it needs to
 *     assemble the chip data for the talent thread header.
 */

import type {
  TrustSummary,
  ClientTrustLevel,
} from "@/components/admin/shell/internal/state/types";
import type {
  GuestTrustChipProps,
  GuestTrustTier,
  TrustSignalState,
} from "@/lib/inquiry/guest-chat-contract";

export type { GuestTrustChipProps };

/**
 * Map a TrustSummary (from the admin shell / data bridge) plus ancillary
 * inquiry data into GuestTrustChipProps ready for <GuestTrustChip />.
 *
 * Args:
 *   trustSummary      — loaded via getTrustSummary("client_profile", id) or null
 *   contactName       — inquiries.contact_name (display name shown in the chip)
 *   contactEmail      — inquiries.contact_email (null when unset)
 *   contactPhone      — inquiries.contact_phone (null when unset)
 *   clientTrustLevel  — inquiries.client_trust (denormalised on the inquiry row)
 *   completedBookings — COUNT(*) from agency_bookings WHERE client_user_id = ...
 *   isEmailVerified   — profiles.email_confirmed_at IS NOT NULL for the client user
 *   isBlocked         — a user_blocks row exists for this guest/client
 *   onBlock / onReport — server actions injected by the parent (optional)
 */
export function mapToGuestTrustChipProps({
  trustSummary,
  contactName,
  contactEmail,
  contactPhone,
  clientTrustLevel,
  completedBookings,
  isEmailVerified,
  isBlocked,
  onBlock,
  onReport,
  // Explicit signal overrides loaded server-side from real verification sources.
  // When provided they take precedence over the trustSummary.badges fallback so
  // callers that have already read the DB signals can pass them directly without
  // building a TrustSummary.  "undefined" means "fall back to badge lookup".
  phoneSignalOverride,
  socialSignalOverride,
  paymentSignalOverride,
}: {
  trustSummary: TrustSummary | null;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  clientTrustLevel: ClientTrustLevel | null;
  completedBookings: number;
  isEmailVerified: boolean;
  isBlocked: boolean;
  onBlock?: GuestTrustChipProps["onBlock"];
  onReport?: GuestTrustChipProps["onReport"];
  phoneSignalOverride?: TrustSignalState;
  socialSignalOverride?: TrustSignalState;
  paymentSignalOverride?: TrustSignalState;
}): GuestTrustChipProps {
  // ─── identity ────────────────────────────────────────────────────────────
  const identity: GuestTrustChipProps["identity"] = !contactEmail
    ? "guest"
    : isEmailVerified
      ? "email_verified"
      : trustSummary?.claimStatus === "claimed"
        ? "account"
        : "identified";

  // ─── tier ────────────────────────────────────────────────────────────────
  // ClientTrustLevel and GuestTrustTier share the same string literals —
  // the re-type is the only transformation needed.
  const tier: GuestTrustTier | null = clientTrustLevel ?? null;

  // ─── per-signal states ───────────────────────────────────────────────────
  function signalFromBadges(badgeType: string): TrustSignalState {
    if (!trustSummary?.badges) return "absent";
    const badge = trustSummary.badges.find((b) => b.type === badgeType);
    if (!badge) return "absent";
    return badge.status === "active" ? "verified" : "present_unverified";
  }

  const emailSignal: TrustSignalState = contactEmail
    ? isEmailVerified
      ? "verified"
      : "present_unverified"
    : "absent";

  // Phone: use the explicit override when the caller resolved it server-side.
  // Fallback: check trustSummary badges; if a phone_verified badge is active →
  // verified; if the phone number itself is present (but no badge) →
  // present_unverified; otherwise absent.
  const phoneSignal: TrustSignalState =
    phoneSignalOverride !== undefined
      ? phoneSignalOverride
      : contactPhone
        ? signalFromBadges("phone_verified") !== "absent"
          ? "verified"
          : "present_unverified"
        : "absent";

  // Social: use the explicit override when resolved server-side (e.g. from
  // client_integrations).  Fallback to the legacy instagram_verified badge.
  const socialSignal: TrustSignalState =
    socialSignalOverride !== undefined
      ? socialSignalOverride
      : signalFromBadges("instagram_verified");

  // Payment: use the explicit override when resolved server-side (e.g. from
  // client_trust_state.verified_at).  Fallback to the legacy badge.
  const paymentSignal: TrustSignalState =
    paymentSignalOverride !== undefined
      ? paymentSignalOverride
      : signalFromBadges("payment_verified");

  // ─── risk line ───────────────────────────────────────────────────────────
  let riskLine: string;
  if (
    completedBookings > 0 &&
    (tier === "verified" || tier === "silver" || tier === "gold")
  ) {
    const tierLabel = tier === "gold" ? "Gold" : tier === "silver" ? "Silver" : "Verified";
    riskLine = `${tierLabel} client · booked ${completedBookings}x on Tulala`;
  } else if (completedBookings > 0) {
    riskLine = `Booked ${completedBookings}x on Tulala`;
  } else if (identity === "email_verified") {
    riskLine = "Email verified — not yet booked";
  } else if (identity === "account") {
    riskLine = "Registered client — not yet booked";
  } else if (identity === "identified") {
    riskLine = "Name + email captured — not verified";
  } else {
    riskLine = "New guest — unverified";
  }

  return {
    identity,
    tier,
    displayName: contactName,
    signals: {
      email: emailSignal,
      phone: phoneSignal,
      social: socialSignal,
      payment: paymentSignal,
    },
    completedBookings,
    riskLine,
    isBlocked,
    onBlock: onBlock ?? null,
    onReport: onReport ?? null,
  };
}
