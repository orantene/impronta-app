"use client";

/**
 * TrialsTab — platform-admin editor for the free-trial catalog.
 *
 * Each row maps to a `plan_trial_offers` record: the default trial length a
 * granted trial of that plan runs for, whether the self-serve "start a trial"
 * CTA is shown at all, and the headline + subtext that CTA carries. These are
 * the exact knobs the workspace plan badge (and, soon, the talent surface)
 * read when they render the in-popover upgrade nudge — so editing the copy
 * here changes what users see live, with no deploy.
 *
 * Grouped by audience (workspace plans vs talent plans). Each row saves
 * independently via `upsertTrialOffer`; the page revalidates on success so
 * the persisted values flow back as fresh props.
 */

import { useState, useTransition } from "react";
import type { TrialOffer } from "@/lib/plan-trials/offers";
import { upsertTrialOffer } from "@/lib/server-actions/admin-trial-offers";
import { PLAN_CATALOG, type PlanKey } from "@/lib/access/plan-catalog";
import { HQ, F, FD } from "./_tokens";
import { SectionLabel, Field, Toggle, inputStyle, EmptyHint } from "./_primitives";

function planLabel(planKey: string): string {
  return PLAN_CATALOG[planKey as PlanKey]?.displayName ?? planKey;
}

export function TrialsTab({ offers }: { offers: TrialOffer[] }) {
  const workspace = offers.filter((o) => o.audience === "workspace");
  const talent = offers.filter((o) => o.audience === "talent");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <div
        style={{
          background: HQ.cardSoft,
          border: `1px solid ${HQ.borderSoft}`,
          borderRadius: 10,
          padding: "12px 14px",
          fontFamily: F,
          fontSize: 12,
          lineHeight: 1.55,
          color: HQ.inkMuted,
        }}
      >
        These control free trials end-to-end. <b style={{ color: HQ.ink }}>Trial
        length</b> is the default a granted trial runs for. <b style={{ color: HQ.ink }}>
        Show CTA</b> decides whether the &ldquo;start a trial&rdquo; nudge appears
        in a workspace&rsquo;s plan badge. The <b style={{ color: HQ.ink }}>headline</b>{" "}
        and <b style={{ color: HQ.ink }}>subtext</b> are the live copy users read
        there — edits apply immediately, no deploy.
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionLabel
          title="Workspace plans"
          hint="Studio · Agency · Network — the badge on the admin top bar."
        />
        {workspace.length === 0 ? (
          <EmptyHint text="No workspace trial offers configured yet." />
        ) : (
          workspace.map((o) => (
            <TrialOfferRow key={`${o.audience}:${o.planKey}`} offer={o} />
          ))
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionLabel
          title="Talent plans"
          hint="Pro · Max — the talent page upgrade surface."
        />
        {talent.length === 0 ? (
          <EmptyHint text="No talent trial offers configured yet." />
        ) : (
          talent.map((o) => (
            <TrialOfferRow key={`${o.audience}:${o.planKey}`} offer={o} />
          ))
        )}
      </section>
    </div>
  );
}

// ─── TrialOfferRow ───────────────────────────────────────────────────────────

function TrialOfferRow({ offer }: { offer: TrialOffer }) {
  const [trialDays, setTrialDays] = useState(String(offer.trialDays));
  const [isEnabled, setIsEnabled] = useState(offer.isEnabled);
  const [headline, setHeadline] = useState(offer.ctaHeadline ?? "");
  const [subtext, setSubtext] = useState(offer.ctaSubtext ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const daysNumber = Number(trialDays);
  const validDays =
    /^[0-9]+$/.test(trialDays) && daysNumber >= 1 && daysNumber <= 365;

  const dirty =
    String(offer.trialDays) !== trialDays.trim() ||
    offer.isEnabled !== isEnabled ||
    (offer.ctaHeadline ?? "") !== headline ||
    (offer.ctaSubtext ?? "") !== subtext;

  const canSave = validDays && dirty && state !== "saving";

  function save() {
    setState("saving");
    setErrorMsg(null);
    startTransition(async () => {
      const res = await upsertTrialOffer({
        audience: offer.audience,
        planKey: offer.planKey,
        trialDays: daysNumber,
        isEnabled,
        ctaHeadline: headline.trim() || null,
        ctaSubtext: subtext.trim() || null,
      });
      if (!res.ok) {
        setState("error");
        setErrorMsg(res.error);
        return;
      }
      setState("saved");
      setTimeout(() => setState("idle"), 2200);
    });
  }

  return (
    <div
      style={{
        background: HQ.card,
        border: `1px solid ${isEnabled ? HQ.borderSoft : HQ.border}`,
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        opacity: isEnabled ? 1 : 0.82,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: FD, fontSize: 15, fontWeight: 600, color: HQ.ink }}>
            {planLabel(offer.planKey)}
          </span>
          <code
            style={{
              fontSize: 11,
              color: HQ.inkDim,
              background: HQ.cardSoft,
              padding: "2px 7px",
              borderRadius: 4,
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
            }}
          >
            {offer.planKey}
          </code>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {state === "saved" && (
            <span style={{ fontSize: 11.5, color: HQ.green }}>✓ Saved</span>
          )}
          {state === "error" && (
            <span style={{ fontSize: 11.5, color: HQ.red }}>{errorMsg}</span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            style={{
              background: canSave ? HQ.ink : "transparent",
              color: canSave ? HQ.bg : HQ.inkMuted,
              border: canSave ? "none" : `1px solid ${HQ.borderHover}`,
              borderRadius: 6,
              padding: "8px 16px",
              fontFamily: F,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: canSave ? "pointer" : "default",
            }}
          >
            {state === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field label="Trial length (days, 1-365)">
          <input
            type="text"
            inputMode="numeric"
            value={trialDays}
            onChange={(e) => setTrialDays(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="14"
            style={{
              ...inputStyle(),
              width: 120,
              borderColor: validDays ? HQ.borderSoft : HQ.red,
            }}
          />
        </Field>
        <Toggle
          label="Show self-serve CTA"
          checked={isEnabled}
          onChange={setIsEnabled}
          hint="Off = grant-only (no in-app trial nudge)"
        />
      </div>

      <Field label="CTA headline">
        <input
          type="text"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder={`Try ${planLabel(offer.planKey)} free for ${trialDays || "14"} days`}
          maxLength={120}
          style={inputStyle()}
        />
      </Field>
      <Field label="CTA subtext">
        <input
          type="text"
          value={subtext}
          onChange={(e) => setSubtext(e.target.value)}
          placeholder="Everything in the plan, free for the trial window."
          maxLength={280}
          style={inputStyle()}
        />
      </Field>
    </div>
  );
}
