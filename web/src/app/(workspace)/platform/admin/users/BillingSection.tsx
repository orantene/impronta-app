"use client";

/**
 * C.4 — Per-person billing & subscription section for the platform user drawer.
 *
 * Lazy-fetches on first expand. Shows:
 *  - Talent subscription info + Stripe deep-link (D.3)
 *  - Client subscription info
 *  - Active talent plan override badge + revoke
 *  - Apply talent plan override form (duration picker + reason)
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HQ, HQ_F, HQ_FM } from "../tenants/hq-kit";
import {
  applyTalentPlanOverride,
  removeTalentPlanOverride,
  getPersonBillingSnapshot,
} from "./actions-billing";
import {
  OVERRIDE_DURATIONS,
  computeOverrideExpiry,
  type OverrideDurationKey,
} from "@/lib/platform/plan-override";
import type { PlatformUserRow } from "../../platform-data";
// type-only — erased at runtime; platform-billing-data is server-only
import type {
  PersonBillingSnapshot,
  TalentSubscriptionInfo,
  ClientSubscriptionInfo,
  TalentPlanOverrideInfo,
} from "../../platform-billing-data";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function subStatusColor(status: string): string {
  if (status === "active" || status === "trialing") return HQ.green;
  if (status === "past_due" || status === "incomplete") return HQ.amber;
  if (status === "cancelled" || status === "incomplete_expired") return HQ.red;
  return HQ.inkMuted;
}

function planLabel(key: string): string {
  const labels: Record<string, string> = {
    talent_basic: "Basic (free)",
    talent_pro: "Pro",
    talent_portfolio: "Portfolio",
    standard: "Standard",
    pro: "Pro",
    enterprise: "Enterprise",
  };
  return labels[key] ?? key;
}

function StripeCopyRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) {
    return (
      <>
        <span style={{ color: HQ.inkDim }}>{label}</span>
        <span style={{ color: HQ.inkDim }}>—</span>
      </>
    );
  }
  return (
    <>
      <span style={{ color: HQ.inkDim }}>{label}</span>
      <span
        style={{
          color: HQ.ink,
          fontFamily: HQ_FM,
          fontSize: 11,
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <span style={{ wordBreak: "break-all" }}>{value}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          style={{
            padding: "2px 6px",
            borderRadius: 5,
            border: `1px solid ${HQ.borderSoft}`,
            background: "transparent",
            color: copied ? HQ.green : HQ.inkMuted,
            fontSize: 10,
            fontFamily: HQ_F,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {copied ? "✓" : "copy"}
        </button>
      </span>
    </>
  );
}

// ─── Talent subscription panel ────────────────────────────────────────────────

function TalentSubPanel({
  sub,
  planKey,
}: {
  sub: TalentSubscriptionInfo | null;
  planKey: string | null;
}) {
  const effectivePlan = sub?.planKey ?? planKey ?? "talent_basic";
  const stripeCustomerId = sub?.stripeCustomerId ?? null;
  const stripeBaseUrl = "https://dashboard.stripe.com";

  return (
    <div
      style={{
        background: HQ.cardSoft,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
        padding: "10px 12px",
        fontSize: 12.5,
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: "6px 12px",
        marginBottom: 10,
      }}
    >
      <span style={{ color: HQ.inkDim }}>Talent plan</span>
      <span style={{ color: HQ.ink, fontWeight: 600 }}>{planLabel(effectivePlan)}</span>

      {sub ? (
        <>
          <span style={{ color: HQ.inkDim }}>Sub status</span>
          <span
            style={{
              color: subStatusColor(sub.status),
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            {sub.status}
            {sub.cancelAtPeriodEnd && (
              <span style={{ color: HQ.amber, marginLeft: 6, fontSize: 11 }}>
                · cancels at period end
              </span>
            )}
            {sub.status === "past_due" && (
              <span style={{ color: HQ.red, marginLeft: 6, fontSize: 11, fontWeight: 700 }}>
                ⚠ PAST DUE
              </span>
            )}
          </span>

          <span style={{ color: HQ.inkDim }}>Period ends</span>
          <span style={{ color: HQ.ink }}>{formatDate(sub.currentPeriodEnd)}</span>

          <StripeCopyRow label="Stripe sub ID" value={sub.stripeSubscriptionId} />
        </>
      ) : (
        <>
          <span style={{ color: HQ.inkDim }}>Stripe sub</span>
          <span style={{ color: HQ.inkDim }}>No active subscription</span>
        </>
      )}

      <StripeCopyRow label="Stripe customer" value={stripeCustomerId} />

      {stripeCustomerId && (
        <>
          <span style={{ color: HQ.inkDim }}>Stripe link</span>
          <a
            href={`${stripeBaseUrl}/customers/${stripeCustomerId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: HQ.blue,
              fontSize: 11.5,
              fontFamily: HQ_FM,
            }}
          >
            Open in Stripe ↗
          </a>
        </>
      )}
    </div>
  );
}

// ─── Client subscription panel ────────────────────────────────────────────────

function ClientSubPanel({ sub }: { sub: ClientSubscriptionInfo }) {
  const stripeBaseUrl = "https://dashboard.stripe.com";
  return (
    <div
      style={{
        background: HQ.cardSoft,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
        padding: "10px 12px",
        fontSize: 12.5,
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: "6px 12px",
        marginBottom: 10,
      }}
    >
      <span style={{ color: HQ.inkDim }}>Client tier</span>
      <span style={{ color: HQ.ink, fontWeight: 600 }}>{planLabel(sub.tier)}</span>

      <span style={{ color: HQ.inkDim }}>Status</span>
      <span style={{ color: subStatusColor(sub.status), fontWeight: 600, fontSize: 12 }}>
        {sub.status}
      </span>

      <span style={{ color: HQ.inkDim }}>Renews</span>
      <span style={{ color: HQ.ink }}>{formatDate(sub.currentPeriodEnd)}</span>

      <StripeCopyRow label="Stripe customer" value={sub.stripeCustomerId} />

      {sub.stripeCustomerId && (
        <>
          <span style={{ color: HQ.inkDim }}>Stripe link</span>
          <a
            href={`${stripeBaseUrl}/customers/${sub.stripeCustomerId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: HQ.blue, fontSize: 11.5, fontFamily: HQ_FM }}
          >
            Open in Stripe ↗
          </a>
        </>
      )}
    </div>
  );
}

// ─── Plan override panel ──────────────────────────────────────────────────────

const TALENT_PLANS = [
  { key: "talent_basic", label: "Basic" },
  { key: "talent_pro", label: "Pro" },
  { key: "talent_portfolio", label: "Portfolio" },
] as const;

const GRANT_KINDS = [
  { key: "comp", label: "Comp" },
  { key: "trial", label: "Trial" },
  { key: "promo", label: "Promo" },
] as const;

function TalentOverridePanel({
  talentProfileId,
  activeOverride,
  onDone,
}: {
  talentProfileId: string;
  activeOverride: TalentPlanOverrideInfo | null;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "apply" | "revoking">("idle");
  const [selectedPlan, setSelectedPlan] = useState<string>("talent_pro");
  const [grantKind, setGrantKind] = useState<"comp" | "trial" | "promo">("comp");
  const [selectedDuration, setSelectedDuration] = useState<OverrideDurationKey>("1m");
  const [customDate, setCustomDate] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const previewExpiry = computeOverrideExpiry(selectedDuration, {
    customISO: customDate || null,
  });

  function handleApply() {
    setResult(null);
    startTransition(async () => {
      const res = await applyTalentPlanOverride({
        talentProfileId,
        overridePlanKey: selectedPlan,
        durationKey: selectedDuration,
        customExpiresAt: customDate || null,
        reason: reason || null,
        grantKind,
      });
      if (res.ok) {
        setResult({ ok: true, msg: `Override applied. Expires: ${res.data.expiresAt ? formatDate(res.data.expiresAt) : "never"}` });
        setMode("idle");
        onDone();
      } else {
        setResult({ ok: false, msg: res.error });
      }
    });
  }

  function handleRevoke() {
    setResult(null);
    startTransition(async () => {
      const res = await removeTalentPlanOverride(talentProfileId);
      if (res.ok) {
        setResult({ ok: true, msg: `Override removed. Restored to ${planLabel(res.data.restoredPlanKey)}.` });
        setMode("idle");
        onDone();
      } else {
        setResult({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: HQ.inkDim,
          marginBottom: 8,
        }}
      >
        Talent plan override
      </div>

      {activeOverride && mode === "idle" && (
        <div
          style={{
            background: "rgba(229,181,103,0.08)",
            border: `1px solid rgba(229,181,103,0.3)`,
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 12,
            marginBottom: 10,
          }}
        >
          <div style={{ fontWeight: 600, color: HQ.amber, marginBottom: 4 }}>
            Active override: {planLabel(activeOverride.overridePlanKey)}
          </div>
          <div style={{ color: HQ.inkMuted, fontSize: 11.5 }}>
            Base: {planLabel(activeOverride.basePlanKey)}
            {activeOverride.expiresAt
              ? ` · Expires ${formatDate(activeOverride.expiresAt)}`
              : " · No expiry"}
          </div>
          {activeOverride.reason && (
            <div style={{ color: HQ.inkMuted, fontSize: 11.5, marginTop: 2 }}>
              Reason: {activeOverride.reason}
            </div>
          )}
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setMode("apply")}
              style={smallBtn}
            >
              Change
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={handleRevoke}
              style={{ ...smallBtn, color: HQ.amber, borderColor: "rgba(229,181,103,0.35)" }}
            >
              {pending ? "Removing…" : "Remove override"}
            </button>
          </div>
        </div>
      )}

      {!activeOverride && mode === "idle" && (
        <button
          type="button"
          onClick={() => setMode("apply")}
          style={smallBtn}
        >
          Apply plan override
        </button>
      )}

      {mode === "apply" && (
        <div
          style={{
            background: HQ.cardSoft,
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 10,
            padding: "12px",
            marginBottom: 10,
          }}
        >
          {/* Plan picker */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: HQ.inkDim, marginBottom: 6 }}>Plan</div>
            <div style={{ display: "flex", gap: 6 }}>
              {TALENT_PLANS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setSelectedPlan(p.key)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 7,
                    border: `1px solid ${selectedPlan === p.key ? HQ.ink : HQ.borderSoft}`,
                    background: "transparent",
                    color: selectedPlan === p.key ? HQ.ink : HQ.inkMuted,
                    fontWeight: selectedPlan === p.key ? 600 : undefined,
                    fontSize: 12,
                    fontFamily: HQ_F,
                    cursor: "pointer",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Grant type picker */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: HQ.inkDim, marginBottom: 6 }}>Grant type</div>
            <div style={{ display: "flex", gap: 6 }}>
              {GRANT_KINDS.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => {
                    setGrantKind(g.key);
                    // A trial must be time-boxed — drop an open-ended duration.
                    if (g.key === "trial" && selectedDuration === "indefinite") {
                      setSelectedDuration("1m");
                    }
                  }}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 7,
                    border: `1px solid ${grantKind === g.key ? HQ.ink : HQ.borderSoft}`,
                    background: "transparent",
                    color: grantKind === g.key ? HQ.ink : HQ.inkMuted,
                    fontWeight: grantKind === g.key ? 600 : undefined,
                    fontSize: 12,
                    fontFamily: HQ_F,
                    cursor: "pointer",
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: HQ.inkDim, lineHeight: 1.45 }}>
              {grantKind === "trial"
                ? "Drives a live countdown + post-expiry upgrade nudge on the talent page. Needs an end date."
                : grantKind === "promo"
                  ? "A silent promotional grant — no countdown shown to the talent."
                  : "A silent courtesy grant — no countdown shown to the talent."}
            </div>
          </div>

          {/* Duration picker */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: HQ.inkDim, marginBottom: 6 }}>Duration</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {OVERRIDE_DURATIONS.map((d) => {
                const disabled = grantKind === "trial" && d.key === "indefinite";
                return (
                  <button
                    key={d.key}
                    type="button"
                    disabled={disabled}
                    title={disabled ? "A trial needs an end date" : undefined}
                    onClick={() => setSelectedDuration(d.key)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: `1px solid ${selectedDuration === d.key ? HQ.ink : HQ.borderSoft}`,
                      background: "transparent",
                      color: disabled
                        ? HQ.inkDim
                        : selectedDuration === d.key
                          ? HQ.ink
                          : HQ.inkMuted,
                      fontWeight: selectedDuration === d.key ? 600 : undefined,
                      fontSize: 11.5,
                      fontFamily: HQ_F,
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.4 : 1,
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            {selectedDuration === "custom" && (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                style={{
                  marginTop: 8,
                  padding: "6px 10px",
                  borderRadius: 7,
                  border: `1px solid ${HQ.borderSoft}`,
                  background: HQ.bg,
                  color: HQ.ink,
                  fontSize: 12,
                  fontFamily: HQ_F,
                  outline: "none",
                }}
              />
            )}
            {previewExpiry && (
              <div style={{ marginTop: 6, fontSize: 11, color: HQ.inkDim }}>
                Expires: {formatDate(previewExpiry)}
              </div>
            )}
            {!previewExpiry && selectedDuration === "indefinite" && (
              <div style={{ marginTop: 6, fontSize: 11, color: HQ.inkDim }}>
                No expiry — will remain until manually removed.
              </div>
            )}
          </div>

          {/* Reason */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: HQ.inkDim, marginBottom: 4 }}>
              Reason (optional)
            </div>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. comp for beta feedback"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "6px 10px",
                borderRadius: 7,
                border: `1px solid ${HQ.borderSoft}`,
                background: HQ.bg,
                color: HQ.ink,
                fontSize: 12,
                fontFamily: HQ_F,
                outline: "none",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={pending}
              onClick={handleApply}
              style={{
                ...smallBtn,
                opacity: pending ? 0.5 : 1,
                cursor: pending ? "not-allowed" : "pointer",
              }}
            >
              {pending ? "Applying…" : "Apply override"}
            </button>
            <button
              type="button"
              onClick={() => { setMode("idle"); setResult(null); }}
              style={{ ...smallBtn, color: HQ.inkMuted }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: result.ok ? HQ.green : HQ.amber,
            fontWeight: 600,
          }}
        >
          {result.ok ? "✓ " : "✗ "}
          {result.msg}
        </div>
      )}
    </div>
  );
}

