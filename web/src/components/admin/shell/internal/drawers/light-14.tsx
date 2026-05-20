"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  COLORS,
  ConfirmTypedAction,
  DrawerShell,
  FONTS,
  FieldRow,
  Icon,
  PLANS,
  PLAN_FEE_META,
  PLAN_LADDER,
  PLAN_LADDER_HEADER,
  PLAN_META,
  PLAN_TIER_STYLE,
  PaymentsSetupDrawer,
  PayoutReceiverPickerDrawer,
  Plan,
  Popover,
  PrimaryButton,
  SecondaryButton,
  Section,
  SelectInput,
  StandardFooter,
  TRANSITION,
  TextInput,
  ToggleRow,
  loadAgencySettingsNamespace,
  meetsPlan,
  openSupportEmail,
  patchAgencySettingsNamespace,
  useAdminShell,
  useQueuedRouterRefresh,
  useSaveAndClose
} from "./drawer-shared";

// Phase 1d (remediation §4): 7 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function StorefrontVisibilityDrawer() {
  const queueRouterRefresh = useQueuedRouterRefresh();
  const { state, closeDrawer, toast } = useAdminShell();
  const [pending, startTransition] = useTransition();

  // Defaults derived from the workspace plan — applied when the namespace
  // hasn't been written yet so the drawer opens with sensible toggle state.
  const planDefaults = useMemo(() => ({
    rosterGrid: true,
    clientLogos: state.plan !== "free",
    editorialPosts: state.plan === "agency" || state.plan === "network",
    directInquiries: true,
    discoveryListed: state.plan === "free",
    discoveryFeatured: state.plan === "free",
  }), [state.plan]);

  const [flags, setFlags] = useState(planDefaults);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadAgencySettingsNamespace("", "visibility").then((r) => {
      if (cancelled) return;
      if (r.ok && r.data) {
        const v = r.data as Partial<typeof planDefaults>;
        setFlags({ ...planDefaults, ...v } as typeof planDefaults);
      }
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [planDefaults]);

  const set = <K extends keyof typeof flags>(k: K, v: boolean) =>
    setFlags((prev) => ({ ...prev, [k]: v }));

  const save = () => {
    startTransition(async () => {
      const r = await patchAgencySettingsNamespace("", "visibility", flags as unknown as Record<string, unknown>);
      if (!r.ok) toast(`Save failed: ${r.error}`);
      else { toast("Visibility saved"); queueRouterRefresh(); closeDrawer(); }
    });
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Storefront visibility"
      description="What's public on your storefront — and what shows up in Tulala discovery."
      footer={<StandardFooter onSave={save} disabled={pending || !loaded} saveLabel={pending ? "Saving…" : "Save"} />}
    >
      <Section title="Public storefront">
        <ToggleRow label="Show roster grid" defaultOn={flags.rosterGrid} onChange={(v) => set("rosterGrid", v)} />
        <ToggleRow label="Show client logos" defaultOn={flags.clientLogos} onChange={(v) => set("clientLogos", v)} />
        <ToggleRow label="Show editorial posts" defaultOn={flags.editorialPosts} onChange={(v) => set("editorialPosts", v)} />
        <ToggleRow label="Allow direct inquiries" defaultOn={flags.directInquiries} onChange={(v) => set("directInquiries", v)} />
      </Section>
      <Section title="Tulala discovery" description="On Free, you appear in our public talent directory. Studio and up are private by default.">
        <ToggleRow label="Listed in Tulala directory" defaultOn={flags.discoveryListed} onChange={(v) => set("discoveryListed", v)} />
        <ToggleRow label="Featured rotation eligible" defaultOn={flags.discoveryFeatured} onChange={(v) => set("discoveryFeatured", v)} />
      </Section>
    </DrawerShell>
  );
}


