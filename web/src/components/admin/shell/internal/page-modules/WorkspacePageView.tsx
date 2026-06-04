"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { CreateMyTalentProfileDialog } from "@/components/talent/create-my-talent-profile-dialog";
import type { Locale } from "@/i18n/config";
import { Affordance, AutoSaveIndicator, Card, CompactLockedCard, MoreWithSection, PlanChip, ReadOnlyChip } from "../primitives";
import { COLORS, FONTS, PLAN_META, RADIUS, TRANSITION, meetsPlan, meetsRole, useAdminShell } from "../state";
import type { Plan, Role } from "../state";
import { AutoAckSettingsRow, LockedPill, SETTINGS_SECTIONS } from "./BillingPage";
import { DefaultCurrencySettingsRow } from "@/components/admin/account/DefaultCurrencySettingsRow";
import { CommercialTermsSettingsCard } from "@/components/admin/account/CommercialTermsSettingsCard";
import { PageHeader } from "./pages-shared";
import {
  SETTINGS_SECTION_EVENT,
  consumePendingSettingsSection,
  type SettingsSectionTarget,
} from "./settings-deeplink";
import { RegistrationSection } from "./RegistrationSection";
import { IntegrationsSection } from "./IntegrationsSection";
import { SettingsSectionIcon } from "@/components/admin/settings/settings-section-icons";


/** Settings list row — white card with flex-row layout + hover lift.
 *  Interactive rows: pass `onClick`; the whole surface becomes the tap target.
 *  Non-interactive rows (inner button only): omit `onClick`.
 *
 *  Hoisted to module scope (Q4) — has no closure over WorkspacePageView state. */
function SettingsRow({
  children,
  onClick,
  opacity,
  borderColor,
}: {
  children: ReactNode;
  onClick?: () => void;
  opacity?: number;
  borderColor?: string;
}) {
  return (
    <Card
      interactive={!!onClick}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 16px",
        marginBottom: 8,
        fontFamily: FONTS.body,
        ...(opacity !== undefined && { opacity }),
        ...(borderColor ? { borderColor } : {}),
      }}
    >
      {children}
    </Card>
  );
}

