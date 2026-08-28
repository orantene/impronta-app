"use client";

/**
 * TrustGateNudge — the friendly UI nudge shown when a guest hits their tenant's
 * active-conversation limit (server returns the contract code "limit_reached"
 * from startGuestChatInquiry; the panel branches on it in applyFailure).
 *
 * THE REFRAME (strategy §7 + §5.3): the unlock currency is VERIFICATION, never
 * dollars. A guest with the max number of conversations open is NOT asked to
 * pay — they are invited to VERIFY their email (guest/identified) or CREATE A
 * FREE ACCOUNT (email_verified), which raises their cap. The default copy
 * mentions NO money. Any legacy "$5"-style ask is reframed as "a small
 * refundable hold (you get it back, or it becomes booking credit)" — but that
 * line is OFF by default and only surfaces if a tenant explicitly opts in.
 *
 * This component never blocks — it explains, and offers the one verification
 * action that lifts the cap. onVerifyEmail is wired by the panel to the same
 * magic-link send (onAddClaimEmail with the captured email); when no action is
 * available it degrades to copy only.
 *
 * Renders nothing server-side. React-Compiler codebase: plain functions, no
 * manual memo. Brand accent via mini-chat-styles tokens; NO black/gold.
 */

import { paletteFor, type Palette, type SurfaceMode } from "./mini-chat-styles";
import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";

/** The tiers that can ever see this nudge (an "account" guest is never gated below their cap here). */
export type TrustGateNudgeTier = "guest" | "identified" | "email_verified";

export type TrustGateNudgeProps = {
  /** Trust tier — drives the copy + which unlock we offer. */
  tier: TrustGateNudgeTier;
  /** How many active conversations the guest currently has. */
  activeCount: number;
  /** The tier's cap (activeCount has reached this). */
  limit: number;
  /** Tenant brand accent (CSS color). */
  accent: string;
  /** Readable ink color for text on `accent`. */
  accentInk: string;
  /**
   * Trigger the verification/claim send (panel wires this to onAddClaimEmail
   * with the captured email). Always provided; a no-op when the panel has no
   * email/inquiry yet — in that case the button is hidden by `canVerify`.
   */
  onVerifyEmail: () => void;
  /**
   * Whether the verify action can actually run right now (panel knows whether an
   * email + inquiry are on file). Default true. When false we show copy only.
   */
  canVerify?: boolean;
  /**
   * OFF by default (strategy §5.3). When a tenant opts into a refundable hold as
   * the higher-tier unlock, this reframes the ask — never as a paywall. Even
   * when true, the framing is "refundable hold → becomes booking credit", never
   * "pay to talk".
   */
  showRefundableHoldNote?: boolean;
  /** Jon 360 Phase 7 — dark surface variant for noir tenants. Default "light". */
  surfaceMode?: SurfaceMode;
  /** Required: this component shipped fully hardcoded in English. */
  t: Translator;
};

export function TrustGateNudge({
  tier,
  activeCount,
  limit,
  accent,
  accentInk,
  onVerifyEmail,
  canVerify = true,
  showRefundableHoldNote = false,
  surfaceMode = "light",
  t,
}: TrustGateNudgeProps) {
  const C = paletteFor(surfaceMode);
  // email_verified guests unlock MORE by creating a full account; guest /
  // identified unlock by verifying the email they (may have) already given.
  const isAccountStep = tier === "email_verified";

  const headline = isAccountStep
    ? t("public.guestChat.gateAccountHeadline")
    : t("public.guestChat.gateVerifyHeadline");

  const count = describeCount(activeCount, limit, t);
  const body = interpolate(
    isAccountStep
      ? t("public.guestChat.gateAccountBody")
      : t("public.guestChat.gateVerifyBody"),
    { count },
  );

  const ctaLabel = isAccountStep
    ? t("public.guestChat.gateAccountCta")
    : t("public.guestChat.gateVerifyCta");

  return (
    <div style={wrapStyle(C)} role="status">
      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{headline}</div>
      <div style={{ fontSize: 11.5, lineHeight: 1.45, color: C.inkMuted }}>{body}</div>

      {showRefundableHoldNote && (
        <div style={{ fontSize: 11, lineHeight: 1.4, color: C.inkMuted }}>
          {t("public.guestChat.gateRefundableHold")}
        </div>
      )}

      {canVerify && (
        <button
          type="button"
          onClick={onVerifyEmail}
          style={{
            alignSelf: "flex-start",
            height: 32,
            padding: "0 14px",
            borderRadius: 8,
            border: "none",
            background: accent,
            color: accentInk,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}

/** "1 conversation" / "3 conversations" — honest, never alarmist. */
function describeCount(
  activeCount: number,
  limit: number,
  t: Translator,
): string {
  const n = Math.max(activeCount, limit, 1);
  return n === 1
    ? t("public.guestChat.gateCountOne")
    : interpolate(t("public.guestChat.gateCountMany"), { count: String(n) });
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — cool surface + accent CTA. House rule: no black/gold on small
// components; the only warm value is the injected tenant accent.
// ─────────────────────────────────────────────────────────────────────────────

const wrapStyle = (C: Palette) =>
  ({
    alignSelf: "stretch",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    margin: "2px 2px",
    padding: "12px 13px",
    borderRadius: 12,
    background: C.surfaceCool,
    border: `1px solid ${C.borderSoft}`,
  }) as const;
