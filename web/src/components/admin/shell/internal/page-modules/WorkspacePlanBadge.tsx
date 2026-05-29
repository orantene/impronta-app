"use client";

// ============================================================================
// WorkspacePlanBadge.tsx — clickable plan chip + summary popover for the
// workspace identity bar (top-right).
//
// Replaces the old static inline <PlanChip> in IdentityBar-1. The chip reads
// the plan tier instantly from shell state (no flash); clicking it opens a
// small popover that LAZY-loads the honest plan summary via
// loadWorkspacePlanSummary — registration date, live renewal copy, seat usage,
// the live Stripe subscription state, and any platform-granted plan override
// (the genuine "comp / important info"). "Manage plan" deep-links to
// Settings → Plan & integrations → Plan via the settings-deeplink helper.
//
// All async states are visible (loading / error / loaded) per
// feedback_admin_edit_ux — no silent waits.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import {
  loadWorkspacePlanSummary,
  type WorkspacePlanSummary,
} from "@/lib/server-actions/workspace-plan-summary";
import { resolveTier } from "@/lib/admin/plan-tiers";
import { useDashboardText } from "../dashboard-i18n";
import { PlanChip } from "../primitives";
import { COLORS, FONTS, RADIUS, TRANSITION, useAdminShell } from "../state";
import type { Plan } from "../state";
import { requestSettingsSection } from "./settings-deeplink";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; data: WorkspacePlanSummary }
  | { status: "error"; error: string };

