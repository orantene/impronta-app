"use client";

/**
 * ParityProbePanel (Builder Lab → live-gallery parity probe, X5).
 *
 * Standalone super-admin diagnostic: pick a surface (talent profile / talent
 * shell / workspace page / workspace shell) × plan × talent tier (+ optional live
 * tenant id for staged-rollout bucketing), and see EXACTLY which catalog rows are
 * shown in the Lab but HIDDEN in the live "+" gallery, and WHY — plan / tier /
 * rollout / target / overlay.
 *
 * This component is deliberately NOT wired into `SPECIAL_TABS` in
 * `component-catalog.tsx` (another agent owns that file this wave). It is
 * exported for the Lead to mount later. All visuals use the shared `LAB` tokens.
 *
 * It calls ONE server action (`runParityProbe`) which reuses the live read path
 * (`fetchSurfaceGalleryItems`) for ground-truth — no new fetch fork.
 */

import { useState, useTransition } from "react";

import {
  runParityProbe,
  type ParityProbeResult,
} from "@/lib/site-admin/add-gallery/parity-probe-action";
import {
  PARITY_PLAN_KEYS,
  PARITY_SURFACES,
  PARITY_TIER_KEYS,
  type ParityPlanKey,
  type ParitySurfaceKey,
  type ParityTierKey,
} from "@/lib/site-admin/add-gallery/parity-surface-descriptors";
import {
  PARITY_REASON_LABEL,
  type ParityHiddenReason,
} from "@/lib/site-admin/add-gallery/parity-probe";
import {
  LAB as T,
  fieldStyle,
  panelStyle,
  LabButton,
  LabBadge,
  LabViewHeader,
  SectionLabel,
  PillToggle,
  EmptyCard,
} from "./ui";

const PLAN_LABEL: Record<ParityPlanKey, string> = {
  free: "Free",
  studio: "Studio",
  agency: "Agency",
  network: "Network",
};

const TIER_LABEL: Record<ParityTierKey, string> = {
  talent_basic: "Basic",
  talent_pro: "Pro",
  talent_portfolio: "Portfolio",
};

const REASON_TONE: Record<ParityHiddenReason, { bg: string; fg: string }> = {
  "overlay-hidden": { bg: T.redBg, fg: T.red },
  target: { bg: "rgba(255,255,255,0.07)", fg: T.inkMuted },
  plan: { bg: T.accentBg, fg: T.accent },
  tier: { bg: T.accentSoft, fg: T.accent },
  rollout: { bg: "rgba(155,168,183,0.16)", fg: T.amber },
};

