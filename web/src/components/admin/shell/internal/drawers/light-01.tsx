"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  COLORS,
  DrawerId,
  DrawerShell,
  FONTS,
  FieldRow,
  GhostButton,
  Icon,
  IconChip,
  PLAN_META,
  Plan,
  PlanChip,
  PrimaryButton,
  SecondaryButton,
  Section,
  StandardFooter,
  StateChipMini,
  StatusPill,
  TRANSITION,
  TextInput,
  UsageRow,
  getTeam,
  loadAgencySettingsNamespace,
  meetsPlan,
  nextPlan,
  openSupportEmail,
  patchAgencySettingsNamespace,
  planPrice,
  teamCap,
  useAdminShell,
  useQueuedRouterRefresh
} from "./drawer-shared";

// Phase 1d (remediation §4): 4 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function TenantSummaryDrawer() {
  const { state, closeDrawer, openDrawer, openUpgrade, effectiveRoster, effectiveTeamMembers, effectiveTenant } = useAdminShell();
  const planMeta = PLAN_META[state.plan];
  const rosterCount = effectiveRoster.length;
  const rosterCap = state.plan === "free" ? 5 : state.plan === "studio" ? 50 : state.plan === "agency" ? 200 : 999;
  const teamCount = effectiveTeamMembers.length > 0 ? effectiveTeamMembers.length : getTeam(state.plan).length;

  const jumpItems: { label: string; icon: string; drawer: DrawerId }[] = [
    { label: "Plan & billing", icon: "credit", drawer: "plan-billing" },
    { label: "Recent invoices", icon: "mail", drawer: "plan-billing" },
    { label: "Team & permissions", icon: "team", drawer: "team" },
    { label: "Branding", icon: "palette", drawer: "branding" },
    { label: "Custom domain", icon: "globe", drawer: "domain" },
  ];

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={effectiveTenant.name.toUpperCase()}
      description={`${planMeta.label} plan · ${planPrice(state.plan)}`}
      footer={
        <>
          {state.plan !== "network" && (
            <PrimaryButton
              onClick={() => {
                closeDrawer();
                openDrawer("plan-compare");
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="arrow-right" size={12} stroke={1.8} />
                Compare plans
              </span>
            </PrimaryButton>
          )}
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        </>
      }
    >
      <Section title="At a glance">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: 12,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: COLORS.amber,
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>
              {planMeta.label} plan
            </div>
            <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, marginTop: 1 }}>
              {planPrice(state.plan)} {state.plan !== "free" && "· billed monthly"}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Roster">
        <UsageRow label={`${rosterCount} / ${rosterCap === 999 ? "∞" : rosterCap} talents`} value={rosterCap === 999 ? 0.4 : rosterCount / rosterCap} />
        <UsageRow label={`${teamCount} / ${teamCap(state.plan)} seats`} value={teamCap(state.plan) === 999 ? 0.2 : teamCount / teamCap(state.plan)} />
        <UsageRow label="Storage · 1.4 / 25 GB" value={1.4 / 25} />
      </Section>

      <Section title="Jump to">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {jumpItems.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                openDrawer(item.drawer);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 10,
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 13,
                color: COLORS.ink,
                textAlign: "left",
                transition: `border-color ${TRANSITION.micro}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(11,11,13,0.18)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.borderSoft)}
            >
              <IconChip size={28}>
                <Icon name={item.icon} size={13} stroke={1.7} />
              </IconChip>
              <span style={{ flex: 1, fontWeight: 500 }}>{item.label}</span>
              <Icon name="external" size={12} color={COLORS.inkDim} />
            </button>
          ))}
        </div>
      </Section>

      <Section title="Plan ladder">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(["free", "studio", "agency", "network"] as Plan[]).map((p) => {
            const isCurrent = state.plan === p;
            const isReached = meetsPlan(state.plan, p);
            return (
              <div
                key={p}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: 7,
                  background: isCurrent ? "rgba(11,11,13,0.05)" : "transparent",
                }}
              >
                {/* WS-12.9 — icon, not color alone, signals reached vs locked */}
                <span
                  aria-hidden
                  style={{
                    width: 14,
                    height: 14,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    color: isReached ? COLORS.ink : COLORS.inkDim,
                  }}
                >
                  {isReached
                    ? <Icon name="check" size={11} stroke={2.5} />
                    : <Icon name="lock" size={11} stroke={1.8} />}
                </span>
                <span style={{ fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, color: COLORS.ink, minWidth: 70 }}>
                  {PLAN_META[p].label}
                </span>
                <span style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, flex: 1 }}>
                  {PLAN_META[p].theme}
                </span>
                {isCurrent && (
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: COLORS.inkMuted, textTransform: "uppercase" }}>
                    Current
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </DrawerShell>
  );
}


export function SiteSetupDrawer() {
  const { closeDrawer, openDrawer, toast } = useAdminShell();
  const [done, setDone] = useState<Set<string>>(new Set(["homepage"]));
  const steps = [
    { id: "homepage", label: "Homepage hero", desc: "Headline, sub, CTA. Sets the tone.", drawer: "homepage" },
    { id: "pages", label: "Pages", desc: "About, Press, FAQ, Contact.", drawer: "pages" },
    { id: "posts", label: "Posts", desc: "Editorial features, news, BTS.", drawer: "posts" },
    { id: "navigation", label: "Navigation & footer", desc: "Header structure, footer columns.", drawer: "navigation" },
    { id: "theme", label: "Theme & foundations", desc: "Type, color, density, layout.", drawer: "theme-foundations" },
    { id: "seo", label: "SEO & defaults", desc: "Meta, sitemap, redirects.", drawer: "seo" },
  ];
  const completedCount = done.size;

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Get your site live"
      description={`${completedCount} of ${steps.length} steps complete. Most agencies finish in under 30 minutes.`}
      width={560}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
          <PrimaryButton
            onClick={() => {
              toast("Setup progress saved");
              closeDrawer();
            }}
          >
            Save progress
          </PrimaryButton>
        </>
      }
    >
      <div
        style={{
          background: COLORS.surfaceAlt,
          border: `1px solid rgba(15,79,62,0.18)`,
          borderRadius: 12,
          padding: 14,
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 22,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 500, color: COLORS.ink }}>
            {Math.round((completedCount / steps.length) * 100)}% complete
          </div>
          <div style={{ height: 6, background: "rgba(15,79,62,0.18)", borderRadius: 999, marginTop: 6, overflow: "hidden" }}>
            <div
              style={{
                width: `${(completedCount / steps.length) * 100}%`,
                height: "100%",
                background: COLORS.accentDeep,
                borderRadius: 999,
                transition: "width .3s",
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {steps.map((step, idx) => {
          const isDone = done.has(step.id);
          return (
            <div
              key={step.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: 14,
                background: "#fff",
                border: `1px solid ${isDone ? "rgba(46,125,91,0.30)" : COLORS.borderSoft}`,
                borderRadius: 12,
              }}
            >
              <button
                onClick={() => {
                  setDone((prev) => {
                    const next = new Set(prev);
                    if (next.has(step.id)) next.delete(step.id);
                    else next.add(step.id);
                    return next;
                  });
                }}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  border: `1.5px solid ${isDone ? COLORS.green : "rgba(11,11,13,0.18)"}`,
                  background: isDone ? COLORS.green : "transparent",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  cursor: "pointer",
                }}
                aria-label={isDone ? "Mark incomplete" : "Mark complete"}
              >
                {isDone ? (
                  <Icon name="check" size={14} stroke={2.5} color="#fff" />
                ) : (
                  <span style={{ fontSize: 11, color: COLORS.inkMuted, fontWeight: 600 }}>
                    {idx + 1}
                  </span>
                )}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: FONTS.body,
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: COLORS.ink,
                    textDecoration: isDone ? "line-through" : "none",
                    opacity: isDone ? 0.6 : 1,
                  }}
                >
                  {step.label}
                </div>
                <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                  {step.desc}
                </div>
              </div>
              <SecondaryButton size="sm" onClick={() => openDrawer(step.drawer as DrawerId)}>
                {isDone ? "Edit" : "Open"}
              </SecondaryButton>
            </div>
          );
        })}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Theme & foundations
// ════════════════════════════════════════════════════════════════════


export function ThemeFoundationsDrawer() {
  const queueRouterRefresh = useQueuedRouterRefresh();
  const { closeDrawer, toast } = useAdminShell();
  const [pending, startTransition] = useTransition();
  const [theme, setTheme] = useState<"editorial-noir" | "modern-mono" | "warm-light">("editorial-noir");
  const [headingFont, setHeadingFont] = useState("Cormorant Garamond");
  const [bodyFont, setBodyFont] = useState("Inter");
  const [accent, setAccent] = useState("#B8860B");
  const [density, setDensity] = useState<"compact" | "comfortable" | "spacious">("comfortable");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadAgencySettingsNamespace("", "theme").then((r) => {
      if (cancelled) return;
      if (r.ok && r.data) {
        const v = r.data as Record<string, unknown>;
        if (typeof v.theme === "string") setTheme(v.theme as typeof theme);
        if (typeof v.headingFont === "string") setHeadingFont(v.headingFont);
        if (typeof v.bodyFont === "string") setBodyFont(v.bodyFont);
        if (typeof v.accent === "string") setAccent(v.accent);
        if (typeof v.density === "string") setDensity(v.density as typeof density);
      }
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const onSave = () => {
    startTransition(async () => {
      const r = await patchAgencySettingsNamespace("", "theme", {
        theme, headingFont, bodyFont, accent, density,
      });
      if (!r.ok) toast(`Save failed: ${r.error}`);
      else { toast("Theme saved"); queueRouterRefresh(); closeDrawer(); }
    });
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Theme & foundations"
      description="Typography, color, and density — applied across your site."
      width={580}
      footer={<StandardFooter onSave={onSave} disabled={pending || !loaded} saveLabel={pending ? "Saving…" : "Save"} />}
    >
      <Section title="Theme preset" description="Three starting points. Customize anything below.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {[
            { id: "editorial-noir", label: "Editorial Noir", swatch: ["#0B0B0D", "#FAFAF7", "#B8860B"] },
            { id: "modern-mono", label: "Modern Mono", swatch: ["#0F0F11", "#FFFFFF", "#5B5B62"] },
            { id: "warm-light", label: "Warm Light", swatch: ["#3D2A18", "#FBF5EC", "#C68A1E"] },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id as typeof theme)}
              style={{
                background: "#fff",
                border: `1.5px solid ${theme === t.id ? COLORS.accent : COLORS.borderSoft}`,
                borderRadius: 10,
                padding: 12,
                cursor: "pointer",
                fontFamily: FONTS.body,
                textAlign: "left",
                transition: `border-color ${TRANSITION.micro}`,
              }}
            >
              <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                {t.swatch.map((c) => (
                  <span key={c} style={{ width: 18, height: 18, borderRadius: 4, background: c, border: `1px solid ${COLORS.borderSoft}` }} />
                ))}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>{t.label}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <FieldRow label="Heading font">
          <select
            value={headingFont}
            onChange={(e) => setHeadingFont(e.target.value)}
            style={{
              padding: "9px 12px",
              fontFamily: FONTS.body,
              fontSize: 13,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              background: "#fff",
              color: COLORS.ink,
            }}
          >
            <option>Cormorant Garamond</option>
            <option>EB Garamond</option>
            <option>Playfair Display</option>
            <option>Inter</option>
          </select>
        </FieldRow>
        <FieldRow label="Body font">
          <select
            value={bodyFont}
            onChange={(e) => setBodyFont(e.target.value)}
            style={{
              padding: "9px 12px",
              fontFamily: FONTS.body,
              fontSize: 13,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              background: "#fff",
              color: COLORS.ink,
            }}
          >
            <option>Inter</option>
            <option>Söhne</option>
            <option>Neue Haas Grotesk</option>
            <option>Helvetica Neue</option>
          </select>
        </FieldRow>
        <div
          style={{
            background: "#fff",
            padding: 16,
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
          }}
        >
          <div style={{ fontFamily: headingFont, fontSize: 26, fontWeight: 500, letterSpacing: -0.5, color: COLORS.ink, lineHeight: 1.15 }}>
            Editorial preview
          </div>
          <div style={{ fontFamily: bodyFont, fontSize: 13, color: COLORS.inkMuted, marginTop: 6, lineHeight: 1.55 }}>
            The quick brown fox jumps over the lazy dog. The five boxing wizards jump quickly.
          </div>
        </div>
      </Section>

      <Section title="Brand color">
        <FieldRow label="Accent">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              style={{ width: 38, height: 32, border: `1px solid ${COLORS.border}`, borderRadius: 6, cursor: "pointer" }}
            />
            <TextInput defaultValue={accent} />
          </div>
        </FieldRow>
      </Section>

      <Section title="Density">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {[
            { id: "compact", label: "Compact", sub: "Tighter rows" },
            { id: "comfortable", label: "Comfortable", sub: "Default" },
            { id: "spacious", label: "Spacious", sub: "Editorial" },
          ].map((d) => (
            <button
              key={d.id}
              onClick={() => setDensity(d.id as typeof density)}
              style={{
                background: "#fff",
                border: `1.5px solid ${density === d.id ? COLORS.accent : COLORS.borderSoft}`,
                borderRadius: 10,
                padding: 12,
                cursor: "pointer",
                fontFamily: FONTS.body,
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>{d.label}</div>
              <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>{d.sub}</div>
            </button>
          ))}
        </div>
      </Section>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Plan & billing
// ════════════════════════════════════════════════════════════════════


export function PlanBillingDrawer() {
  const { state, closeDrawer, openUpgrade, toast } = useAdminShell();
  const planMeta = PLAN_META[state.plan];

  const invoices = [
    { id: "i1", date: "Apr 1", amount: planPrice(state.plan), status: "Paid" },
    { id: "i2", date: "Mar 1", amount: planPrice(state.plan), status: "Paid" },
    { id: "i3", date: "Feb 1", amount: planPrice(state.plan), status: "Paid" },
  ];

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Plan & billing"
      description="Manage your subscription and see past invoices."
      width={560}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
          {state.plan !== "network" && (
            <PrimaryButton
              onClick={() =>
                openUpgrade({
                  feature: `${PLAN_META[nextPlan(state.plan)!].label} plan`,
                  why: PLAN_META[nextPlan(state.plan)!].theme,
                  requiredPlan: nextPlan(state.plan)!,
                })
              }
            >
              Upgrade plan
            </PrimaryButton>
          )}
        </>
      }
    >
      <Section title="Current plan">
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <PlanChip plan={state.plan} variant="solid" />
              <span style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, color: COLORS.ink }}>
                {planMeta.label}
              </span>
            </div>
            <span style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, fontWeight: 600 }}>
              {planPrice(state.plan)}
            </span>
          </div>
          <p style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted, margin: 0, lineHeight: 1.5 }}>
            {planMeta.theme}. {state.plan === "free" ? "Upgrade any time." : "Cancel any time."}
          </p>
        </div>
      </Section>

      {state.plan !== "free" && (
        <Section title="Payment method">
          <div
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <IconChip size={28}>
              <Icon name="credit" size={13} />
            </IconChip>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500, color: COLORS.ink }}>
                Visa ending 4242
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted }}>
                Expires 09 / 2028
              </div>
            </div>
            <GhostButton
              size="sm"
              onClick={() => {
                openSupportEmail(
                  "Tulala billing payment method update",
                  "Please help me update the payment method for this workspace.",
                );
                toast("Opening billing support email");
              }}
            >
              Update
            </GhostButton>
          </div>
        </Section>
      )}

      {state.plan !== "free" && (
        <Section title="Recent invoices">
          <div
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {invoices.map((inv, idx) => (
              <div
                key={inv.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 80px 60px",
                  alignItems: "center",
                  padding: "10px 14px",
                  borderTop: idx > 0 ? `1px solid ${COLORS.borderSoft}` : "none",
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                }}
              >
                <span style={{ color: COLORS.ink }}>{inv.date}</span>
                <span style={{ color: COLORS.inkMuted }}>{inv.amount}</span>
                <StateChipMini label={inv.status} tone="green" />
                <button
                  type="button"
                  onClick={() => {
                    openSupportEmail(
                      `Tulala invoice request ${inv.id}`,
                      `Please send the PDF for invoice ${inv.id} dated ${inv.date} (${inv.amount}).`,
                    );
                    toast("Opening invoice support email");
                  }}
                  style={{ color: COLORS.inkMuted, fontSize: 12, textDecoration: "none", justifySelf: "end", background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: FONTS.body }}
                >
                  PDF
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}
    </DrawerShell>
  );
}

/**
 * Compact tone+label pill (no dot). Thin alias over StatusPill — kept for
 * call-site naming clarity.
 */
