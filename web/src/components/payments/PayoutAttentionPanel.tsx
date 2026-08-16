"use client";

/**
 * Talent-facing view of payout legs that did NOT land: reversed, failed, held.
 *
 * The gap this closes: a reversal fires an in-app notification ("A payout was
 * reversed") that deep-links to /talent/payouts, and that page then said nothing
 * about it. Held legs had a banner, but it was gated on the Connect account NOT
 * being enabled, which is the normal state when a reversal happens, so it hid
 * exactly when it mattered. This panel is rendered UNGATED.
 *
 * Visibility only. There is no dispute or appeal action here because the backend
 * has none to honor: a reversed leg is final in the ledger, so the honest next
 * step we can offer is "contact your agency".
 *
 * Amounts are minor units in the leg's OWN settled currency and are grouped by
 * currency, never summed across codes.
 */

import { useT } from "@/i18n/use-t";
import { formatMoneyCents } from "@/lib/talent/earnings-view";
import {
  PAYOUT_ATTENTION_STATES,
  type PayoutAttentionState,
  type PayoutReversalCause,
  type TalentPayoutAttention,
  type TalentPayoutAttentionLeg,
} from "@/lib/payments/talent-payout-attention-types";

const RED = "#A33A3A";
const RED_SOFT = "rgba(163,58,58,0.09)";
const RED_LINE = "rgba(163,58,58,0.22)";
/** Cool attention blue — this product's non-alarming "look at this" color. */
const BLUE = "#2c5fdb";
const BLUE_SOFT = "rgba(44,95,219,0.08)";
const BLUE_LINE = "rgba(44,95,219,0.22)";
const INK = "#0B0B0D";
const INK_MUTED = "rgba(11,11,13,0.62)";
const FONT = '"Inter", system-ui, sans-serif';

const TONE: Record<PayoutAttentionState, { fg: string; bg: string; line: string }> = {
  reversed: { fg: RED, bg: RED_SOFT, line: RED_LINE },
  failed: { fg: RED, bg: RED_SOFT, line: RED_LINE },
  held: { fg: BLUE, bg: BLUE_SOFT, line: BLUE_LINE },
};

const HEADING_KEY: Record<PayoutAttentionState, string> = {
  reversed: "reversedHeading",
  failed: "failedHeading",
  held: "heldHeading",
};

const NOTE_KEY: Record<PayoutAttentionState, string> = {
  reversed: "reversedNote",
  failed: "failedNote",
  held: "heldNote",
};

const CAUSE_KEY: Record<PayoutReversalCause, string> = {
  refund: "causeRefund",
  dispute: "causeDispute",
  cancelled_before_transfer: "causeCancelled",
  unknown: "causeUnknown",
};

/** Stable, locale-independent date text (no hydration drift): YYYY-MM-DD. */
function isoDay(value: string | null): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function LegRow({ leg, tone, t }: { leg: TalentPayoutAttentionLeg; tone: string; t: (k: string) => string }) {
  const key = (k: string) => t(`dashboard.talentPayoutAttention.${k}`);
  const event = isoDay(leg.eventDate);
  const changed = isoDay(leg.atIso);
  const meta: string[] = [];
  if (event) meta.push(key("eventOn").replace("{date}", event));
  if (changed) meta.push(key("updatedOn").replace("{date}", changed));
  if (leg.state === "reversed") meta.push(key(CAUSE_KEY[leg.cause]));

  return (
    <li
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderTop: `1px solid ${tone}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: INK, lineHeight: 1.35 }}>
          {leg.bookingTitle || key("bookingFallback")}
        </div>
        <div style={{ fontSize: 11.5, color: INK_MUTED, marginTop: 2, lineHeight: 1.45 }}>
          {meta.join(" · ")}
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: INK, whiteSpace: "nowrap" }}>
        {formatMoneyCents(leg.amountCents, leg.currency)}
      </div>
    </li>
  );
}

export function PayoutAttentionPanel({
  attention,
}: {
  attention: TalentPayoutAttention | null | undefined;
}) {
  const t = useT();
  const key = (k: string) => t(`dashboard.talentPayoutAttention.${k}`);
  const legs = attention?.legs ?? [];
  if (legs.length === 0) return null;
  const totals = attention?.totals ?? [];

  const sections = PAYOUT_ATTENTION_STATES.map((state) => ({
    state,
    legs: legs.filter((l) => l.state === state),
    totals: totals.filter((tot) => tot.state === state),
  })).filter((s) => s.legs.length > 0);

  if (sections.length === 0) return null;

  return (
    <section data-testid="payout-attention-panel" style={{ marginBottom: 18, fontFamily: FONT }}>
      <h2
        style={{
          margin: "0 0 10px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: INK_MUTED,
        }}
      >
        {key("title")}
      </h2>

      {sections.map(({ state, legs: stateLegs, totals: stateTotals }) => {
        const tone = TONE[state];
        const amounts = stateTotals.map((tot) => formatMoneyCents(tot.amountCents, tot.currency)).join(" + ");
        const count = stateLegs.length;
        const countText = (count === 1 ? key("legCountOne") : key("legCountOther")).replace(
          "{count}",
          String(count),
        );
        return (
          <div
            key={state}
            data-testid={`payout-attention-${state}`}
            style={{
              marginBottom: 10,
              padding: "12px 14px",
              background: tone.bg,
              border: `1px solid ${tone.line}`,
              borderRadius: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: tone.fg }}>{key(HEADING_KEY[state])}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: INK, whiteSpace: "nowrap" }}>
                {amounts}
                <span style={{ fontWeight: 500, color: INK_MUTED }}>{` · ${countText}`}</span>
              </div>
            </div>
            <p style={{ margin: "6px 0 2px", fontSize: 12, lineHeight: 1.5, color: INK_MUTED }}>
              {key(NOTE_KEY[state])}
            </p>
            <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
              {stateLegs.map((leg) => (
                <LegRow key={leg.id} leg={leg} tone={tone.line} t={t} />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
