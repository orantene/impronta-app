"use client";

import { COLORS, FONTS, RADIUS, Z } from "@/components/admin/shell/internal/state";
import type { PayoutAccountStateCard } from "@/lib/money/money-spine-chrome";
import { payoutAccountStates } from "@/lib/money/money-spine-view";

/**
 * Design-reference sheet for `mc_payout_states` (Part1 p30).
 * Not a product settings screen — documents every integration-reported state.
 */
export function PayoutAccountStatesSheet({
  onClose,
  onViewPayout,
  onViewFailedPayout,
}: {
  onClose: () => void;
  onViewPayout: (payoutId: string) => void;
  onViewFailedPayout: (payoutId: string) => void;
}) {
  const states = payoutAccountStates();

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z.drawerBackdrop,
        background: "rgba(18,23,26,0.3)",
      }}
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-label="Payout account and payout states"
        data-money-payout-states
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(1080px, calc(100vw - 32px))",
          maxHeight: "min(820px, calc(100vh - 48px))",
          background: "#fff",
          zIndex: Z.drawerPanel,
          display: "flex",
          flexDirection: "column",
          borderRadius: RADIUS.lg,
          boxShadow: "0 24px 60px -28px rgba(0,0,0,0.45)",
          fontFamily: FONTS.body,
          overflow: "hidden",
        }}
      >
        <header
          style={{
            padding: "18px 22px 14px",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 22,
                padding: "0 8px",
                borderRadius: 6,
                background: COLORS.indigoSoft,
                color: COLORS.indigoDeep,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Design reference
            </div>
            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: 19,
                fontWeight: 600,
                color: COLORS.ink,
              }}
            >
              Payout account and payout states
            </div>
            <div style={{ fontSize: 13.5, color: COLORS.inkMuted, marginTop: 4, lineHeight: 1.45 }}>
              One card, many states. Only states the integration reports are shown; an unknown
              arrival date says so. A failed load never shows zero.
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: COLORS.inkMuted,
              fontSize: 18,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </header>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            padding: 18,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 14,
            }}
          >
            {states.map((card) => (
              <StateCard
                key={card.id}
                card={card}
                onCta={() => {
                  if (card.opensPayoutId) {
                    onViewPayout(card.opensPayoutId);
                    return;
                  }
                  if (card.opensFailedPayoutId) {
                    // Reach mc_payout_failed from the Failed card (body or CTA).
                    onViewFailedPayout(card.opensFailedPayoutId);
                  }
                }}
                onBody={() => {
                  if (card.opensFailedPayoutId) {
                    onViewFailedPayout(card.opensFailedPayoutId);
                  }
                }}
              />
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function StateCard({
  card,
  onCta,
  onBody,
}: {
  card: PayoutAccountStateCard;
  onCta: () => void;
  onBody?: () => void;
}) {
  const bodyInteractive = Boolean(card.opensFailedPayoutId && onBody);
  return (
    <div
      style={{
        padding: "16px 18px",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: RADIUS.lg,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 148,
      }}
    >
      <div>
        <StateChip label={card.chip} tone={card.tone} />
      </div>
      <div
        role={bodyInteractive ? "button" : undefined}
        tabIndex={bodyInteractive ? 0 : undefined}
        onClick={bodyInteractive ? onBody : undefined}
        onKeyDown={
          bodyInteractive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onBody?.();
                }
              }
            : undefined
        }
        style={{
          fontSize: 14,
          lineHeight: 1.5,
          color: COLORS.ink,
          flex: 1,
          cursor: bodyInteractive ? "pointer" : undefined,
        }}
      >
        {card.body}
      </div>
      {card.cta ? (
        <div>
          <button
            type="button"
            onClick={onCta}
            style={{
              height: 38,
              padding: "0 14px",
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.border}`,
              background: "#fff",
              fontSize: 13.5,
              fontWeight: 600,
              color: COLORS.ink,
              cursor: "pointer",
              fontFamily: FONTS.body,
            }}
          >
            {card.cta}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function StateChip({
  label,
  tone,
}: {
  label: string;
  tone: PayoutAccountStateCard["tone"];
}) {
  const styles =
    tone === "ok"
      ? { background: COLORS.successSoft, color: COLORS.successDeep }
      : tone === "risk"
        ? { background: COLORS.criticalSoft, color: COLORS.criticalDeep }
        : tone === "warn"
          ? { background: "rgba(180,120,20,0.12)", color: "#8A5A00" }
          : tone === "info"
            ? { background: COLORS.indigoSoft, color: COLORS.indigoDeep }
            : { background: "rgba(11,11,13,0.06)", color: COLORS.inkMuted };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 9px",
        borderRadius: 99,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
        ...styles,
      }}
    >
      {label}
    </span>
  );
}
