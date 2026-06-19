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
  runRolloutAdmissionProbe,
  type ParityProbeResult,
  type RolloutAdmissionResult,
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
  ROLLOUT_VERDICT_LABEL,
  type ParityHiddenReason,
  type RolloutAdmissionVerdict,
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

const ADMIT_TONE = { bg: T.accentBg, fg: T.accent } as const;
const DENY_TONE = { bg: T.redBg, fg: T.red } as const;
const verdictTone = (v: RolloutAdmissionVerdict) =>
  v.startsWith("admitted-") ? ADMIT_TONE : DENY_TONE;

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

      {/* X7 — per-surface rollout admission diff. */}
      <RolloutAdmissionSection />
    </div>
  );
}

/**
 * X7 — per-surface rollout admission diff. Pick ONE template + enter a tenant id
 * and see, per surface, whether `templateRolloutAllowed` admits that tenant and
 * by WHICH gate (allowlist / N% bucket / denylist / outside bucket). Makes a
 * staged rollout's real per-surface reach auditable before assuming "published =
 * everyone".
 */
function RolloutAdmissionSection() {
  const [templateId, setTemplateId] = useState<string>("");
  const [tenantId, setTenantId] = useState("");
  const [result, setResult] = useState<RolloutAdmissionResult | null>(null);
  const [pending, startTransition] = useTransition();

  // Load the template picker once (templateId omitted ⇒ picker only).
  const loadTemplates = (selId: string, tenant: string) => {
    startTransition(async () => {
      const res = await runRolloutAdmissionProbe({
        templateId: selId || null,
        tenantId: tenant,
      });
      setResult(res);
      // Default-select the first staged template the first time we load.
      if (!selId && res.ok && res.templates.length > 0) {
        const firstStaged = res.templates.find((t) => t.staged) ?? res.templates[0];
        setTemplateId(firstStaged.id);
      }
    });
  };

  const run = () => loadTemplates(templateId, tenantId);

  const labelStyle = { fontSize: 11, fontWeight: 600, color: T.inkMuted } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <LabViewHeader
        title="Per-surface rollout admission"
        badge={<LabBadge tone="accent">Staged rollout</LabBadge>}
        blurb={
          <>
            Pick a template and enter a tenant id to see, per surface, whether a
            staged rollout actually admits that tenant — and by which gate. Reuses
            the same frozen rollout bucketing the live + gallery uses, so a 60%
            canary that reads &quot;published&quot; is shown for what it really is.
          </>
        }
        actions={
          <LabButton
            onClick={run}
            disabled={pending}
            testId="rollout-admission-run"
          >
            {pending ? "Evaluating…" : result ? "Re-evaluate" : "Evaluate"}
          </LabButton>
        }
      />

      <div
        style={{
          ...panelStyle,
          padding: 16,
          display: "flex",
          gap: 18,
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 260 }}>
          <label htmlFor="rollout-template" style={labelStyle}>
            Template
          </label>
          <select
            id="rollout-template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            style={{ ...fieldStyle, minWidth: 260 }}
          >
            {!result || result.templates.length === 0 ? (
              <option value="">— run to load templates —</option>
            ) : null}
            {result?.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} · {t.percentage}%{t.staged ? " (staged)" : ""} · {t.status}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
          <label htmlFor="rollout-tenant" style={labelStyle}>
            Tenant id (blank ⇒ no rollout gating)
          </label>
          <input
            id="rollout-tenant"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="e.g. a tenant uuid"
            style={{ ...fieldStyle, minWidth: 220 }}
          />
        </div>
      </div>

      {result ? <RolloutAdmissionResultBlock result={result} /> : null}
    </div>
  );
}

function RolloutAdmissionResultBlock({ result }: { result: RolloutAdmissionResult }) {
  if (!result.ok) {
    return <EmptyCard>Admission probe failed: {result.error ?? "unknown error"}</EmptyCard>;
  }
  if (!result.selectedId) {
    return (
      <EmptyCard>
        {result.templates.length} template(s) loaded — pick one and re-evaluate.
      </EmptyCard>
    );
  }
  if (result.surfaces.length === 0) {
    return (
      <EmptyCard>
        This template is not offered on any surface (its target_context excludes
        every audience, or DB templates are off everywhere).
      </EmptyCard>
    );
  }

  const admittedCount = result.surfaces.filter((s) => s.admitted).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: T.inkMuted }}>
        Tenant{" "}
        <strong style={{ color: T.ink }}>{result.tenantId || "(none)"}</strong> reaches
        this template on{" "}
        <strong style={{ color: T.ink }}>{admittedCount}</strong> of{" "}
        {result.surfaces.length} offered surface(s).
      </div>
      <div style={{ ...panelStyle, overflow: "hidden" }}>
        {result.surfaces.map((s, idx) => {
          const tone = verdictTone(s.verdict);
          return (
            <div
              key={s.surface}
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
                    {s.surfaceLabel}
                  </span>
                  {s.bucket != null ? (
                    <span style={{ fontSize: 10.5, color: T.inkDim }}>
                      bucket {s.bucket} / {s.percentage}%
                    </span>
                  ) : (
                    <span style={{ fontSize: 10.5, color: T.inkDim }}>
                      {s.percentage}% rollout
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 3, lineHeight: 1.5 }}>
                  {s.detail}
                </div>
              </div>
              <LabBadge tone="custom" bg={tone.bg} fg={tone.fg} style={{ flexShrink: 0 }}>
                {ROLLOUT_VERDICT_LABEL[s.verdict]}
              </LabBadge>
            </div>
          );
        })}
      </div>
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