function fmtDate(iso: string | null, spanish: boolean): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(spanish ? "es-ES" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function humanizeStatus(s: string): string {
  switch (s) {
    case "active": return "Active";
    case "trialing": return "Trial";
    case "past_due": return "Past due";
    case "canceled":
    case "cancelled": return "Canceled";
    case "incomplete": return "Incomplete";
    case "incomplete_expired": return "Expired";
    case "unpaid": return "Unpaid";
    case "paused": return "Paused";
    default: return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
  }
}

/** One label/value line in the popover body. */
function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        padding: "5px 0",
      }}
    >
      <span style={{ fontSize: 12, color: COLORS.inkMuted, whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          color: COLORS.ink,
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function WorkspacePlanBadge() {
  const { state, tenantSlug, bridgeTenantIdentity, setPage } = useAdminShell();
  const copy = useDashboardText();
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<LoadState>({ status: "idle" });

  // Instant chip label from shell state (prefer the bridge's live tier).
  const planForChip: Plan =
    (bridgeTenantIdentity?.planTier as Plan | undefined) ?? state.plan;

  // Lazy-load the summary the first time the popover opens. We guard against
  // re-fetching with a ref (keyed by tenant) rather than reading `load.status`
  // in the effect — depending on `load.status` here would re-run the effect the
  // moment we set it to "loading", whose cleanup cancels the in-flight request
  // and silently strands the popover on the spinner.
  const loadedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) return;
    if (!tenantSlug) {
      setLoad({ status: "error", error: "No workspace selected." });
      return;
    }
    if (loadedForRef.current === tenantSlug) return; // already fetched for this tenant
    loadedForRef.current = tenantSlug;
    let cancelled = false;
    setLoad({ status: "loading" });
    loadWorkspacePlanSummary({ tenantSlug })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setLoad({ status: "loaded", data: res.summary });
        else setLoad({ status: "error", error: res.error });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoad({
          status: "error",
          error: err instanceof Error ? err.message : "Could not load plan.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, tenantSlug]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && !t.closest("[data-tulala-plan-badge-root]")) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const data = load.status === "loaded" ? load.data : null;

  const goToPlanSettings = () => {
    setOpen(false);
    requestSettingsSection({ tab: "billing", section: "plan" });
    setPage("settings");
  };

  // Renewal / cancel / trial line derived from the live subscription.
  const subscriptionLine = (() => {
    if (!data?.subscription) return null;
    const sub = data.subscription;
    if (sub.cancelAtPeriodEnd) {
      const d = fmtDate(sub.currentPeriodEnd, copy.isSpanish);
      return d ? { label: "Cancels", value: d } : null;
    }
    if (sub.status === "trialing" && sub.trialEnd) {
      const d = fmtDate(sub.trialEnd, copy.isSpanish);
      return d ? { label: "Trial ends", value: d } : null;
    }
    const d = fmtDate(sub.currentPeriodEnd, copy.isSpanish);
    return d ? { label: "Renews", value: d } : null;
  })();

  return (
    <div data-tulala-plan-badge-root style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        data-tulala-plan-tier-badge
        data-plan={planForChip}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Workspace plan — ${resolveTier(planForChip).label}. ${open ? "Hide" : "Show"} details.`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: open ? "rgba(11,11,13,0.06)" : "transparent",
          border: "none",
          cursor: "pointer",
          padding: "3px 5px 3px 4px",
          borderRadius: 999,
          transition: `background ${TRANSITION.micro}`,
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.background = "rgba(11,11,13,0.04)";
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = "transparent";
        }}
      >
        <PlanChip plan={planForChip} variant="outline" />
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            color: COLORS.inkDim,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: `transform ${TRANSITION.micro}`,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Workspace plan summary"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 300,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 14,
            boxShadow: "0 12px 44px rgba(11,11,13,0.16)",
            padding: 16,
            zIndex: 200,
            fontFamily: FONTS.body,
            animation: "tulala-plan-pop .14s ease",
          }}
        >
          <style>{`@keyframes tulala-plan-pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>

          {/* Header — plan label + live renewal copy */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 10,
              paddingBottom: 12,
              borderBottom: `1px solid ${COLORS.borderSoft}`,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.7,
                  textTransform: "uppercase",
                  color: COLORS.inkDim,
                  marginBottom: 3,
                }}
              >
                {copy.t("Workspace plan")}
              </div>
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: -0.2,
                  color: COLORS.ink,
                  lineHeight: 1.1,
                }}
              >
                {data?.planLabel ?? resolveTier(planForChip).label}
              </div>
            </div>
            <span style={{ flexShrink: 0, paddingTop: 2 }}>
              <PlanChip plan={planForChip} variant="solid" />
            </span>
          </div>

          {/* Body */}
          <div style={{ paddingTop: 10 }}>
            {load.status === "loading" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", color: COLORS.inkMuted, fontSize: 12.5 }}>
                <span
                  aria-hidden
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: "50%",
                    border: `2px solid ${COLORS.border}`,
                    borderTopColor: COLORS.ink,
                    animation: "tulala-plan-spin .7s linear infinite",
                    display: "inline-block",
                  }}
                />
                <style>{`@keyframes tulala-plan-spin { to { transform: rotate(360deg); } }`}</style>
                {copy.t("Loading plan…")}
              </div>
            )}

            {load.status === "error" && (
              <div
                role="alert"
                style={{
                  fontSize: 12.5,
                  color: COLORS.red,
                  background: "rgba(176,48,58,0.07)",
                  border: "1px solid rgba(176,48,58,0.18)",
                  borderRadius: 9,
                  padding: "9px 11px",
                  lineHeight: 1.45,
                }}
              >
                {load.error}
              </div>
            )}

            {data && (
              <>
                {data.renewLabel && (
                  <MetaRow label={copy.t("Pricing")} value={data.renewLabel} />
                )}
                {fmtDate(data.registeredAt, copy.isSpanish) && (
                  <MetaRow
                    label={copy.t("Member since")}
                    value={fmtDate(data.registeredAt, copy.isSpanish)!}
                  />
                )}
                <MetaRow
                  label={copy.t("Seats")}
                  value={
                    data.seatUsed == null
                      ? "—"
                      : data.seatLimit == null
                        ? `${data.seatUsed} · ${copy.t("unlimited")}`
                        : `${data.seatUsed} / ${data.seatLimit}`
                  }
                />
                {data.subscription && (
                  <MetaRow
                    label={copy.t("Status")}
                    value={humanizeStatus(data.subscription.status)}
                  />
                )}
                {subscriptionLine && (
                  <MetaRow label={copy.t(subscriptionLine.label)} value={subscriptionLine.value} />
                )}
                {!data.subscription && data.planTier === "free" && (
                  <MetaRow label={copy.t("Billing")} value={copy.t("No billing on Free")} />
                )}

                {/* Platform-granted plan override — the genuine comp / "important
                    info". Cool indigo treatment, never gold. */}
                {data.override && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: "10px 12px",
                      background: COLORS.indigoSoft,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.indigoDeep, marginBottom: 3 }}>
                      {copy.t("Plan override active")}
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.ink, lineHeight: 1.45 }}>
                      {resolveTier(data.override.overridePlanTier).label}
                      {data.override.basePlanTier && data.override.basePlanTier !== data.override.overridePlanTier && (
                        <span style={{ color: COLORS.inkMuted }}>
                          {" "}({copy.t("base")}: {resolveTier(data.override.basePlanTier).label})
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                      {data.override.expiresAt && fmtDate(data.override.expiresAt, copy.isSpanish)
                        ? `${copy.t("Until")} ${fmtDate(data.override.expiresAt, copy.isSpanish)}`
                        : copy.t("No expiry")}
                    </div>
                    {data.override.reason && (
                      <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 4, fontStyle: "italic", lineHeight: 1.4 }}>
                        &ldquo;{data.override.reason}&rdquo;
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer CTA — deep-links into Settings → Plan */}
          <button
            type="button"
            onClick={goToPlanSettings}
            style={{
              marginTop: 14,
              width: "100%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              background: COLORS.ink,
              color: "#fff",
              border: "none",
              borderRadius: RADIUS.md,
              padding: "9px 12px",
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: `opacity ${TRANSITION.micro}`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            {data?.canManageBilling === false ? copy.t("View plan details") : copy.t("Manage plan")}
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
