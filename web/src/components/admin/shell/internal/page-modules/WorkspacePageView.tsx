"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { CreateMyTalentProfileDialog } from "@/components/talent/create-my-talent-profile-dialog";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
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
  const t = useT();
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
    { id: "workspace", label: t("dashboard.adminWorkspace.tabWorkspace"),     emoji: "🏛", sections: ["account", "workspace", "commercial-terms", "domain", "branding", "media-watermark"] },
    { id: "roster",    label: t("dashboard.adminWorkspace.tabRoster"),        emoji: "🎯", sections: ["talent-types", "roster-review", "registration", "discover"] },
    { id: "team",      label: t("dashboard.adminWorkspace.tabTeamLegal"),  emoji: "👥", sections: ["team", "compliance"] },
    { id: "billing",   label: t("dashboard.adminWorkspace.tabPlanIntegrations"), emoji: "💳", sections: ["plan", "integrations", "brand", "growth", "email"] },
    { id: "advanced",  label: t("dashboard.adminWorkspace.tabAdvanced"),      emoji: "⚙",  sections: ["features", "danger"] },
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
        title={t("dashboard.adminWorkspace.title")}
        subtitle={t("dashboard.adminWorkspace.subtitle")}
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
              {openSet.size === SETTINGS_SECTIONS.length ? t("dashboard.adminWorkspace.collapseAll") : t("dashboard.adminWorkspace.expandAll")}
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
          <AccordionItem id="account" label={t("dashboard.adminWorkspace.accountLabel")} desc={t("dashboard.adminWorkspace.accountDesc")} supportLink="/help/settings/account" open={isOpen("account")} onToggle={() => toggleSection("account")}>
            <SettingsRow onClick={() => openDrawer("identity")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{effectiveTenant.name}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.accountRowMeta")}</div>
              </div>
              <Affordance label={t("dashboard.adminWorkspace.affordanceEdit")} />
            </SettingsRow>
            {/* Phase 4 — Pure Workspace state: CTA to create own talent page.
                Shown only when the current admin has no talent profile in this
                workspace (bridgeTalentSelfProfile === null). */}
            {bridgeTalentSelfProfile === null && isAdmin && tenantSlug && (
              <SettingsRow onClick={() => setCreateTalentDialogOpenSettings(true)}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                    {t("dashboard.adminWorkspace.takeBookingsTitle")}
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    {t("dashboard.adminWorkspace.takeBookingsDesc")}
                  </div>
                </div>
                <Affordance label={t("dashboard.adminWorkspace.affordanceCreate")} />
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
          <AccordionItem id="plan" label={t("dashboard.adminWorkspace.planLabel")} desc={t("dashboard.adminWorkspace.planDesc")} supportLink="/help/settings/billing" defaultBadge={<PlanChip plan={state.plan} variant="solid" />} open={isOpen("plan")} onToggle={() => toggleSection("plan")}>
            {isOwner ? (
              <SettingsRow onClick={() => openDrawer("plan-billing")}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <PlanChip plan={state.plan} variant="solid" />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{PLAN_META[state.plan].label}</div>
                    <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{PLAN_META[state.plan].theme}</div>
                  </div>
                </div>
                <Affordance label={t("dashboard.adminWorkspace.affordanceManage")} />
              </SettingsRow>
            ) : (
              <SettingsRow opacity={0.6}>
                <span style={{ fontSize: 13, color: COLORS.inkMuted }}>{t("dashboard.adminWorkspace.ownersOnlyBilling")}</span>
                <ReadOnlyChip />
              </SettingsRow>
            )}
          </AccordionItem>
          )}

          {visibleSections.has("workspace") && (
          <AccordionItem id="workspace" label={t("dashboard.adminWorkspace.workspaceLabel")} desc={t("dashboard.adminWorkspace.workspaceDesc")} supportLink="/help/settings/workspace" open={isOpen("workspace")} onToggle={() => toggleSection("workspace")}>
            {[
              { title: t("dashboard.adminWorkspace.wsGeneralTitle"),     desc: t("dashboard.adminWorkspace.wsGeneralDesc"),  drawer: "workspace-settings" as const },
              { title: t("dashboard.adminWorkspace.wsGuestChatTitle"), desc: t("dashboard.adminWorkspace.wsGuestChatDesc"), drawer: "guest-chat-settings" as const },
              { title: t("dashboard.adminWorkspace.wsProfileFieldsTitle"), desc: t("dashboard.adminWorkspace.wsProfileFieldsDesc"), drawer: "field-catalog" as const, plan: "agency" as const },
              { title: t("dashboard.adminWorkspace.wsFieldSettingsTitle"), desc: t("dashboard.adminWorkspace.wsFieldSettingsDesc"), drawer: "workspace-field-settings" as const, plan: "agency" as const },
              { title: t("dashboard.adminWorkspace.wsTalentCategoriesTitle"), desc: t("dashboard.adminWorkspace.wsTalentCategoriesDesc"),  drawer: "talent-types" as const, plan: "agency" as const },
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
                  {locked ? <LockedPill plan={row.plan!} /> : <Affordance label={t("dashboard.adminWorkspace.affordanceConfigure")} />}
                </SettingsRow>
              );
            })}
            {/* L49 — Default currency inline picker (display-only, no FX). */}
            <DefaultCurrencySettingsRow />
          </AccordionItem>
          )}

          {visibleSections.has("commercial-terms") && tenantSlug && (
          <AccordionItem id="commercial-terms" label={t("dashboard.adminWorkspace.bookingTermsLabel")} desc={t("dashboard.adminWorkspace.bookingTermsDesc")} supportLink="/help/settings/booking-terms" open={isOpen("commercial-terms")} onToggle={() => toggleSection("commercial-terms")}>
            {/* Commercial terms — workspace defaults; an offer can override. */}
            <CommercialTermsSettingsCard tenantSlug={tenantSlug} />
          </AccordionItem>
          )}

          {visibleSections.has("domain") && (
          <AccordionItem id="domain" label={t("dashboard.adminWorkspace.domainLabel")} desc={t("dashboard.adminWorkspace.domainDesc")} supportLink="/help/settings/domain" open={isOpen("domain")} onToggle={() => toggleSection("domain")}>
            {meetsPlan(state.plan, "studio") ? (
              <SettingsRow>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.customDomain")}</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    {t("dashboard.adminWorkspace.noCustomDomain")}
                  </div>
                </div>
              </SettingsRow>
            ) : (
              <SettingsRow
                opacity={0.55}
                onClick={() => openUpgrade({ feature: t("dashboard.adminWorkspace.customDomain"), why: t("dashboard.adminWorkspace.domainDesc"), requiredPlan: "studio" })}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.customDomain")}</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.requiresStudio")}</div>
                </div>
                <LockedPill plan="studio" />
              </SettingsRow>
            )}
          </AccordionItem>
          )}

          {visibleSections.has("branding") && (
          <AccordionItem id="branding" label={t("dashboard.adminWorkspace.brandingLabel")} desc={t("dashboard.adminWorkspace.brandingDesc")} supportLink="/help/settings/branding" open={isOpen("branding")} onToggle={() => toggleSection("branding")}>
            {isAdmin && meetsPlan(state.plan, "agency") ? (
              <SettingsRow onClick={() => openDrawer("branding")}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.brandIdentity")}</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.brandIdentityMeta")}</div>
                </div>
                <Affordance label={t("dashboard.adminWorkspace.affordanceEdit")} />
              </SettingsRow>
            ) : (
              <SettingsRow
                opacity={0.55}
                onClick={() => openUpgrade({ feature: t("dashboard.adminWorkspace.brandingLabel"), why: t("dashboard.adminWorkspace.brandingUpgradeWhy"), requiredPlan: "agency", unlocks: [t("dashboard.adminWorkspace.brandingUnlock1"), t("dashboard.adminWorkspace.brandingUnlock2"), t("dashboard.adminWorkspace.brandingUnlock3")] })}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.brandIdentity")}</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.requiresAgency")}</div>
                </div>
                <LockedPill plan="agency" />
              </SettingsRow>
            )}
          </AccordionItem>
          )}

          {visibleSections.has("media-watermark") && (
          <AccordionItem id="media-watermark" label={t("dashboard.adminWorkspace.mediaWatermarkLabel")} desc={t("dashboard.adminWorkspace.mediaWatermarkDesc")} supportLink="/help/settings/media" open={isOpen("media-watermark")} onToggle={() => toggleSection("media-watermark")}>
            {/* Watermark — Studio+ */}
            {meetsPlan(state.plan, "studio") ? (
              <SettingsRow onClick={() => openDrawer("branding")}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.logoWatermark")}</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    {t("dashboard.adminWorkspace.logoWatermarkMeta")}
                  </div>
                </div>
                <Affordance label={t("dashboard.adminWorkspace.affordanceConfigure")} />
              </SettingsRow>
            ) : (
              <SettingsRow
                opacity={0.55}
                onClick={() => openUpgrade({
                  feature: t("dashboard.adminWorkspace.logoWatermark"),
                  why: t("dashboard.adminWorkspace.watermarkUpgradeWhy"),
                  requiredPlan: "studio",
                  unlocks: [t("dashboard.adminWorkspace.watermarkUnlock1"), t("dashboard.adminWorkspace.watermarkUnlock2"), t("dashboard.adminWorkspace.watermarkUnlock3")],
                })}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.logoWatermark")}</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.requiresStudio")}</div>
                </div>
                <LockedPill plan="studio" />
              </SettingsRow>
            )}
            {/* Media gallery + usage — Agency+ */}
            {meetsPlan(state.plan, "agency") ? (
              <SettingsRow onClick={() => setPage("media")}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.mediaGallery")}</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    {t("dashboard.adminWorkspace.mediaGalleryMeta")}
                  </div>
                </div>
                <Affordance label={t("dashboard.adminWorkspace.affordanceOpen")} />
              </SettingsRow>
            ) : (
              <SettingsRow
                opacity={0.55}
                onClick={() => openUpgrade({
                  feature: t("dashboard.adminWorkspace.brandedMediaGallery"),
                  why: t("dashboard.adminWorkspace.mediaGalleryUpgradeWhy"),
                  requiredPlan: "agency",
                  unlocks: [t("dashboard.adminWorkspace.mediaGalleryUnlock1"), t("dashboard.adminWorkspace.mediaGalleryUnlock2"), t("dashboard.adminWorkspace.mediaGalleryUnlock3")],
                })}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.mediaGallery")}</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.requiresAgency")}</div>
                </div>
                <LockedPill plan="agency" />
              </SettingsRow>
            )}
          </AccordionItem>
          )}

          {visibleSections.has("team") && (
          <AccordionItem id="team" label={t("dashboard.adminWorkspace.teamLabel")} desc={t("dashboard.adminWorkspace.teamDesc")} supportLink="/help/settings/team" open={isOpen("team")} onToggle={() => toggleSection("team")}>
            {isAdmin && !isFree ? (
              <SettingsRow onClick={() => openDrawer("team")}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.teamMembers")}</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    {interpolate(t("dashboard.adminWorkspace.teamMembersMeta"), { count: effectiveTeamMembers.length })}
                  </div>
                </div>
                <Affordance label={t("dashboard.adminWorkspace.affordanceManage")} />
              </SettingsRow>
            ) : (
              <SettingsRow
                opacity={0.55}
                onClick={() => openUpgrade({ feature: t("dashboard.adminWorkspace.teamRolesFeature"), why: t("dashboard.adminWorkspace.teamUpgradeWhy"), requiredPlan: "agency", unlocks: [t("dashboard.adminWorkspace.teamUnlock1"), t("dashboard.adminWorkspace.teamUnlock2")] })}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.teamMembers")}</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.requiresAgency")}</div>
                </div>
                <LockedPill plan="agency" />
              </SettingsRow>
            )}
          </AccordionItem>
          )}

          {visibleSections.has("talent-types") && (
          <AccordionItem id="talent-types" label={t("dashboard.adminWorkspace.talentTypesLabel")} desc={t("dashboard.adminWorkspace.talentTypesDesc")} supportLink="/help/settings/talent-types" open={isOpen("talent-types")} onToggle={() => toggleSection("talent-types")}>
            <SettingsRow onClick={() => openDrawer("talent-types")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.categoriesOnSite")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                  {t("dashboard.adminWorkspace.categoriesOnSiteMeta")}
                </div>
              </div>
              <Affordance label={t("dashboard.adminWorkspace.affordanceManage")} />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("field-privacy")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.fieldPrivacy")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                  {t("dashboard.adminWorkspace.fieldPrivacyMeta")}
                </div>
              </div>
              <Affordance label={t("dashboard.adminWorkspace.affordanceConfigure")} />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("field-catalog")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.fieldCatalog")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                  {t("dashboard.adminWorkspace.fieldCatalogMeta")}
                </div>
              </div>
              <Affordance label={t("dashboard.adminWorkspace.affordanceOpen")} />
            </SettingsRow>
          </AccordionItem>
          )}

          {visibleSections.has("roster-review") && (
          <AccordionItem id="roster-review" label={t("dashboard.adminWorkspace.rosterReviewLabel")} desc={t("dashboard.adminWorkspace.rosterReviewDesc")} supportLink="/help/settings/talent-types" open={isOpen("roster-review")} onToggle={() => toggleSection("roster-review")}>
            <SettingsRow onClick={() => openDrawer("trust-verification-queue")}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.trustVerification")}</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    {t("dashboard.adminWorkspace.trustVerificationMeta")}
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
              <Affordance label={pendingTrustCount > 0 ? t("dashboard.adminWorkspace.affordanceReview") : t("dashboard.adminWorkspace.affordanceOpen")} />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("trust-disputed-claims")}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.disputedClaims")}</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    {t("dashboard.adminWorkspace.disputedClaimsMeta")}
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
              <Affordance label={disputedClaimsCount > 0 ? t("dashboard.adminWorkspace.affordanceResolve") : t("dashboard.adminWorkspace.affordanceOpen")} />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("talent-approvals")}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.pendingApprovals")}</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    {pendingTalent.length === 0
                      ? t("dashboard.adminWorkspace.pendingApprovalsEmpty")
                      : t("dashboard.adminWorkspace.pendingApprovalsWaiting")}
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
              <Affordance label={pendingTalent.length === 0 ? t("dashboard.adminWorkspace.affordanceOpenQueue") : t("dashboard.adminWorkspace.affordanceReview")} />
            </SettingsRow>
          </AccordionItem>
          )}

          {visibleSections.has("registration") && (
          <AccordionItem id="registration" label={t("dashboard.adminWorkspace.registrationLabel")} desc={t("dashboard.adminWorkspace.registrationDesc")} supportLink="/help/settings/registration" open={isOpen("registration")} onToggle={() => toggleSection("registration")}>
            <RegistrationSection />
          </AccordionItem>
          )}

          {visibleSections.has("discover") && (
          <AccordionItem id="discover" label={t("dashboard.adminWorkspace.discoverLabel")} desc={t("dashboard.adminWorkspace.discoverDesc")} supportLink="/help/settings/discover" open={isOpen("discover")} onToggle={() => toggleSection("discover")}>
            <SettingsRow>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.discoverTalentsTitle")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                  {t("dashboard.adminWorkspace.discoverTalentsDesc")}
                </div>
              </div>
            </SettingsRow>
            <SettingsRow>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.discoverAnalyticsTitle")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                  {t("dashboard.adminWorkspace.discoverAnalyticsDesc")}
                </div>
              </div>
              {state.plan === "free" && <LockedPill plan="studio" />}
            </SettingsRow>
            <SettingsRow>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.discoverBoostTitle")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                  {t("dashboard.adminWorkspace.discoverBoostDesc")}
                </div>
              </div>
              {(state.plan === "free" || state.plan === "studio") && <LockedPill plan="agency" />}
            </SettingsRow>
            <SettingsRow>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.discoverRollupTitle")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                  {t("dashboard.adminWorkspace.discoverRollupDesc")}
                </div>
              </div>
              {state.plan !== "network" && <LockedPill plan="network" />}
            </SettingsRow>
            <div style={{ padding: "10px 14px 12px 14px", fontSize: 11.5, color: COLORS.inkMuted, fontStyle: "italic", lineHeight: 1.5 }}>
              {t("dashboard.adminWorkspace.discoverFootnote")}
            </div>
          </AccordionItem>
          )}

          {visibleSections.has("integrations") && (
          <AccordionItem id="integrations" label={t("dashboard.adminWorkspace.integrationsLabel")} desc={t("dashboard.adminWorkspace.integrationsDesc")} supportLink="/help/settings/integrations" open={isOpen("integrations")} onToggle={() => toggleSection("integrations")}>
            <IntegrationsSection />
          </AccordionItem>
          )}

          {visibleSections.has("brand") && (
          <AccordionItem id="brand" label={t("dashboard.adminWorkspace.dataBrandLabel")} desc={t("dashboard.adminWorkspace.dataBrandDesc")} supportLink="/help/settings/data-brand" open={isOpen("brand")} onToggle={() => toggleSection("brand")}>
            <SettingsRow onClick={() => openDrawer("csv-import", { type: "talent" })}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.importTalent")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.importTalentDesc")}</div>
              </div>
              <Affordance label={t("dashboard.adminWorkspace.affordanceImport")} />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("migration-assistant")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.migrationAssistant")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.migrationAssistantDesc")}</div>
              </div>
              <Affordance label={t("dashboard.adminWorkspace.affordanceMigrate")} />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("brand-assets")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.brandAssets")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.brandAssetsDesc")}</div>
              </div>
              <Affordance label={t("dashboard.adminWorkspace.affordanceManage")} />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("beta-program")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.betaProgram")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.betaProgramDesc")}</div>
              </div>
              <Affordance label={t("dashboard.adminWorkspace.affordanceManage")} />
            </SettingsRow>
          </AccordionItem>
          )}

          {visibleSections.has("growth") && (
          <AccordionItem id="growth" label={t("dashboard.adminWorkspace.growthLabel")} desc={t("dashboard.adminWorkspace.growthDesc")} supportLink="/help/settings/growth" open={isOpen("growth")} onToggle={() => toggleSection("growth")}>
            <SettingsRow onClick={() => openDrawer("calendar-sync")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.calendarSync")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.calendarSyncDesc")}</div>
              </div>
              <Affordance label={t("dashboard.adminWorkspace.affordanceManage")} />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("referral-dashboard")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.referralProgram")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.referralProgramDesc")}</div>
              </div>
              <Affordance label={t("dashboard.adminWorkspace.affordanceView")} />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("system-status")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.systemStatus")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.systemStatusDesc")}</div>
              </div>
              <Affordance label={t("dashboard.adminWorkspace.affordanceView")} />
            </SettingsRow>
          </AccordionItem>
          )}

          {visibleSections.has("email") && (
          <AccordionItem id="email" label={t("dashboard.adminWorkspace.emailLabel")} desc={t("dashboard.adminWorkspace.emailDesc")} supportLink="/help/settings/email" open={isOpen("email")} onToggle={() => toggleSection("email")}>
            <SettingsRow onClick={() => openDrawer("email-templates")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.emailTemplates")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.emailTemplatesDesc")}</div>
              </div>
              <Affordance label={t("dashboard.adminWorkspace.affordanceManage")} />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("email-branding")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.emailBranding")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.emailBrandingDesc")}</div>
              </div>
              <Affordance label={t("dashboard.adminWorkspace.affordanceCustomize")} />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("email-sequences")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.emailSequences")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.emailSequencesDesc")}</div>
              </div>
              <Affordance label={t("dashboard.adminWorkspace.affordanceManage")} />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("notification-prefs")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.notificationPrefs")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.notificationPrefsDesc")}</div>
              </div>
              <Affordance label={t("dashboard.adminWorkspace.affordanceConfigure")} />
            </SettingsRow>
            {/* Step 13 — Auto-acknowledgement inline form */}
            <AutoAckSettingsRow />
          </AccordionItem>
          )}

          {visibleSections.has("compliance") && (
          <AccordionItem id="compliance" label={t("dashboard.adminWorkspace.complianceLabel")} desc={t("dashboard.adminWorkspace.complianceDesc")} supportLink="/help/settings/compliance" open={isOpen("compliance")} onToggle={() => toggleSection("compliance")}>
            <SettingsRow onClick={() => openDrawer("gdpr-export")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.exportData")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.exportDataDesc")}</div>
              </div>
              <Affordance label={t("dashboard.adminWorkspace.affordanceExport")} />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("consent-log")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.consentLog")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.consentLogDesc")}</div>
              </div>
              <Affordance label={t("dashboard.adminWorkspace.affordanceView")} />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("contract-templates")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.contractTemplates")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.contractTemplatesDesc")}</div>
              </div>
              <Affordance label={t("dashboard.adminWorkspace.affordanceManage")} />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("audit-log")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.auditLog")}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.auditLogDesc")}</div>
              </div>
              <Affordance label={t("dashboard.adminWorkspace.affordanceView")} />
            </SettingsRow>
          </AccordionItem>
          )}

          {isAdmin && visibleSections.has("features") && (
          <AccordionItem id="features" label={t("dashboard.adminWorkspace.featuresLabel")} desc={t("dashboard.adminWorkspace.featuresDesc")} supportLink="/help/settings/features" open={isOpen("features")} onToggle={() => toggleSection("features")}>
              <SettingsRow onClick={() => openDrawer("feature-controls")}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminWorkspace.allFeatureToggles")}</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.allFeatureTogglesDesc")}</div>
                </div>
                <Affordance label={t("dashboard.adminWorkspace.affordanceConfigure")} />
              </SettingsRow>
            </AccordionItem>
          )}

          {isOwner && visibleSections.has("danger") && (
          <AccordionItem id="danger" label={t("dashboard.adminWorkspace.dangerLabel")} desc={t("dashboard.adminWorkspace.dangerDesc")} supportLink="/help/settings/danger" danger open={isOpen("danger")} onToggle={() => toggleSection("danger")}>
              <SettingsRow borderColor="#FCA5A5" onClick={() => openDrawer("danger-zone")}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#DC2626" }}>{t("dashboard.adminWorkspace.deleteTransferWorkspace")}</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{t("dashboard.adminWorkspace.deleteTransferWorkspaceDesc")}</div>
                </div>
                <Affordance label={t("dashboard.adminWorkspace.affordanceOpen")} />
              </SettingsRow>
            </AccordionItem>
          )}

        </div>{/* end accordion list */}
      </div>{/* end max-width wrapper */}

      {/* Legacy — keep MoreWithSection for free plan upsell below the main layout */}
      {state.plan === "free" && (
        <MoreWithSection plan="studio">
          <CompactLockedCard
            title={t("dashboard.adminWorkspace.customDomain")}
            requiredPlan="studio"
            onClick={() =>
              openUpgrade({
                feature: t("dashboard.adminWorkspace.customDomain"),
                why: t("dashboard.adminWorkspace.domainDesc"),
                requiredPlan: "studio",
              })
            }
          />
          <CompactLockedCard
            title={t("dashboard.adminWorkspace.emailFromAddress")}
            requiredPlan="studio"
            onClick={() =>
              openUpgrade({
                feature: t("dashboard.adminWorkspace.emailFromFeature"),
                why: t("dashboard.adminWorkspace.emailFromWhy"),
                requiredPlan: "studio",
              })
            }
          />
        </MoreWithSection>
      )}
    </>
  );
}
