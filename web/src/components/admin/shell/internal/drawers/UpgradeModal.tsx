"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  COLORS,
  CapsLabel,
  FONTS,
  GhostButton,
  Icon,
  ModalShell,
  PLAN_META,
  PlanChip,
  PrimaryButton,
  SecondaryButton,
  defaultUnlocks,
  planPrice,
  useAdminShell
} from "./drawer-shared";

// Phase 1d — public UpgradeModal (byte-for-byte). Re-exported by barrel.

export function UpgradeModal() {
  const { state, closeUpgrade, setPlan, toast, openDrawer } = useAdminShell();
  const offer = state.upgrade;
  if (!offer.open) return null;
  const requiredPlan = offer.requiredPlan ?? "studio";
  const meta = PLAN_META[requiredPlan];

  const unlocks = offer.unlocks ?? defaultUnlocks(requiredPlan);
  const usage = offer.currentUsage;
  const usagePct = usage ? Math.min(1, usage.current / Math.max(1, usage.cap)) : 0;
  const usageBlocking = usage ? usage.current >= usage.cap : false;

  const pricingNote =
    offer.pricingNote ??
    (requiredPlan === "network"
      ? "Tailored to your operation."
      : "14-day refund · Cancel any time · No card required to preview");

  return (
    <ModalShell open onClose={closeUpgrade} width={600}>
      <header
        style={{
          padding: "22px 24px 18px",
          background: COLORS.surfaceAlt,
          position: "relative",
          borderBottom: `1px solid rgba(15,79,62,0.16)`,
        }}
      >
        <button
          onClick={closeUpgrade}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            width: 30,
            height: 30,
            borderRadius: 7,
            border: `1px solid ${COLORS.borderSoft}`,
            background: "#fff",
            color: COLORS.inkMuted,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="x" size={13} stroke={1.8} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <PlanChip plan={requiredPlan} variant="solid" />
          <CapsLabel color={COLORS.accentDeep} style={{ letterSpacing: 1.6 }}>
            {planPrice(requiredPlan)}
          </CapsLabel>
        </div>
        <h2
          style={{
            fontFamily: FONTS.display,
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: -0.5,
            color: COLORS.ink,
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {offer.feature ?? `Upgrade to ${meta.label}`}
        </h2>
        {(offer.outcome || offer.why) && (
          <p
            style={{
              fontFamily: FONTS.body,
              fontSize: 13.5,
              color: COLORS.inkMuted,
              margin: "6px 0 0",
              lineHeight: 1.55,
              maxWidth: 500,
            }}
          >
            {offer.outcome ?? offer.why}
          </p>
        )}
        {usage && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              background: "#fff",
              border: `1px solid ${usageBlocking ? "rgba(176,48,58,0.32)" : COLORS.borderSoft}`,
              borderRadius: 9,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, color: COLORS.ink }}>
                {usage.label}
              </span>
              <span
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 12,
                  color: usageBlocking ? COLORS.red : COLORS.inkMuted,
                  fontWeight: usageBlocking ? 600 : 400,
                }}
              >
                {usage.current} / {usage.cap}
                {usageBlocking && " · at limit"}
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: "rgba(11,11,13,0.06)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${usagePct * 100}%`,
                  background: usageBlocking ? COLORS.red : COLORS.accent,
                  transition: "width .3s ease",
                }}
              />
            </div>
          </div>
        )}
      </header>

      <div style={{ padding: "18px 24px", overflowY: "auto" }}>
        <div style={{ marginBottom: 8 }}>
          <CapsLabel>What you'll unlock</CapsLabel>
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {unlocks.map((u) => (
            <li
              key={u}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 8,
                fontFamily: FONTS.body,
                fontSize: 13,
                color: COLORS.ink,
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: COLORS.accentSoft,
                  color: COLORS.accent,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="check" size={11} stroke={2.5} color={COLORS.accent} />
              </span>
              {u}
            </li>
          ))}
        </ul>

        <p
          style={{
            margin: "14px 0 0",
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: COLORS.inkMuted,
            lineHeight: 1.5,
          }}
        >
          {pricingNote}
        </p>
      </div>

      <footer
        style={{
          padding: "14px 24px",
          borderTop: `1px solid ${COLORS.borderSoft}`,
          background: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
        }}
      >
        <GhostButton
          onClick={() => {
            closeUpgrade();
            openDrawer("plan-compare");
          }}
        >
          Compare plans
        </GhostButton>
        <SecondaryButton onClick={closeUpgrade}>Not now</SecondaryButton>
        {requiredPlan === "network" ? (
          <PrimaryButton
            onClick={() => {
              toast("We'll be in touch about Network");
              closeUpgrade();
            }}
          >
            Contact sales
          </PrimaryButton>
        ) : (
          <PrimaryButton
            onClick={() => {
              setPlan(requiredPlan);
              toast(`Welcome to ${meta.label} — fake upgrade applied`);
              closeUpgrade();
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              Upgrade to {meta.label}
              <Icon name="arrow-right" size={12} stroke={1.8} />
            </span>
          </PrimaryButton>
        )}
      </footer>
    </ModalShell>
  );
}