const smallBtn: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: `1px solid ${HQ.borderSoft}`,
  background: "transparent",
  color: HQ.ink,
  fontSize: 12,
  fontWeight: 600,
  fontFamily: HQ_F,
  cursor: "pointer",
};

// ─── Main section ─────────────────────────────────────────────────────────────

export function BillingSection({ user }: { user: PlatformUserRow }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<PersonBillingSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, startTransition] = useTransition();

  const hasTalent =
    user.kind === "unclaimed_talent" || user.talentProfileId !== null;
  const talentProfileId =
    user.kind === "unclaimed_talent" ? user.id : user.talentProfileId;
  const userId = user.kind === "human" ? user.id : null;

  // Don't show for users with no billing relevance (no talent profile + no human account)
  if (!hasTalent && user.kind !== "human") return null;

  async function fetchSnapshot() {
    const data = await getPersonBillingSnapshot({
      userId,
      talentProfileId: talentProfileId ?? null,
    });
    setSnapshot(data);
    setLoaded(true);
  }

  function handleToggle() {
    if (!isOpen && !loaded) {
      startTransition(async () => {
        await fetchSnapshot();
      });
    }
    setIsOpen(!isOpen);
  }

  function onOverrideDone() {
    // Refetch to show updated override
    startTransition(async () => {
      await fetchSnapshot();
    });
    router.refresh();
  }

  return (
    <section style={{ marginBottom: 18 }}>
      <div
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && handleToggle()}
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 600,
          color: HQ.ink,
          fontFamily: HQ_FM,
          letterSpacing: 0.2,
          textTransform: "uppercase",
          marginBottom: isOpen ? 8 : 0,
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: 11 }}>{isOpen ? "▼" : "▶"}</span>
        Billing & Subscriptions
      </div>

      {isOpen && (
        <div>
          {loading && !loaded ? (
            <LoadingState />
          ) : !snapshot ? (
            <EmptyState text="Could not load billing data." />
          ) : (
            <div>
              {/* Talent subscription */}
              {hasTalent && (
                <div style={{ marginBottom: 10 }}>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      color: HQ.inkDim,
                      marginBottom: 6,
                    }}
                  >
                    Talent subscription
                  </div>
                  <TalentSubPanel
                    sub={snapshot.talentSubscription}
                    planKey={snapshot.talentProfilePlanKey}
                  />
                </div>
              )}

              {/* Client subscription */}
              {snapshot.clientSubscription && (
                <div style={{ marginBottom: 10 }}>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      color: HQ.inkDim,
                      marginBottom: 6,
                    }}
                  >
                    Client subscription
                  </div>
                  <ClientSubPanel sub={snapshot.clientSubscription} />
                </div>
              )}

              {/* Plan override — talent only */}
              {hasTalent && talentProfileId && (
                <TalentOverridePanel
                  talentProfileId={talentProfileId}
                  activeOverride={snapshot.activeTalentOverride}
                  onDone={onOverrideDone}
                />
              )}

              {/* No billing at all */}
              {!hasTalent && !snapshot.clientSubscription && (
                <EmptyState text="No active subscriptions for this user." />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function LoadingState() {
  return (
    <div
      style={{
        padding: "14px",
        background: HQ.cardSoft,
        border: `1px dashed ${HQ.borderSoft}`,
        borderRadius: 10,
        fontSize: 12.5,
        color: HQ.inkDim,
        textAlign: "center",
      }}
    >
      Loading…
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "14px",
        background: HQ.cardSoft,
        border: `1px dashed ${HQ.borderSoft}`,
        borderRadius: 10,
        fontSize: 12.5,
        color: HQ.inkDim,
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}