// ── Accordion item shell ────────────────────────────────────────
// Click the row to expand/collapse. Smooth chevron rotation + soft
// border highlight when open. `supportLink` is wired to a data-attr
// so backend deep-linking works.
//
// Hoisted to module scope (Q4). `open` + `onToggle` lifted to props so the
// component no longer closes over WorkspacePageView's openSet state. Parent
// computes both per call site via isOpen(id) / () => toggleSection(id).
function AccordionItem({
  id, label, desc, supportLink, danger, defaultBadge, open, onToggle, children,
}: {
  id: string;
  label: string;
  desc: string;
  supportLink: string;
  danger?: boolean;
  defaultBadge?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div
      data-settings-section={id}
      data-support-link={supportLink}
      style={{
        marginBottom: 8,
        background: "#fff",
        border: `1px solid ${open ? (danger ? "#FCA5A5" : COLORS.border) : COLORS.borderSoft}`,
        borderRadius: RADIUS.md,
        overflow: "hidden",
        transition: `border-color ${TRANSITION.sm}, box-shadow ${TRANSITION.sm}`,
        boxShadow: open ? "0 1px 3px rgba(11,11,13,0.04)" : "none",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`settings-body-${id}`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          width: "100%",
          padding: "14px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: FONTS.body,
          textAlign: "left",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "rgba(11,11,13,0.02)"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}
      >
        <SettingsSectionIcon sectionId={id} danger={danger} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontFamily: FONTS.display, fontSize: 15, fontWeight: 600,
              color: danger ? "#DC2626" : COLORS.ink, letterSpacing: -0.1,
            }}>
              {label}
            </span>
            {defaultBadge}
          </div>
          <div style={{
            fontSize: 12.5, color: COLORS.inkMuted, marginTop: 2, lineHeight: 1.4,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {desc}
          </div>
        </div>
        {/* Chevron — rotates 180° when open */}
        <span aria-hidden className={`shrink-0 text-admin-ink-muted [transition:transform_var(--transition-admin-sm)] ${open ? 'rotate-180' : 'rotate-0'}`}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </button>
      {open && (
        <div
          id={`settings-body-${id}`}
          style={{
            padding: "0 16px 14px",
            borderTop: `1px solid ${COLORS.borderSoft}`,
            animation: "settingsAccordionExpand .2s ease-out",
          }}
        >
          <div style={{ paddingTop: 12 }}>{children}</div>
        </div>
      )}
    </div>
  );
}

export function WorkspacePageView() {
  const { state, setPage, openDrawer, openUpgrade, toast, pendingTalent, verificationRequests, profileClaims, effectiveTeamMembers, bridgeTalentSelfProfile, tenantSlug, effectiveTenant } = useAdminShell();
  const pendingTrustCount = verificationRequests.filter(r =>
    r.status === "submitted" || r.status === "in_review" || r.status === "needs_more_info"
  ).length;
  const disputedClaimsCount = profileClaims.filter(c => c.status === "disputed").length;
  const isOwner = state.role === "owner";
  const isAdmin = meetsRole(state.role, "admin");
  const isFree = state.plan === "free";
  const [createTalentDialogOpenSettings, setCreateTalentDialogOpenSettings] = useState(false);

  // Accordion: only Account expanded by default. Click a section header
  // to expand it; click again to collapse. Each accordion item carries
  // a `data-support-link` that backend can route to /help/settings/{id}.
  const [openSet, setOpenSet] = useState<Set<string>>(new Set(["account"]));
  const isOpen = (id: string) => openSet.has(id);
  const toggleSection = (id: string) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const expandAll = () => setOpenSet(new Set(SETTINGS_SECTIONS.map(s => s.id)));
  const collapseAll = () => setOpenSet(new Set(["account"]));

  // 2026 redesign — group the 13-accordion wall into 4 tabs.
  // Each tab renders a subset of the accordion list; user can still
  // expand/collapse within the tab. Clearer mental map than a giant scroll.
  type SettingsTab = "workspace" | "roster" | "team" | "billing" | "advanced";
  const [activeTab, setActiveTab] = useState<SettingsTab>("workspace");
  const TABS: { id: SettingsTab; label: string; emoji: string; sections: string[] }[] = [
    { id: "workspace", label: "Workspace",     emoji: "🏛", sections: ["account", "workspace", "commercial-terms", "domain", "branding", "media-watermark"] },
    { id: "roster",    label: "Roster",        emoji: "🎯", sections: ["talent-types", "roster-review", "registration", "discover"] },
    { id: "team",      label: "Team & legal",  emoji: "👥", sections: ["team", "compliance"] },
    { id: "billing",   label: "Plan & integrations", emoji: "💳", sections: ["plan", "integrations", "brand", "growth", "email"] },
    { id: "advanced",  label: "Advanced",      emoji: "⚙",  sections: ["features", "danger"] },
  ];
  const visibleSections = new Set(TABS.find(t => t.id === activeTab)!.sections);

  // Auto-save indicator (#6) — simulates a settings save 1.2s after mount
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setSavedAt(new Date()), 1200);
    return () => clearTimeout(t);
  }, []);

  // Deep-link: another surface (e.g. the top-bar plan badge) can ask Settings
  // to open a specific tab + accordion section. Switch to the tab so the
  // section actually renders, expand it, then scroll it into view.
  const applySettingsTarget = useCallback((target: SettingsSectionTarget) => {
    setActiveTab(target.tab);
    setOpenSet((prev) => {
      const next = new Set(prev);
      next.add(target.section);
      return next;
    });
    // Wait for the tab switch + accordion expand to commit, then scroll.
    // Two rAFs ≈ one full render+paint cycle, so the node exists by then.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-settings-section="${target.section}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }, []);

  // Resolve a deep-link two ways: (1) consume a target parked right before
  // navigation (covers the setPage → remount path), and (2) listen for live
  // requests fired while we're already on Settings (no remount).
  useEffect(() => {
    const pending = consumePendingSettingsSection();
    if (pending) {
      applySettingsTarget(pending);
    } else {
      // Deep-link from a full navigation (notification "Review request" link or
      // the legacy /admin/roster/registration redirect): ?focus=registration
      // opens Roster → Open for registration and scrolls to it.
      try {
        const focus = new URLSearchParams(window.location.search).get("focus");
        if (focus === "registration") {
          applySettingsTarget({ tab: "roster", section: "registration" });
        }
      } catch {
        /* no-op */
      }
    }
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SettingsSectionTarget>).detail;
      if (detail) applySettingsTarget(detail);
    };
    window.addEventListener(SETTINGS_SECTION_EVENT, handler);
    return () => window.removeEventListener(SETTINGS_SECTION_EVENT, handler);
  }, [applySettingsTarget]);

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Plan, team, branding, identity — the controls that shape who you are inside Tulala."
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={openSet.size === SETTINGS_SECTIONS.length ? collapseAll : expandAll}
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                fontFamily: FONTS.body, fontSize: 12, fontWeight: 500,
                color: COLORS.inkMuted, padding: "6px 8px", borderRadius: 6,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.ink)}
              onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
            >
              {openSet.size === SETTINGS_SECTIONS.length ? "Collapse all" : "Expand all"}
            </button>
            <AutoSaveIndicator savedAt={savedAt} />
          </div>
        }
      />

      {/* 2026 redesign — tab nav groups the 13 accordions into 5 buckets.
          Each tab still uses accordion sections within for expand/collapse. */}
      <div
        data-tulala-settings-tabs
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          background: "rgba(11,11,13,0.04)",
          borderRadius: 999,
          marginBottom: 16,
          maxWidth: 760,
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {TABS.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              style={{
                flexShrink: 0,
                padding: "7px 14px",
                borderRadius: 999,
                border: "none",
                background: active ? "#fff" : "transparent",
                color: active ? COLORS.ink : COLORS.inkMuted,
                fontFamily: FONTS.body,
                fontSize: 12.5,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
                boxShadow: active ? "0 1px 2px rgba(11,11,13,0.06)" : "none",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span aria-hidden className="text-admin-13">{t.emoji}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Single column accordion — click each section header to expand. */}
      <div style={{ maxWidth: 760 }}>
        <div>

          {visibleSections.has("account") && (
          <AccordionItem id="account" label="Account" desc="Workspace name, slug, and contact info." supportLink="/help/settings/account" open={isOpen("account")} onToggle={() => toggleSection("account")}>
            <SettingsRow onClick={() => openDrawer("identity")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{effectiveTenant.name}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Name · Slug · Contact email</div>
              </div>
              <Affordance label="Edit" />
            </SettingsRow>
            {/* Phase 4 — Pure Workspace state: CTA to create own talent page.
                Shown only when the current admin has no talent profile in this
                workspace (bridgeTalentSelfProfile === null). */}
            {bridgeTalentSelfProfile === null && isAdmin && tenantSlug && (
              <SettingsRow onClick={() => setCreateTalentDialogOpenSettings(true)}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                    Want to take bookings yourself?
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    Create your talent page — becomes visible on your workspace roster
                  </div>
                </div>
                <Affordance label="Create" />
              </SettingsRow>
            )}
          </AccordionItem>
          )}
          {/* Dialog for creating own talent page (settings location) */}
          {tenantSlug && (
            <CreateMyTalentProfileDialog
              open={createTalentDialogOpenSettings}
              onOpenChange={setCreateTalentDialogOpenSettings}
              tenantSlug={tenantSlug}
            />
          )}

          {visibleSections.has("plan") && (
          <AccordionItem id="plan" label="Plan & billing" desc="Your current plan, usage, and invoices." supportLink="/help/settings/billing" defaultBadge={<PlanChip plan={state.plan} variant="solid" />} open={isOpen("plan")} onToggle={() => toggleSection("plan")}>
            {isOwner ? (
              <SettingsRow onClick={() => openDrawer("plan-billing")}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <PlanChip plan={state.plan} variant="solid" />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{PLAN_META[state.plan].label}</div>
                    <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{PLAN_META[state.plan].theme}</div>
                  </div>
                </div>
                <Affordance label="Manage" />
              </SettingsRow>
            ) : (
              <SettingsRow opacity={0.6}>
                <span style={{ fontSize: 13, color: COLORS.inkMuted }}>Only owners can change billing</span>
                <ReadOnlyChip />
              </SettingsRow>
            )}
          </AccordionItem>
          )}

          {visibleSections.has("workspace") && (
          <AccordionItem id="workspace" label="Workspace" desc="Timezone, locale, currency, and workspace defaults." supportLink="/help/settings/workspace" open={isOpen("workspace")} onToggle={() => toggleSection("workspace")}>
            {[
              { title: "General",     desc: "Timezone · Locale · Workspace defaults",  drawer: "workspace-settings" as const },
              { title: "Guest chat", desc: "Show a “Message” button on your public pages — on/off + where it appears", drawer: "guest-chat-settings" as const },
              { title: "Profile fields", desc: "Enable, require, rename talent profile fields", drawer: "field-catalog" as const, plan: "agency" as const },
              { title: "Field settings", desc: "Workspace overrides for the resolved profile engine", drawer: "workspace-field-settings" as const, plan: "agency" as const },
              { title: "Talent categories", desc: "Tenant-enabled categories for roster and registration",  drawer: "talent-types" as const, plan: "agency" as const },
            ].map((row) => {
              const locked = row.plan && !meetsPlan(state.plan, row.plan);
              return (
                <SettingsRow
                  key={row.drawer}
                  opacity={locked ? 0.55 : 1}
                  onClick={() => locked ? openUpgrade({ feature: row.title, why: row.desc, requiredPlan: row.plan! }) : openDrawer(row.drawer)}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{row.title}</div>
                    <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{row.desc}</div>
                  </div>
                  {locked ? <LockedPill plan={row.plan!} /> : <Affordance label="Configure" />}
                </SettingsRow>
              );
            })}
            {/* L49 — Default currency inline picker (display-only, no FX). */}
            <DefaultCurrencySettingsRow />
          </AccordionItem>
          )}

          {visibleSections.has("commercial-terms") && tenantSlug && (
          <AccordionItem id="commercial-terms" label="Booking terms" desc="Default deposit, refund policy, and instant booking for new offers." supportLink="/help/settings/booking-terms" open={isOpen("commercial-terms")} onToggle={() => toggleSection("commercial-terms")}>
            {/* Commercial terms — workspace defaults; an offer can override. */}
            <CommercialTermsSettingsCard tenantSlug={tenantSlug} />
          </AccordionItem>
          )}

          {visibleSections.has("domain") && (
          <AccordionItem id="domain" label="Domain" desc="Run your storefront at your own domain." supportLink="/help/settings/domain" open={isOpen("domain")} onToggle={() => toggleSection("domain")}>
            {meetsPlan(state.plan, "studio") ? (
              <SettingsRow>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Custom domain</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    No custom domain connected
                  </div>
                </div>
              </SettingsRow>
            ) : (
              <SettingsRow
                opacity={0.55}
                onClick={() => openUpgrade({ feature: "Custom domain", why: "Run your storefront at your own domain.", requiredPlan: "studio" })}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Custom domain</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Requires Studio or above</div>
                </div>
                <LockedPill plan="studio" />
              </SettingsRow>
            )}
          </AccordionItem>
          )}

          {visibleSections.has("branding") && (
          <AccordionItem id="branding" label="Branding" desc="Logo, colors, email identity — what clients see." supportLink="/help/settings/branding" open={isOpen("branding")} onToggle={() => toggleSection("branding")}>
            {isAdmin && meetsPlan(state.plan, "agency") ? (
              <SettingsRow onClick={() => openDrawer("branding")}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Brand identity</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Logo · Colors · Email signature · Voice</div>
                </div>
                <Affordance label="Edit" />
              </SettingsRow>
            ) : (
              <SettingsRow
                opacity={0.55}
                onClick={() => openUpgrade({ feature: "Branding", why: "Full brand identity control.", requiredPlan: "agency", unlocks: ["Logo & favicon", "Color tokens", "Email signature"] })}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Brand identity</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Requires Agency or above</div>
                </div>
                <LockedPill plan="agency" />
              </SettingsRow>
            )}
          </AccordionItem>
          )}

          {visibleSections.has("media-watermark") && (
          <AccordionItem id="media-watermark" label="Media & watermark" desc="Agency photo library, logo watermark, and photo usage tracking." supportLink="/help/settings/media" open={isOpen("media-watermark")} onToggle={() => toggleSection("media-watermark")}>
            {/* Watermark — Studio+ */}
            {meetsPlan(state.plan, "studio") ? (
              <SettingsRow onClick={() => openDrawer("branding")}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Logo watermark</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    Position · Opacity · Size — applied to public photos
                  </div>
                </div>
                <Affordance label="Configure" />
              </SettingsRow>
            ) : (
              <SettingsRow
                opacity={0.55}
                onClick={() => openUpgrade({
                  feature: "Logo watermark",
                  why: "Brand every photo your agency distributes.",
                  requiredPlan: "studio",
                  unlocks: ["Logo watermark on public photos", "Position, opacity & size control", "Light / dark logo variants"],
                })}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Logo watermark</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Requires Studio or above</div>
                </div>
                <LockedPill plan="studio" />
              </SettingsRow>
            )}
            {/* Media gallery + usage — Agency+ */}
            {meetsPlan(state.plan, "agency") ? (
              <SettingsRow onClick={() => setPage("media")}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Media gallery</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    All workspace photos · bulk watermark · usage tracking
                  </div>
                </div>
                <Affordance label="Open" />
              </SettingsRow>
            ) : (
              <SettingsRow
                opacity={0.55}
                onClick={() => openUpgrade({
                  feature: "Branded media gallery",
                  why: "See every photo your agency controls — and where each one lives.",
                  requiredPlan: "agency",
                  unlocks: ["Workspace-wide photo inventory", "Bulk watermark apply", "Photo usage tracking"],
                })}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Media gallery</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Requires Agency or above</div>
                </div>
                <LockedPill plan="agency" />
              </SettingsRow>
            )}
          </AccordionItem>
          )}

          {visibleSections.has("team") && (
          <AccordionItem id="team" label="Team" desc="Invite teammates and assign roles." supportLink="/help/settings/team" open={isOpen("team")} onToggle={() => toggleSection("team")}>
            {isAdmin && !isFree ? (
              <SettingsRow onClick={() => openDrawer("team")}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Team members</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    {effectiveTeamMembers.length} members · viewer / editor / manager / admin / owner
                  </div>
                </div>
                <Affordance label="Manage" />
              </SettingsRow>
            ) : (
              <SettingsRow
                opacity={0.55}
                onClick={() => openUpgrade({ feature: "Team & roles", why: "Invite teammates.", requiredPlan: "agency", unlocks: ["Up to 25 seats", "Role-based access"] })}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Team members</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Requires Agency or above</div>
                </div>
                <LockedPill plan="agency" />
              </SettingsRow>
            )}
          </AccordionItem>
          )}

          {visibleSections.has("talent-types") && (
          <AccordionItem id="talent-types" label="Talent types & Catalog Fields" desc="Live categories, field privacy, and profile-field rules for your roster." supportLink="/help/settings/talent-types" open={isOpen("talent-types")} onToggle={() => toggleSection("talent-types")}>
            <SettingsRow onClick={() => openDrawer("talent-types")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Categories on your site</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                  Live Tulala taxonomy · enabled for Impronta registration and directory
                </div>
              </div>
              <Affordance label="Manage" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("field-privacy")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Field privacy</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                  Resolved visibility for public site, admin view, registration, and hidden fields
                </div>
              </div>
              <Affordance label="Configure" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("field-catalog")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Field catalog</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                  Built-in engine fields, required rules, labels, helpers, and tenant overrides
                </div>
              </div>
              <Affordance label="Open" />
            </SettingsRow>
          </AccordionItem>
          )}

          {visibleSections.has("roster-review") && (
          <AccordionItem id="roster-review" label="Roster review" desc="Verification requests, disputed claims, and self-registration approvals." supportLink="/help/settings/talent-types" open={isOpen("roster-review")} onToggle={() => toggleSection("roster-review")}>
            <SettingsRow onClick={() => openDrawer("trust-verification-queue")}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Trust & Verification</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    Review Instagram + Tulala verification requests · approve / reject / request more info
                  </div>
                </div>
                {pendingTrustCount > 0 && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    minWidth: 18, height: 18, padding: "0 6px", borderRadius: 999,
                    background: COLORS.indigo, color: "#fff",
                    fontSize: 10.5, fontWeight: 700, lineHeight: 1,
                  }}>{pendingTrustCount}</span>
                )}
              </div>
              <Affordance label={pendingTrustCount > 0 ? "Review" : "Open"} />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("trust-disputed-claims")}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Disputed claims</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    Talent-flagged agency profiles · release / uphold / remove
                  </div>
                </div>
                {disputedClaimsCount > 0 && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    minWidth: 18, height: 18, padding: "0 6px", borderRadius: 999,
                    background: COLORS.red, color: "#fff",
                    fontSize: 10.5, fontWeight: 700, lineHeight: 1,
                  }}>{disputedClaimsCount}</span>
                )}
              </div>
              <Affordance label={disputedClaimsCount > 0 ? "Resolve" : "Open"} />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("talent-approvals")}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Pending approvals</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    {pendingTalent.length === 0
                      ? "No self-registrations waiting — you'll be notified."
                      : "Self-registered talent waiting for review"}
                  </div>
                </div>
                {pendingTalent.length > 0 && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 18,
                      height: 18,
                      padding: "0 6px",
                      borderRadius: 999,
                      background: COLORS.amber,
                      color: "#fff",
                      fontSize: 10.5,
                      fontWeight: 700,
                    }}
                  >
                    {pendingTalent.length}
                  </span>
                )}
              </div>
              <Affordance label={pendingTalent.length === 0 ? "Open queue" : "Review"} />
            </SettingsRow>
          </AccordionItem>
          )}

          {visibleSections.has("registration") && (
          <AccordionItem id="registration" label="Open for registration" desc="Let talent join your roster from your public site — instantly, by approval, or as exclusive representation." supportLink="/help/settings/registration" open={isOpen("registration")} onToggle={() => toggleSection("registration")}>
            <RegistrationSection />
          </AccordionItem>
          )}

          {visibleSections.has("discover") && (
          <AccordionItem id="discover" label="Tulala Discover" desc="What your roster unlocks on the cross-tenant talent catalog." supportLink="/help/settings/discover" open={isOpen("discover")} onToggle={() => toggleSection("discover")}>
            <SettingsRow>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Talents on Discover</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                  Your roster talents can opt in individually via their profile editor. Standard placement on the Discover catalog.
                </div>
              </div>
            </SettingsRow>
            <SettingsRow>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Roster Discover analytics + bulk-enroll</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                  Per-talent impressions, saves, shortlist adds over 30 days. One-toggle bulk-enroll across your roster.
                </div>
              </div>
              {state.plan === "free" && <LockedPill plan="studio" />}
            </SettingsRow>
            <SettingsRow>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Priority placement boost</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                  Pin individual talents near the top of Discover via the &ldquo;feature in directory&rdquo; toggle. 90-day analytics. Saved query cohorts.
                </div>
              </div>
              {(state.plan === "free" || state.plan === "studio") && <LockedPill plan="agency" />}
            </SettingsRow>
            <SettingsRow>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Multi-workspace Discover rollup</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                  Aggregate Discover performance across every workspace in your network. Unlimited analytics history.
                </div>
              </div>
              {state.plan !== "network" && <LockedPill plan="network" />}
            </SettingsRow>
            <div style={{ padding: "10px 14px 12px 14px", fontSize: 11.5, color: COLORS.inkMuted, fontStyle: "italic", lineHeight: 1.5 }}>
              Each talent&apos;s own &ldquo;Show me on Discover&rdquo; toggle (in their profile) controls visibility. Your workspace plan unlocks placement + analytics tools — not visibility itself.
            </div>
          </AccordionItem>
          )}

          {visibleSections.has("integrations") && (
          <AccordionItem id="integrations" label="Integrations" desc="Bring your own keys — maps, analytics, and marketing tags for your storefront." supportLink="/help/settings/integrations" open={isOpen("integrations")} onToggle={() => toggleSection("integrations")}>
            <IntegrationsSection />
          </AccordionItem>
          )}

          {visibleSections.has("brand") && (
          <AccordionItem id="brand" label="Data & brand tools" desc="Imports, migration, brand assets, and brief authoring." supportLink="/help/settings/data-brand" open={isOpen("brand")} onToggle={() => toggleSection("brand")}>
            <SettingsRow onClick={() => openDrawer("csv-import", { type: "talent" })}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Import talent</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Bulk CSV import with column mapping.</div>
              </div>
              <Affordance label="Import" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("migration-assistant")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Migration assistant</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>AI-assisted import from Excel, WhatsApp, Airtable.</div>
              </div>
              <Affordance label="Migrate" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("brand-assets")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Brand assets</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Logos, photography, and document library.</div>
              </div>
              <Affordance label="Manage" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("beta-program")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Beta program</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Opt into early-access features.</div>
              </div>
              <Affordance label="Manage" />
            </SettingsRow>
          </AccordionItem>
          )}

          {visibleSections.has("growth") && (
          <AccordionItem id="growth" label="Growth & integrations" desc="Calendar sync, referrals, and platform status." supportLink="/help/settings/growth" open={isOpen("growth")} onToggle={() => toggleSection("growth")}>
            <SettingsRow onClick={() => openDrawer("calendar-sync")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Calendar sync</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Google, Apple, Outlook · iCal subscription URL.</div>
              </div>
              <Affordance label="Manage" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("referral-dashboard")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Referral program</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Earn €50 credit per workspace you refer.</div>
              </div>
              <Affordance label="View" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("system-status")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>System status</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Tulala infrastructure health and incident log.</div>
              </div>
              <Affordance label="View" />
            </SettingsRow>
          </AccordionItem>
          )}

          {visibleSections.has("email") && (
          <AccordionItem id="email" label="Email & communications" desc="Templates, sequences, branding, and notification preferences." supportLink="/help/settings/email" open={isOpen("email")} onToggle={() => toggleSection("email")}>
            <SettingsRow onClick={() => openDrawer("email-templates")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Email templates</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Manage your transactional email library.</div>
              </div>
              <Affordance label="Manage" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("email-branding")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Email branding</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Sender name, logo, colors, and footer.</div>
              </div>
              <Affordance label="Customize" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("email-sequences")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Email sequences</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Onboarding, dunning, win-back campaigns.</div>
              </div>
              <Affordance label="Manage" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("notification-prefs")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Notification preferences</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Email, push, and SMS per event type.</div>
              </div>
              <Affordance label="Configure" />
            </SettingsRow>
            {/* Step 13 — Auto-acknowledgement inline form */}
            <AutoAckSettingsRow />
          </AccordionItem>
          )}

          {visibleSections.has("compliance") && (
          <AccordionItem id="compliance" label="Compliance & legal" desc="GDPR, consent records, and contract templates." supportLink="/help/settings/compliance" open={isOpen("compliance")} onToggle={() => toggleSection("compliance")}>
            <SettingsRow onClick={() => openDrawer("gdpr-export")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Export your data</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>GDPR / CCPA data portability — per data type.</div>
              </div>
              <Affordance label="Export" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("consent-log")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Consent log</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Marketing preferences — timestamped and auditable.</div>
              </div>
              <Affordance label="View" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("contract-templates")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Contract templates</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Workspace-wide reusable templates with merge fields.</div>
              </div>
              <Affordance label="Manage" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("audit-log")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Audit log</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Full event trail — logins, edits, access records.</div>
              </div>
              <Affordance label="View" />
            </SettingsRow>
          </AccordionItem>
          )}

          {isAdmin && visibleSections.has("features") && (
          <AccordionItem id="features" label="Feature controls" desc="Turn platform features on or off for your workspace." supportLink="/help/settings/features" open={isOpen("features")} onToggle={() => toggleSection("features")}>
              <SettingsRow onClick={() => openDrawer("feature-controls")}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>All feature toggles</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Inbox, casting, bookings, payments, analytics, AI tools, site builder, and more.</div>
                </div>
                <Affordance label="Configure" />
              </SettingsRow>
            </AccordionItem>
          )}

          {isOwner && visibleSections.has("danger") && (
          <AccordionItem id="danger" label="Danger zone" desc="Irreversible operations — proceed with care." supportLink="/help/settings/danger" danger open={isOpen("danger")} onToggle={() => toggleSection("danger")}>
              <SettingsRow borderColor="#FCA5A5" onClick={() => openDrawer("danger-zone")}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#DC2626" }}>Delete or transfer workspace</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Export everything, transfer ownership, or delete this workspace.</div>
                </div>
                <Affordance label="Open" />
              </SettingsRow>
            </AccordionItem>
          )}

        </div>{/* end accordion list */}
      </div>{/* end max-width wrapper */}

      {/* Legacy — keep MoreWithSection for free plan upsell below the main layout */}
      {state.plan === "free" && (
        <MoreWithSection plan="studio">
          <CompactLockedCard
            title="Custom domain"
            requiredPlan="studio"
            onClick={() =>
              openUpgrade({
                feature: "Custom domain",
                why: "Run your storefront at your own domain.",
                requiredPlan: "studio",
              })
            }
          />
          <CompactLockedCard
            title="Email-from address"
            requiredPlan="studio"
            onClick={() =>
              openUpgrade({
                feature: "Email-from",
                why: "Send client offers from your own verified email.",
                requiredPlan: "studio",
              })
            }
          />
        </MoreWithSection>
      )}
    </>
  );
}