export function HubDistributionDrawer() {
  const { state, closeDrawer, openUpgrade } = useAdminShell();
  const isUnlocked = meetsPlan(state.plan, "network");
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Hub distribution"
      description={isUnlocked ? "Push talent to discovery across all your brands." : "Available on Network."}
      footer={
        isUnlocked ? (
          <PrimaryButton onClick={closeDrawer}>Save</PrimaryButton>
        ) : (
          <PrimaryButton
            onClick={() =>
              openUpgrade({
                feature: "Hub distribution",
                why: "Push talent to discovery across all your agency brands at once.",
                requiredPlan: "network",
              })
            }
          >
            Upgrade to Network
          </PrimaryButton>
        )
      }
    >
      {isUnlocked ? (
        <Section title="Connected brands">
          <ToggleRow label="Acme Models · Madrid" defaultOn />
          <ToggleRow label="Acme Models · Paris" defaultOn />
          <ToggleRow label="Acme Editorial" defaultOn={false} />
        </Section>
      ) : (
        <Section title="What this unlocks">
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              "Run multiple agency brands as one operation",
              "Move roster across brands without losing history",
              "Hub-level analytics across all brands",
              "Cross-roster pool for shared talent",
            ].map((p) => (
              <li key={p} style={{ display: "flex", gap: 10, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink }}>
                <Icon name="check" size={14} stroke={2} color={COLORS.green} />
                {p}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </DrawerShell>
  );
}


export function FilterConfigDrawer() {
  const queueRouterRefresh = useQueuedRouterRefresh();
  const { closeDrawer, toast } = useAdminShell();
  const [pending, startTransition] = useTransition();
  const [flags, setFlags] = useState({
    drafts: true,
    awaitingClient: true,
    confirmed: true,
    archived: false,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadAgencySettingsNamespace("", "filters").then((r) => {
      if (cancelled) return;
      if (r.ok && r.data) {
        const v = r.data as Partial<typeof flags>;
        setFlags((prev) => ({ ...prev, ...v }));
      }
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const set = <K extends keyof typeof flags>(k: K, v: boolean) =>
    setFlags((prev) => ({ ...prev, [k]: v }));

  const save = () => {
    startTransition(async () => {
      const r = await patchAgencySettingsNamespace("", "filters", flags as unknown as Record<string, unknown>);
      if (!r.ok) toast(`Save failed: ${r.error}`);
      else { toast("Filters saved"); queueRouterRefresh(); closeDrawer(); }
    });
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Filters"
      description="Narrow down what you see."
      footer={<StandardFooter onSave={save} disabled={pending || !loaded} saveLabel={pending ? "Saving…" : "Apply filters"} />}
    >
      <Section title="Stage" framed>
        <ToggleRow label="Drafts" defaultOn={flags.drafts} onChange={(v) => set("drafts", v)} />
        <ToggleRow label="Awaiting client" defaultOn={flags.awaitingClient} onChange={(v) => set("awaitingClient", v)} />
        <ToggleRow label="Confirmed" defaultOn={flags.confirmed} onChange={(v) => set("confirmed", v)} />
        <ToggleRow label="Archived" defaultOn={flags.archived} onChange={(v) => set("archived", v)} />
      </Section>
      <Section title="Talent" framed>
        <SelectInput options={["All talent", "Marta Reyes", "Kai Lin", "Tomás Navarro"]} />
      </Section>
      <Section title="Date range" framed>
        <SelectInput options={["Any time", "This week", "This month", "This quarter"]} />
      </Section>
    </DrawerShell>
  );
}


export function DangerZoneDrawer() {
  const { closeDrawer, toast, effectiveTenant } = useAdminShell();
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Danger zone"
      description="Irreversible actions. Be sure before you click."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <Section title="Pause workspace" description="Support can take your storefront offline temporarily. Data is preserved.">
        <ConfirmTypedAction
          actionLabel="Email pause request"
          confirmPhrase="pause"
          tone="amber"
          onConfirm={() => {
            openSupportEmail(
              "Tulala workspace pause request",
              `Please pause the ${effectiveTenant.name} workspace storefront. I understand data is preserved.`,
            );
            toast("Opening workspace support email");
          }}
        />
      </Section>
      <Section title="Transfer ownership" description="Support reviews ownership transfer requests before any account access changes.">
        <ConfirmTypedAction
          actionLabel="Email transfer request"
          confirmPhrase="transfer"
          tone="amber"
          onConfirm={() => {
            openSupportEmail(
              "Tulala ownership transfer request",
              `Please review an ownership transfer request for ${effectiveTenant.name}.`,
            );
            toast("Opening ownership support email");
          }}
        />
      </Section>
      <Section title="Delete workspace" description="Permanent deletion requires support review and a final export.">
        <ConfirmTypedAction
          actionLabel="Email deletion request"
          confirmPhrase={effectiveTenant.name}
          tone="red"
          onConfirm={() => {
            openSupportEmail(
              "Tulala workspace deletion request",
              `Please review a deletion request for ${effectiveTenant.name}. I understand this is permanent and should include a final export before deletion.`,
            );
            toast("Opening deletion support email");
          }}
        />
      </Section>
    </DrawerShell>
  );
}

/**
 * Two-step destructive-action confirm. Idle state shows the danger button.
 * Clicking it reveals an inline typed-name confirm: the user must type the
 * exact phrase before the action button enables. Cancel always available.
 *
 * Tone "amber" for reversible-but-significant actions (pause, transfer);
 * tone "red" for irreversible ones (delete).
 */

export function SimpleStubDrawer({
  title,
  description,
  sections,
}: {
  title: string;
  description?: string;
  sections: { label: string; input: string }[];
}) {
  const { closeDrawer } = useAdminShell();
  const onSave = useSaveAndClose("Saved");
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={title}
      description={description}
      footer={<StandardFooter onSave={onSave} />}
    >
      {sections.length === 0 ? (
        <p style={{ fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.55 }} className="text-admin-ink-muted">
          This drawer is part of the prototype skeleton — its detailed content lands in the next iteration.
        </p>
      ) : (
        sections.map((s) => (
          <FieldRow key={s.label} label={s.label}>
            <TextInput defaultValue={s.input} />
          </FieldRow>
        ))
      )}
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Upgrade modal
// ════════════════════════════════════════════════════════════════════


export function PlanCompareDrawer() {
  const { state, closeDrawer, openUpgrade, toast } = useAdminShell();
  const open = state.drawer.drawerId === "plan-compare";
  const currentPlan = state.plan;

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeDrawer}
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(11,11,13,0.52)",
          zIndex: 800,
          backdropFilter: "blur(2px)",
          animation: "tulala-modal-in .18s ease",
        }}
      />

      {/* Modal panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Compare plans"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 801,
          width: "min(96vw, 1080px)",
          maxHeight: "88dvh",
          background: "#fff",
          borderRadius: 20,
          boxShadow: "0 40px 100px -20px rgba(11,11,13,0.45), 0 0 0 1px rgba(11,11,13,0.06)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "tulala-plans-up .22s cubic-bezier(.34,1.4,.64,1)",
        }}
      >
        <style>{`
          @keyframes tulala-plans-up {
            from { opacity: 0; transform: translate(-50%, calc(-50% + 20px)); }
            to   { opacity: 1; transform: translate(-50%, -50%); }
          }
          @keyframes tulala-modal-in {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
        `}</style>

        {/* ── Header ── */}
        <div
          style={{
            padding: "28px 32px 20px",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 20,
            background: "linear-gradient(180deg, rgba(11,11,13,0.02) 0%, #fff 100%)",
            flexShrink: 0,
          }}
        >
          <div>
            <h2 style={{ fontFamily: FONTS.display, fontSize: 26, fontWeight: 500, letterSpacing: -0.4, margin: 0, lineHeight: 1.2 }} className="text-admin-ink">
              Choose your plan
            </h2>
            <p style={{ fontFamily: FONTS.body, fontSize: 13.5, margin: "6px 0 0", lineHeight: 1.5 }} className="text-admin-ink-muted">
              Find the right fit for where your agency is headed. All plans include core messaging and the public roster.
            </p>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close"
            style={{
              width: 36, height: 36, borderRadius: 10,
              border: `1px solid ${COLORS.borderSoft}`,
              background: "#fff", color: COLORS.inkMuted,
              cursor: "pointer", display: "inline-flex",
              alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: `border-color ${TRANSITION.micro}, color ${TRANSITION.micro}`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.ink; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderSoft; e.currentTarget.style.color = COLORS.inkMuted; }}
          >
            <Icon name="x" size={15} stroke={1.8} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", flex: 1 }}>

          {/* ── Plan cards ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 12,
              padding: "24px 28px 20px",
            }}
          >
            {PLANS.map((plan) => {
              const meta = PLAN_META[plan];
              const header = PLAN_LADDER_HEADER[plan];
              const tier = PLAN_TIER_STYLE[plan];
              const isCurrent = plan === currentPlan;
              const isLower = meta.rank < PLAN_META[currentPlan].rank;
              return (
                <div
                  key={plan}
                  style={{
                    background: isCurrent ? tier.accentSoft : "#fff",
                    border: `1.5px solid ${isCurrent ? tier.accent : COLORS.borderSoft}`,
                    borderRadius: 14,
                    padding: "20px 18px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 0,
                    position: "relative",
                    transition: `border-color ${TRANSITION.sm}, box-shadow ${TRANSITION.sm}`,
                  }}
                  onMouseEnter={(e) => {
                    if (!isCurrent) {
                      (e.currentTarget as HTMLDivElement).style.borderColor = tier.accent;
                      (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 20px ${tier.accentSoft}`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isCurrent) {
                      (e.currentTarget as HTMLDivElement).style.borderColor = COLORS.borderSoft;
                      (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                    }
                  }}
                >
                  {/* Top accent stripe */}
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: tier.accent, borderRadius: "14px 14px 0 0" }} />

                  {/* Popular badge */}
                  {tier.popular && !isCurrent && (
                    <div style={{
                      position: "absolute", top: -1, right: 14,
                      background: tier.accent, color: "#fff",
                      fontFamily: FONTS.body, fontSize: 9.5, fontWeight: 700,
                      letterSpacing: 0.6, textTransform: "uppercase",
                      padding: "3px 8px", borderRadius: "0 0 7px 7px",
                    }}>
                      Most popular
                    </div>
                  )}

                  {/* Current plan indicator */}
                  {isCurrent && (
                    <div style={{
                      position: "absolute", top: -1, right: 14,
                      background: tier.accent, color: "#fff",
                      fontFamily: FONTS.body, fontSize: 9.5, fontWeight: 700,
                      letterSpacing: 0.6, textTransform: "uppercase",
                      padding: "3px 8px", borderRadius: "0 0 7px 7px",
                    }}>
                      Current plan
                    </div>
                  )}

                  {/* Plan name */}
                  <div style={{
                    fontFamily: FONTS.body, fontSize: 11, fontWeight: 700,
                    letterSpacing: 0.8, textTransform: "uppercase",
                    color: tier.accentText, marginTop: 12, marginBottom: 8,
                  }}>
                    {meta.label}
                  </div>

                  {/* Price */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 10 }}>
                    <span style={{
                      fontFamily: FONTS.display, fontSize: 32, fontWeight: 600,
                      letterSpacing: -1, color: isCurrent ? tier.accentText : COLORS.ink,
                      lineHeight: 1,
                    }}>
                      {header.price.replace("/mo", "")}
                    </span>
                    {header.price.includes("/mo") && (
                      <span style={{ fontFamily: FONTS.body, fontSize: 12 }} className="text-admin-ink-muted">
                        /month
                      </span>
                    )}
                  </div>

                  {/* Ideal for tagline */}
                  <p style={{ fontFamily: FONTS.body, fontSize: 11.5, lineHeight: 1.5, margin: "0 0 16px", flexGrow: 1 }} className="text-admin-ink-muted">
                    {header.idealFor}
                  </p>

                  {/* CTA button */}
                  {isCurrent ? (
                    <button type="button" disabled style={{
                      width: "100%", padding: "9px 0",
                      background: tier.accentSoft, color: tier.accentText,
                      border: `1.5px solid ${tier.accent}`,
                      borderRadius: 9, fontFamily: FONTS.body,
                      fontSize: 12.5, fontWeight: 600, cursor: "default",
                    }}>
                      ✓ Your plan
                    </button>
                  ) : isLower ? (
                    <button
                      type="button"
                      onClick={() => toast(`Downgrade to ${meta.label} runs through support — we'll review your roster first.`)}
                      style={{
                        width: "100%", padding: "9px 0",
                        background: "transparent", color: COLORS.inkMuted,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 9, fontFamily: FONTS.body,
                        fontSize: 12.5, fontWeight: 500, cursor: "pointer",
                        transition: `background ${TRANSITION.micro}`,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.04)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      Downgrade
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        closeDrawer();
                        openUpgrade({ feature: `Upgrade to ${meta.label}`, why: header.idealFor, requiredPlan: plan });
                      }}
                      style={{
                        width: "100%", padding: "9px 0",
                        background: tier.accent, color: "#fff",
                        border: "none",
                        borderRadius: 9, fontFamily: FONTS.body,
                        fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                        transition: `opacity ${TRANSITION.micro}, transform ${TRANSITION.micro}`,
                        boxShadow: `0 2px 12px ${tier.accentSoft}`,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                      onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.98)"; }}
                      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                    >
                      Upgrade to {meta.label} →
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Feature comparison table ── */}
          <div style={{ padding: "0 28px 28px" }}>
            <div style={{ fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }} className="text-admin-ink-muted">
              Feature breakdown
            </div>
            <div style={{ border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12, overflow: "hidden" }}>
              {/* Column headers row */}
              <div style={{
                display: "grid",
                gridTemplateColumns: `160px repeat(4, 1fr)`,
                background: "rgba(11,11,13,0.02)",
                borderBottom: `1px solid ${COLORS.borderSoft}`,
              }}>
                <div style={{ padding: "10px 14px" }} />
                {PLANS.map((plan) => {
                  const tier = PLAN_TIER_STYLE[plan];
                  const isCurrent = plan === currentPlan;
                  return (
                    <div key={plan} style={{
                      padding: "10px 14px",
                      borderLeft: `1px solid ${COLORS.borderSoft}`,
                      background: isCurrent ? tier.accentSoft : "transparent",
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                    }}>
                      <span style={{ fontFamily: FONTS.body, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: tier.accentText }}>
                        {PLAN_META[plan].label}
                      </span>
                      <span style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 600, letterSpacing: -0.3, color: isCurrent ? tier.accentText : COLORS.ink }}>
                        {PLAN_LADDER_HEADER[plan].price}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Rows */}
              {PLAN_LADDER.map((row, idx) => (
                <div
                  key={row.dimension}
                  style={{
                    display: "grid",
                    gridTemplateColumns: `160px repeat(4, 1fr)`,
                    borderTop: idx > 0 ? `1px solid ${COLORS.borderSoft}` : "none",
                    background: idx % 2 === 0 ? "#fff" : "rgba(11,11,13,0.01)",
                  }}
                >
                  {/* Dimension label */}
                  <div style={{
                    padding: "11px 14px",
                    background: idx % 2 === 0 ? "rgba(11,11,13,0.015)" : "rgba(11,11,13,0.02)",
                    borderRight: `1px solid ${COLORS.borderSoft}`,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, lineHeight: 1.3 }} className="text-admin-ink">
                      {row.dimension}
                    </span>
                    <Popover content={row.why}>
                      <button type="button" aria-label={`Why ${row.dimension} matters`}
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 14, height: 14, borderRadius: "50%",
                          background: "rgba(11,11,13,0.06)", color: COLORS.inkMuted,
                          fontSize: 9, fontWeight: 700, fontStyle: "italic",
                          fontFamily: "Georgia, serif", cursor: "help", border: "none", padding: 0,
                        }}
                      >i</button>
                    </Popover>
                  </div>

                  {/* Plan values */}
                  {PLANS.map((plan) => {
                    const tier = PLAN_TIER_STYLE[plan];
                    const isCurrent = plan === currentPlan;
                    const val = row.values[plan];
                    const isDash = val === "—";
                    return (
                      <div key={plan} style={{
                        padding: "11px 14px",
                        fontSize: 12,
                        fontFamily: FONTS.body,
                        fontWeight: isCurrent ? 500 : 400,
                        color: isDash ? COLORS.inkDim : isCurrent ? tier.accentText : COLORS.ink,
                        borderLeft: `1px solid ${COLORS.borderSoft}`,
                        background: isCurrent ? `${tier.accentSoft}` : "transparent",
                        lineHeight: 1.4,
                      }}>
                        {val}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {/* Tax note */}
            <div style={{ fontFamily: FONTS.body, fontSize: 11, marginTop: 10, textAlign: "right" }} className="text-admin-ink-muted">
              USD · ex tax · billed monthly or annually (20% off)
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// Payments / payouts
// ════════════════════════════════════════════════════════════════════

/**
 * PaymentsSetupDrawer
 *
 * The workspace's default payout receiver — the agency-level Stripe-
 * connected account most bookings settle to. Coordinators can override
 * per-booking via PayoutReceiverPickerDrawer.
 *
 * Free plan shows a "no receiver yet" empty state and an upsell to set
 * up Stripe; paid plans show the connected bank with status + plan-fee
 * controls hint. Talent self-payout request is mentioned as Agency-tier
 * only per PLAN_FEE_META.
 */

export function ClientTrustDetailDrawer() {
  const { state, closeDrawer, openDrawer } = useAdminShell();
  const open  = state.drawer.drawerId === "client-trust-detail";
  const level = (state.drawer.payload?.level as string) ?? "basic";

  const tiers = [
    { id: "basic",    label: "Basic",    color: COLORS.inkMuted, bg: "rgba(11,11,13,0.04)",     badge: "—", requirements: ["Verified email", "Completed profile"], access: ["Browse public rosters", "Submit inquiries"] },
    { id: "verified", label: "Verified", color: COLORS.green,       bg: "rgba(46,125,91,0.08)",    badge: "✓", requirements: ["Identity verification", "Phone confirmed"], access: ["Direct talent contact (if talent allows)", "Priority processing"] },
    { id: "silver",   label: "Silver",   color: COLORS.amberDeep,       bg: COLORS.amberSoft,    badge: "◈", requirements: ["Verified identity", "1+ completed booking", "No disputes"], access: ["First-look on new availability", "Extended 72h holds"] },
    { id: "gold",     label: "Gold",     color: "#7A5C00",       bg: "rgba(217,163,6,0.10)",    badge: "★", requirements: ["Verified identity", "Funded account", "3+ bookings", "5★ avg"], access: ["Dedicated coordinator", "VIP talent access", "Direct messaging all tiers"] },
  ];
  const currentIdx = tiers.findIndex((t) => t.id === level);
  const current    = tiers[currentIdx] ?? tiers[0]!;
  const next       = tiers[currentIdx + 1];

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Client Trust Ladder" description="Higher trust unlocks access opportunities — never pay-to-DM" defaultSize="half">
      <div className="flex flex-col gap-5">
        <div style={{ padding: "14px 16px", background: current.bg, border: `1px solid ${current.color}33`, borderLeft: `3px solid ${current.color}`, borderRadius: 10, fontFamily: FONTS.body }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span className="text-lg">{current.badge}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: current.color }}>{current.label}</span>
            <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" as const, color: current.color }}>Current tier</span>
          </div>
          {current.access.map((a, i) => (
            <div key={i} style={{ fontSize: 12.5, color: COLORS.inkMuted, display: "flex", gap: 8, marginBottom: 3 }}>
              <span style={{ color: current.color, fontWeight: 700 }}>✓</span>{a}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {tiers.map((t, i) => {
            const isCurrent = t.id === level;
            const isPast    = i < currentIdx;
            return (
              <div key={t.id} style={{ display: "flex", gap: 12, padding: "12px 14px", background: isCurrent ? t.bg : isPast ? "rgba(11,11,13,0.02)" : "#fff", border: `1px solid ${isCurrent ? t.color + "33" : COLORS.borderSoft}`, borderRadius: 10, opacity: isPast ? 0.7 : 1, fontFamily: FONTS.body }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: isCurrent ? t.color : isPast ? COLORS.borderSoft : "rgba(11,11,13,0.04)", color: isCurrent || isPast ? "#fff" : COLORS.inkMuted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  {isPast ? "✓" : t.badge}
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13, fontWeight: 600, color: isCurrent ? t.color : COLORS.ink, marginBottom: 3 }}>{t.label}{isCurrent && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 400 }} className="text-admin-ink-muted">— you are here</span>}</div>
                  <div className="text-admin-ink-muted text-admin-11h">{t.requirements.join(" · ")}</div>
                </div>
              </div>
            );
          })}
        </div>
        {next && (
          <div style={{ padding: "14px 16px", background: "rgba(11,11,13,0.02)", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, fontFamily: FONTS.body }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }} className="text-admin-ink">Unlock {next.label}</div>
            <div style={{ fontSize: 12, marginBottom: 10 }} className="text-admin-ink-muted">{next.requirements.join(", ")}</div>
            <button type="button" onClick={() => openDrawer("kyc-verification")} style={{ padding: "8px 16px", background: COLORS.fill, color: "#fff", border: "none", borderRadius: 7, fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Start verification →
            </button>
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-5.1 — Escrow Detail Drawer
// ════════════════════════════════════════════════════════════════════