export function ParityProbePanel() {
  const [surface, setSurface] = useState<ParitySurfaceKey>("talent_profile");
  const [plan, setPlan] = useState<ParityPlanKey>("free");
  const [tier, setTier] = useState<ParityTierKey>("talent_basic");
  const [tenantId, setTenantId] = useState("");
  const [result, setResult] = useState<ParityProbeResult | null>(null);
  const [pending, startTransition] = useTransition();

  const activeSurface = PARITY_SURFACES.find((s) => s.key === surface);
  const tierApplies = activeSurface?.usesTalentTier ?? false;

  const run = () => {
    startTransition(async () => {
      const res = await runParityProbe({ surface, plan, tier, tenantId });
      setResult(res);
    });
  };

  const labelStyle = { fontSize: 11, fontWeight: 600, color: T.inkMuted } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <LabViewHeader
        title="Live-gallery parity probe"
        badge={<LabBadge tone="accent">Diagnostic</LabBadge>}
        blurb={
          <>
            Pick a surface, plan, and talent tier to see which catalog rows are
            shown in the Lab but HIDDEN in the live + gallery, and why. Runs against
            the same read path the live builders use.
          </>
        }
        actions={
          <LabButton onClick={run} disabled={pending} testId="parity-probe-run">
            {pending ? "Probing…" : "Run probe"}
          </LabButton>
        }
      />

      {/* Selectors */}
      <div
        style={{
          ...panelStyle,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <SectionLabel>Surface</SectionLabel>
          <PillToggle
            ariaLabel="Surface"
            value={surface}
            onChange={(k) => setSurface(k as ParitySurfaceKey)}
            options={PARITY_SURFACES.map((s) => ({ key: s.key, label: s.label }))}
          />
          {activeSurface ? (
            <div style={{ fontSize: 11.5, color: T.inkDim, lineHeight: 1.5 }}>
              {activeSurface.blurb}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            gap: 18,
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>Plan</SectionLabel>
            <PillToggle
              size="sm"
              ariaLabel="Plan"
              value={plan}
              onChange={(k) => setPlan(k as ParityPlanKey)}
              options={PARITY_PLAN_KEYS.map((p) => ({ key: p, label: PLAN_LABEL[p] }))}
            />
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              opacity: tierApplies ? 1 : 0.4,
            }}
          >
            <SectionLabel>Talent tier{tierApplies ? "" : " (surface ignores)"}</SectionLabel>
            <PillToggle
              size="sm"
              ariaLabel="Talent tier"
              value={tier}
              onChange={(k) => setTier(k as ParityTierKey)}
              options={PARITY_TIER_KEYS.map((t) => ({ key: t, label: TIER_LABEL[t] }))}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
            <label htmlFor="parity-tenant" style={labelStyle}>
              Tenant id (optional — rollout bucketing)
            </label>
            <input
              id="parity-tenant"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="leave blank ⇒ no rollout gating"
              style={{ ...fieldStyle, minWidth: 220 }}
            />
          </div>
        </div>
      </div>

      {/* Result */}
      {result ? <ResultBlock result={result} /> : null}
    </div>
  );
}

function ResultBlock({ result }: { result: ParityProbeResult }) {
  if (!result.ok) {
    return <EmptyCard>Probe failed: {result.error ?? "unknown error"}</EmptyCard>;
  }

  const reasonEntries = (Object.keys(result.byReason) as ParityHiddenReason[])
    .map((r) => ({ reason: r, count: result.byReason[r] }))
    .filter((e) => e.count > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Summary */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          fontSize: 12,
          color: T.inkMuted,
        }}
      >
        <span>
          <strong style={{ color: T.ink }}>{result.hiddenRows.length}</strong> of{" "}
          {result.universeCount} Lab rows hidden live
        </span>
        {result.liveCount >= 0 ? (
          <span style={{ color: T.inkDim }}>· live gallery shows {result.liveCount}</span>
        ) : null}
        {reasonEntries.map((e) => {
          const tone = REASON_TONE[e.reason];
          return (
            <LabBadge key={e.reason} tone="custom" bg={tone.bg} fg={tone.fg}>
              {PARITY_REASON_LABEL[e.reason]} {e.count}
            </LabBadge>
          );
        })}
      </div>

      {result.parityMismatch.length > 0 ? (
        <div
          style={{
            ...panelStyle,
            padding: "10px 14px",
            background: T.redBg,
            borderColor: T.red,
            color: T.red,
            fontSize: 12,
          }}
        >
          Replay drift: {result.parityMismatch.length} probe-flagged row(s) still
          appear live ({result.parityMismatch.join(", ")}). The replayed predicates
          disagree with the live engine — investigate before trusting the X4 migration.
        </div>
      ) : null}

      {/* Rows */}
      {result.hiddenRows.length === 0 ? (
        <EmptyCard>
          Full parity — every Lab-visible row is also visible on this surface for
          the chosen plan and tier.
        </EmptyCard>
      ) : (
        <div style={{ ...panelStyle, overflow: "hidden" }}>
          {result.hiddenRows.map((row, idx) => {
            const tone = REASON_TONE[row.reason];
            return (
              <div
                key={row.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderTop: idx === 0 ? "none" : `1px solid ${T.borderSoft}`,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>
                      {row.label}
                    </span>
                    <LabBadge tone="muted">{row.source}</LabBadge>
                    <span style={{ fontSize: 10.5, color: T.inkDim }}>
                      {row.tab} · {row.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 3, lineHeight: 1.5 }}>
                    {row.detail}
                  </div>
                </div>
                <LabBadge tone="custom" bg={tone.bg} fg={tone.fg} style={{ flexShrink: 0 }}>
                  {PARITY_REASON_LABEL[row.reason]}
                </LabBadge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
