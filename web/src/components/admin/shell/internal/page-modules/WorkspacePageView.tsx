"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { CreateMyTalentProfileDialog } from "@/components/talent/create-my-talent-profile-dialog";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { Affordance, AutoSaveIndicator, Card, CompactLockedCard, MoreWithSection, PlanChip, ReadOnlyChip, useViewport } from "../primitives";
import { COLORS, FONTS, RADIUS, TRANSITION, meetsPlan, meetsRole, useAdminShell } from "../state";
import { AutoAckSettingsRow, LockedPill } from "./BillingPage";
import { DefaultCurrencySettingsRow } from "@/components/admin/account/DefaultCurrencySettingsRow";
import { SupportReplaySettingsRow } from "@/components/admin/account/SupportReplaySettingsRow";
import { CommercialTermsSettingsCard } from "@/components/admin/account/CommercialTermsSettingsCard";
import { PricingDefaultsSettingsCard } from "@/components/admin/account/PricingDefaultsSettingsCard";
import { PageHeader } from "./pages-shared";
import {
  SETTINGS_SECTION_EVENT,
  consumePendingSettingsSection,
  type SettingsSectionTarget,
} from "./settings-deeplink";
import { RegistrationSection } from "./RegistrationSection";
import { DiscoverExposureSection } from "./DiscoverExposureSection";
import { IntegrationsSection } from "./IntegrationsSection";
import { SettingsSectionIcon } from "@/components/admin/settings/settings-section-icons";
import { WorkspaceTypeCard } from "@/components/admin/settings/workspace-type-card";
import { AppointmentsSettingsCard } from "@/components/appointments/AppointmentsSettingsCard";
import { IndustrySettingsCard } from "@/components/words/IndustrySettingsCard";
import { VenueSettingsCard } from "@/components/spaces/VenueSettingsCard";
import { BookingHoursCard } from "@/components/appointments/BookingHoursCard";
import { StaffResourcesCard } from "@/components/appointments/StaffResourcesCard";

// ════════════════════════════════════════════════════════════════════════
// 2026-07-24 flat redesign — replaces the old tabs + 13-accordion wall with
// a single flat list of settings groups (Shopify/Stripe pattern): a slim
// left nav (dropdown on phone), one click per group, no accordions, no
// "Configure" → drawer detour through a collapsed section. A search box
// above the nav filters rows by label/description across every group.
//
// Also dedupes three rows that opened the *same* drawer from two places:
//   - "Profile fields" (Workspace tab) and "Field catalog" (Roster tab)
//     both opened `field-catalog` — kept once, in "Roster & profile fields".
//   - "Talent categories" (Workspace tab) and "Categories on your site"
//     (Roster tab) both opened `talent-types` — kept once, same group.
//   - "Field settings" (Workspace tab) opened `workspace-field-settings`,
//     a redundant parallel editor writing the same tables as the Field
//     catalog drawer (light-10.tsx). That row + its drawer (light-09.tsx)
//     are removed entirely — see drawers.tsx / drawer-ids.ts.
// ════════════════════════════════════════════════════════════════════════

/** Settings list row — white card with flex-row layout + hover lift.
 *  Interactive rows: pass `onClick`; the whole surface becomes the tap target.
 *  Non-interactive rows (inner button only): omit `onClick`. */
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

/** Declarative row descriptor — covers the vast majority of settings rows
 *  (title + description + tap target). `custom` is an escape hatch for the
 *  handful of rows with bespoke layout (count badges, plan chips, locked
 *  read-only states); `title`/`desc` still feed the search index even when
 *  `custom` is used, so search stays exhaustive. */
type SimpleSettingRow = {
  key: string;
  title: string;
  desc: string;
  onClick?: () => void;
  opacity?: number;
  borderColor?: string;
  titleColor?: string;
  right?: ReactNode;
  custom?: ReactNode;
};

function renderSimpleRow(row: SimpleSettingRow) {
  return (
    <SettingsRow key={row.key} onClick={row.onClick} opacity={row.opacity} borderColor={row.borderColor}>
      {row.custom ?? (
        <>
          <div>
            <div style={{ "--row-title": row.titleColor ?? COLORS.ink } as CSSProperties} className="text-[13px] font-semibold text-[var(--row-title)]">{row.title}</div>
            <div className="text-[12px] mt-0.5 text-admin-ink-muted">{row.desc}</div>
          </div>
          {row.right}
        </>
      )}
    </SettingsRow>
  );
}

type GroupId =
  | "account"
  | "plan"
  | "workspace"
  | "commercial-terms"
  | "venue"
  // Industry and words: the sixteen presets. Sits above appointments
  // because the preset supplies the nouns that screen then uses.
  | "industry"
  | "appointments"
  | "pricing-defaults"
  | "domain"
  | "branding"
  | "team"
  | "roster-fields"
  | "registration"
  | "discover"
  | "compliance"
  | "integrations"
  | "email"
  | "advanced";

type Group = {
  id: GroupId;
  label: string;
  desc: string;
  visible: boolean;
  /** Small chip shown next to the label in the nav (plan tier only). */
  navBadge?: ReactNode;
  rows: SimpleSettingRow[];
  /** Bespoke content that isn't a simple row (cards, forms, sub-sections). */
  extra?: ReactNode;
  extraSearch?: { title: string; desc: string }[];
  /** Where `extra` renders relative to `rows`. Default "after". */
  extraPosition?: "before" | "after";
};

/** One flat nav item — icon tile, label, description, active state. */
function NavItem({
  group,
  active,
  onClick,
}: {
  group: Group;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      // Geometry/typography live in classes; only token-derived values stay in
      // the style attribute, as CSS custom properties.
      //
      // The hover wash is a real `hover:` class now, not the previous
      // onMouseEnter/onMouseLeave pair that wrote `style.background`. Those
      // handlers only worked because the base background was ALSO inline and
      // React overwrote the mutation on every render. With the base moved to a
      // class, the imperatively-set inline value outlives the state change and
      // wins forever — a hovered item that then became active kept the faint
      // hover tint (0.03) instead of the active tint (0.055). Verified in the
      // browser before this rewrite. CSS hover has no such ordering problem,
      // and the style attribute here sets no background, so nothing shadows it.
      style={{
        "--r": RADIUS.md,
        "--ff": FONTS.body,
        "--t": `background ${TRANSITION.micro}`,
      } as CSSProperties}
      className={`flex items-center gap-2.5 w-full py-[9px] px-2.5 rounded-[var(--r)] border-none cursor-pointer text-left font-[var(--ff)] transition-[var(--t)] ${
        active ? "bg-[rgba(11,11,13,0.055)]" : "bg-transparent hover:bg-[rgba(11,11,13,0.03)]"
      }`}
    >
      <SettingsSectionIcon sectionId={group.id} size={26} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-[13px] tracking-[-0.05px] text-admin-ink ${active ? "font-bold" : "font-semibold"}`}>
            {group.label}
          </span>
          {group.navBadge}
        </div>
      </div>
    </button>
  );
}

export function WorkspacePageView() {
  const t = useT();
  const { state, setPage, openDrawer, openUpgrade, pendingTalent, verificationRequests, profileClaims, effectiveTeamMembers, bridgeTalentSelfProfile, tenantSlug, effectiveTenant, adminBasePath } = useAdminShell();
  const router = useRouter();
  const pendingTrustCount = verificationRequests.filter(r =>
    r.status === "submitted" || r.status === "in_review" || r.status === "needs_more_info"
  ).length;
  const disputedClaimsCount = profileClaims.filter(c => c.status === "disputed").length;
  const isOwner = state.role === "owner";
  const isAdmin = meetsRole(state.role, "admin");
  const isFree = state.plan === "free";
  const [createTalentDialogOpenSettings, setCreateTalentDialogOpenSettings] = useState(false);
  const viewport = useViewport();
  const isPhone = viewport === "phone";

  const [activeGroup, setActiveGroup] = useState<GroupId>("account");
  const [query, setQuery] = useState("");

  // PLAN_META carries English-only `label`/`theme` (it is a shared fixture,
  // also read by non-localized consumers). PlanChip already renders the
  // localized label, so reading PLAN_META raw here put "Studio" next to a
  // chip saying "Estudio". Resolve both through the catalog instead.
  const planLabel = t(`dashboard.adminWorkspace.planName${state.plan.charAt(0).toUpperCase()}${state.plan.slice(1)}`);
  const planTheme = t(`dashboard.adminWorkspace.planTheme${state.plan.charAt(0).toUpperCase()}${state.plan.slice(1)}`);

  // Auto-save indicator — simulates a settings save 1.2s after mount.
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setSavedAt(new Date()), 1200);
    return () => clearTimeout(timer);
  }, []);

  // Deep-link: another surface (e.g. the top-bar plan badge) can ask Settings
  // to open a specific group. Switch to it, clear any search, then scroll the
  // content pane into view.
  const applySettingsTarget = useCallback((target: SettingsSectionTarget) => {
    setActiveGroup(target.section as GroupId);
    setQuery("");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-settings-section="${target.section}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }, []);

  useEffect(() => {
    const pending = consumePendingSettingsSection();
    if (pending) {
      applySettingsTarget(pending);
    } else {
      // Deep-link from a full navigation (notification "Review request" link or
      // the legacy /admin/roster/registration redirect): ?focus=registration
      // opens the Registration group and scrolls to it.
      try {
        const focus = new URLSearchParams(window.location.search).get("focus");
        if (focus === "registration") {
          applySettingsTarget({ section: "registration" });
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

  // ── Groups — every settings row lives in exactly one group. ───────────
  const groups: Group[] = useMemo(() => {
    const list: Group[] = [
      {
        id: "account",
        label: t("dashboard.adminWorkspace.accountLabel"),
        desc: t("dashboard.adminWorkspace.accountDesc"),
        visible: true,
        rows: [
          {
            key: "identity",
            title: effectiveTenant.name,
            desc: t("dashboard.adminWorkspace.accountRowMeta"),
            onClick: () => openDrawer("identity"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceEdit")} />,
          },
          // Pure Workspace state: CTA to create own talent page. Shown only
          // when the current admin has no talent profile in this workspace.
          ...(bridgeTalentSelfProfile === null && isAdmin && tenantSlug
            ? [{
                key: "take-bookings",
                title: t("dashboard.adminWorkspace.takeBookingsTitle"),
                desc: t("dashboard.adminWorkspace.takeBookingsDesc"),
                onClick: () => setCreateTalentDialogOpenSettings(true),
                right: <Affordance label={t("dashboard.adminWorkspace.affordanceCreate")} />,
              }]
            : []),
        ],
      },
      {
        id: "plan",
        label: t("dashboard.adminWorkspace.planLabel"),
        desc: t("dashboard.adminWorkspace.planDesc"),
        visible: true,
        navBadge: <PlanChip plan={state.plan} variant="solid" />,
        rows: [
          isOwner
            ? {
                key: "plan-manage",
                title: planLabel,
                desc: planTheme,
                onClick: () => openDrawer("plan-billing"),
                custom: (
                  <>
                    <div className="flex items-center gap-2.5">
                      <PlanChip plan={state.plan} variant="solid" />
                      <div>
                        <div className="text-[13px] font-semibold text-admin-ink">{planLabel}</div>
                        <div className="text-[12px] mt-0.5 text-admin-ink-muted">{planTheme}</div>
                      </div>
                    </div>
                    <Affordance label={t("dashboard.adminWorkspace.affordanceManage")} />
                  </>
                ),
              }
            : {
                key: "plan-readonly",
                title: t("dashboard.adminWorkspace.ownersOnlyBilling"),
                desc: "",
                opacity: 0.6,
                custom: (
                  <>
                    <span className="text-[13px] text-admin-ink-muted">{t("dashboard.adminWorkspace.ownersOnlyBilling")}</span>
                    <ReadOnlyChip />
                  </>
                ),
              },
          // Account & billing — the REAL subscription surface
          // (/<tenant>/admin/account): live Stripe subscription state, Checkout
          // upgrade, and the Billing Portal for invoices + payment method.
          // Nothing linked to it before this row, so the only billing UI a
          // workspace could reach was the `plan-billing` drawer, which used to
          // fabricate its invoices and card. Gate matches the server action's
          // own `manage_billing` capability (admin+), not owner.
          ...(isAdmin
            ? [{
                key: "account-billing",
                title: t("dashboard.adminWorkspace.accountBillingTitle"),
                desc: t("dashboard.adminWorkspace.accountBillingDesc"),
                onClick: () => router.push(`${adminBasePath}/account`),
                right: <Affordance label={t("dashboard.adminWorkspace.affordanceOpen")} />,
              }]
            : []),
          // Payout bank account — Stripe Connect onboarding. The `payouts`
          // page has always rendered, but NOTHING navigated to it: the
          // integrations card that pointed at it (SURFACED_INTEGRATIONS) has
          // no consumer, and the activation-checklist CTA self-hides for any
          // established tenant (roster + custom domain). Owner-only, matching
          // `agency.payout_account.manage` in OWNER_CAPS — a non-owner would
          // land on the surface's own "ask your owner" state.
          ...(isOwner
            ? [{
                key: "payout-bank",
                title: t("dashboard.adminWorkspace.payoutBankTitle"),
                desc: t("dashboard.adminWorkspace.payoutBankDesc"),
                onClick: () => setPage("payouts"),
                right: <Affordance label={t("dashboard.adminWorkspace.affordanceOpen")} />,
              }]
            : []),
        ],
      },
      {
        id: "workspace",
        label: t("dashboard.adminWorkspace.workspaceLabel"),
        desc: t("dashboard.adminWorkspace.workspaceDesc"),
        visible: true,
        rows: [
          {
            key: "ws-general",
            title: t("dashboard.adminWorkspace.wsGeneralTitle"),
            desc: t("dashboard.adminWorkspace.wsGeneralDesc"),
            onClick: () => openDrawer("workspace-settings"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceConfigure")} />,
          },
          {
            key: "ws-guest-chat",
            title: t("dashboard.adminWorkspace.wsGuestChatTitle"),
            desc: t("dashboard.adminWorkspace.wsGuestChatDesc"),
            onClick: () => openDrawer("guest-chat-settings"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceConfigure")} />,
          },
        ],
        extra: (
          <>
            {/* Owner-only, and the ONLY caller of `setWorkspaceType`. Lives in
                its own file because this one is already past the 800-line
                max-lines cap. */}
            <WorkspaceTypeCard currentType={state.workspaceType} canEdit={isOwner} />
            <DefaultCurrencySettingsRow />
            <SupportReplaySettingsRow />
          </>
        ),
        extraSearch: [
          {
            title: t("dashboard.adminWorkspace.workspaceType.title"),
            desc: t("dashboard.adminWorkspace.workspaceType.desc"),
          },
          {
            // The row this indexes is `DefaultCurrencySettingsRow`; mirror ITS
            // own title/desc keys. `dashboard.adminWorkspace.defaultCurrency` is
            // an object node (only `.desc` under it), so passing it to `t()`
            // rendered the raw dotted key in settings search results.
            title: t("admin.account.currency.label"),
            desc: t("dashboard.adminWorkspace.defaultCurrency.desc"),
          },
          {
            title: t("dashboard.adminWorkspace.replayBufferTitle"),
            desc: t("dashboard.adminWorkspace.replayBufferDesc"),
          },
        ],
      },
      {
        id: "commercial-terms",
        label: t("dashboard.adminWorkspace.bookingTermsLabel"),
        desc: t("dashboard.adminWorkspace.bookingTermsDesc"),
        visible: !!tenantSlug,
        rows: [],
        extra: tenantSlug ? <CommercialTermsSettingsCard tenantSlug={tenantSlug} /> : null,
        extraSearch: [{ title: t("dashboard.adminWorkspace.bookingTermsLabel"), desc: t("dashboard.adminWorkspace.bookingTermsDesc") }],
      },
      {
        // Venue sits ABOVE appointments deliberately: the appointments group
        // asks about hours and notice periods, and every one of those answers
        // is meaningless until the workspace has said what time it is.
        id: "venue",
        label: t("dashboard.adminWorkspace.venue.label"),
        desc: t("dashboard.adminWorkspace.venue.desc"),
        visible: !!tenantSlug,
        rows: [],
        extra: tenantSlug ? <VenueSettingsCard tenantSlug={tenantSlug} /> : null,
        extraSearch: [
          {
            title: t("dashboard.adminWorkspace.venue.label"),
            desc: t("dashboard.adminWorkspace.venue.desc"),
          },
          {
            title: t("dashboard.adminWorkspace.venue.timezoneLabel"),
            desc: t("dashboard.adminWorkspace.venue.timezoneHint"),
          },
        ],
      },
      {
        // Industry and words — the control for the sixteen presets. It sits
        // ABOVE appointments because the preset supplies the nouns that screen
        // then uses, including the terminology it reads.
        id: "industry",
        label: t("dashboard.adminWorkspace.industry.label"),
        desc: t("dashboard.adminWorkspace.industry.desc"),
        visible: !!tenantSlug,
        rows: [],
        extra: tenantSlug ? <IndustrySettingsCard /> : null,
        extraSearch: [
          {
            title: t("dashboard.adminWorkspace.industry.label"),
            desc: t("dashboard.adminWorkspace.industry.desc"),
          },
        ],
      },
      {
        id: "appointments",
        label: t("dashboard.adminWorkspace.appointments.label"),
        desc: t("dashboard.adminWorkspace.appointments.desc"),
        visible: !!tenantSlug,
        rows: [],
        extra: tenantSlug ? (
          <>
            <AppointmentsSettingsCard tenantSlug={tenantSlug} />
            <BookingHoursCard
              talentProfileId={bridgeTalentSelfProfile?.id ?? null}
              showTalentPicker
            />
            {state.workspaceType === "business" ? <StaffResourcesCard /> : null}
          </>
        ) : null,
        extraSearch: [
          { title: t("dashboard.adminWorkspace.appointments.label"), desc: t("dashboard.adminWorkspace.appointments.desc") },
          { title: t("dashboard.adminWorkspace.appointments.hoursTitle"), desc: t("dashboard.adminWorkspace.appointments.hoursDesc") },
          { title: t("dashboard.adminWorkspace.appointments.staffTitle"), desc: t("dashboard.adminWorkspace.appointments.staffDesc") },
        ],
      },
      {
        id: "pricing-defaults",
        label: t("dashboard.adminWorkspace.pricingDefaultsLabel"),
        desc: t("dashboard.adminWorkspace.pricingDefaultsDesc"),
        visible: !!tenantSlug,
        rows: [],
        // Only the tenant-wide FALLBACK lives here — it is a policy you set
        // once. Editing 50 individual people is roster work, so the per-talent
        // rate table moved to Roster → Rates; this group points at it rather
        // than duplicating it (two homes for one job is how features drift).
        extra: tenantSlug ? <PricingDefaultsSettingsCard /> : null,
        extraSearch: [
          {
            title: t("dashboard.adminWorkspace.pricingDefaultsLabel"),
            desc: t("dashboard.adminWorkspace.pricingDefaultsSearchDesc"),
          },
          {
            title: t("dashboard.adminWorkspace.pricingDefaultsSearchAltTitle"),
            desc: t("dashboard.adminWorkspace.pricingDefaultsSearchAltDesc"),
          },
          {
            title: t("dashboard.adminWorkspace.rosterRatesTitle"),
            desc: t("dashboard.adminWorkspace.pricingDefaultsPerTalentPointer"),
          },
        ],
      },
      {
        id: "domain",
        label: t("dashboard.adminWorkspace.domainLabel"),
        desc: t("dashboard.adminWorkspace.domainDesc"),
        visible: true,
        rows: [
          meetsPlan(state.plan, "studio")
            ? {
                key: "custom-domain",
                title: t("dashboard.adminWorkspace.customDomain"),
                desc: t("dashboard.adminWorkspace.noCustomDomain"),
              }
            : {
                key: "custom-domain-locked",
                title: t("dashboard.adminWorkspace.customDomain"),
                desc: t("dashboard.adminWorkspace.requiresStudio"),
                opacity: 0.55,
                onClick: () => openUpgrade({ feature: t("dashboard.adminWorkspace.customDomain"), why: t("dashboard.adminWorkspace.domainDesc"), requiredPlan: "studio" }),
                right: <LockedPill plan="studio" />,
              },
        ],
      },
      {
        id: "branding",
        label: t("dashboard.adminWorkspace.brandingMediaLabel"),
        desc: t("dashboard.adminWorkspace.brandingMediaDesc"),
        visible: true,
        rows: [
          isAdmin && meetsPlan(state.plan, "agency")
            ? {
                key: "brand-identity",
                title: t("dashboard.adminWorkspace.brandIdentity"),
                desc: t("dashboard.adminWorkspace.brandIdentityMeta"),
                onClick: () => openDrawer("branding"),
                right: <Affordance label={t("dashboard.adminWorkspace.affordanceEdit")} />,
              }
            : {
                key: "brand-identity-locked",
                title: t("dashboard.adminWorkspace.brandIdentity"),
                desc: t("dashboard.adminWorkspace.requiresAgency"),
                opacity: 0.55,
                onClick: () => openUpgrade({ feature: t("dashboard.adminWorkspace.brandingLabel"), why: t("dashboard.adminWorkspace.brandingUpgradeWhy"), requiredPlan: "agency", unlocks: [t("dashboard.adminWorkspace.brandingUnlock1"), t("dashboard.adminWorkspace.brandingUnlock2"), t("dashboard.adminWorkspace.brandingUnlock3")] }),
                right: <LockedPill plan="agency" />,
              },
          meetsPlan(state.plan, "studio")
            ? {
                key: "logo-watermark",
                title: t("dashboard.adminWorkspace.logoWatermark"),
                desc: t("dashboard.adminWorkspace.logoWatermarkMeta"),
                onClick: () => openDrawer("branding"),
                right: <Affordance label={t("dashboard.adminWorkspace.affordanceConfigure")} />,
              }
            : {
                key: "logo-watermark-locked",
                title: t("dashboard.adminWorkspace.logoWatermark"),
                desc: t("dashboard.adminWorkspace.requiresStudio"),
                opacity: 0.55,
                onClick: () => openUpgrade({
                  feature: t("dashboard.adminWorkspace.logoWatermark"),
                  why: t("dashboard.adminWorkspace.watermarkUpgradeWhy"),
                  requiredPlan: "studio",
                  unlocks: [t("dashboard.adminWorkspace.watermarkUnlock1"), t("dashboard.adminWorkspace.watermarkUnlock2"), t("dashboard.adminWorkspace.watermarkUnlock3")],
                }),
                right: <LockedPill plan="studio" />,
              },
          meetsPlan(state.plan, "agency")
            ? {
                key: "media-gallery",
                title: t("dashboard.adminWorkspace.mediaGallery"),
                desc: t("dashboard.adminWorkspace.mediaGalleryMeta"),
                onClick: () => setPage("media"),
                right: <Affordance label={t("dashboard.adminWorkspace.affordanceOpen")} />,
              }
            : {
                key: "media-gallery-locked",
                title: t("dashboard.adminWorkspace.mediaGallery"),
                desc: t("dashboard.adminWorkspace.requiresAgency"),
                opacity: 0.55,
                onClick: () => openUpgrade({
                  feature: t("dashboard.adminWorkspace.brandedMediaGallery"),
                  why: t("dashboard.adminWorkspace.mediaGalleryUpgradeWhy"),
                  requiredPlan: "agency",
                  unlocks: [t("dashboard.adminWorkspace.mediaGalleryUnlock1"), t("dashboard.adminWorkspace.mediaGalleryUnlock2"), t("dashboard.adminWorkspace.mediaGalleryUnlock3")],
                }),
                right: <LockedPill plan="agency" />,
              },
          {
            key: "brand-assets",
            title: t("dashboard.adminWorkspace.brandAssets"),
            desc: t("dashboard.adminWorkspace.brandAssetsDesc"),
            // The Brand images library lives in the Branding drawer — this row
            // used to open the light-20 "Coming soon" stub.
            onClick: () => openDrawer("branding"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceManage")} />,
          },
        ],
      },
      {
        id: "team",
        label: t("dashboard.adminWorkspace.teamLabel"),
        desc: t("dashboard.adminWorkspace.teamDesc"),
        visible: true,
        rows: [
          isAdmin && !isFree
            ? {
                key: "team-members",
                title: t("dashboard.adminWorkspace.teamMembers"),
                desc: interpolate(t("dashboard.adminWorkspace.teamMembersMeta"), { count: effectiveTeamMembers.length }),
                onClick: () => openDrawer("team"),
                right: <Affordance label={t("dashboard.adminWorkspace.affordanceManage")} />,
              }
            : {
                key: "team-members-locked",
                title: t("dashboard.adminWorkspace.teamMembers"),
                desc: t("dashboard.adminWorkspace.requiresAgency"),
                opacity: 0.55,
                onClick: () => openUpgrade({ feature: t("dashboard.adminWorkspace.teamRolesFeature"), why: t("dashboard.adminWorkspace.teamUpgradeWhy"), requiredPlan: "agency", unlocks: [t("dashboard.adminWorkspace.teamUnlock1"), t("dashboard.adminWorkspace.teamUnlock2")] }),
                right: <LockedPill plan="agency" />,
              },
        ],
      },
      {
        id: "roster-fields",
        label: t("dashboard.adminWorkspace.rosterFieldsLabel"),
        desc: t("dashboard.adminWorkspace.rosterFieldsDesc"),
        visible: true,
        rows: [
          {
            key: "talent-categories",
            title: t("dashboard.adminWorkspace.categoriesOnSite"),
            desc: interpolate(t("dashboard.adminWorkspace.categoriesOnSiteMeta"), { workspace: effectiveTenant.name }),
            onClick: () => openDrawer("talent-types"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceManage")} />,
          },
          {
            key: "field-catalog",
            title: t("dashboard.adminWorkspace.fieldCatalog"),
            desc: t("dashboard.adminWorkspace.fieldCatalogMeta"),
            onClick: () => openDrawer("field-catalog"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceOpen")} />,
          },
          {
            key: "field-privacy",
            title: t("dashboard.adminWorkspace.fieldPrivacy"),
            desc: t("dashboard.adminWorkspace.fieldPrivacyMeta"),
            onClick: () => openDrawer("field-privacy"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceConfigure")} />,
          },
          {
            key: "trust-verification",
            title: t("dashboard.adminWorkspace.trustVerification"),
            desc: t("dashboard.adminWorkspace.trustVerificationMeta"),
            onClick: () => openDrawer("trust-verification-queue"),
            custom: (
              <>
                <div className="flex items-center gap-2 flex-1">
                  <div>
                    <div className="text-[13px] font-semibold text-admin-ink">{t("dashboard.adminWorkspace.trustVerification")}</div>
                    <div className="text-[12px] mt-0.5 text-admin-ink-muted">{t("dashboard.adminWorkspace.trustVerificationMeta")}</div>
                  </div>
                  {pendingTrustCount > 0 && (
                    <span
                      style={{ "--pill-bg": COLORS.indigo } as CSSProperties}
                      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 py-0 rounded-full bg-[var(--pill-bg)] text-white text-[10.5px] font-bold leading-none"
                    >{pendingTrustCount}</span>
                  )}
                </div>
                <Affordance label={pendingTrustCount > 0 ? t("dashboard.adminWorkspace.affordanceReview") : t("dashboard.adminWorkspace.affordanceOpen")} />
              </>
            ),
          },
          {
            key: "disputed-claims",
            title: t("dashboard.adminWorkspace.disputedClaims"),
            desc: t("dashboard.adminWorkspace.disputedClaimsMeta"),
            onClick: () => openDrawer("trust-disputed-claims"),
            custom: (
              <>
                <div className="flex items-center gap-2 flex-1">
                  <div>
                    <div className="text-[13px] font-semibold text-admin-ink">{t("dashboard.adminWorkspace.disputedClaims")}</div>
                    <div className="text-[12px] mt-0.5 text-admin-ink-muted">{t("dashboard.adminWorkspace.disputedClaimsMeta")}</div>
                  </div>
                  {disputedClaimsCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 py-0 rounded-full text-white text-[10.5px] font-bold leading-none bg-admin-red">{disputedClaimsCount}</span>
                  )}
                </div>
                <Affordance label={disputedClaimsCount > 0 ? t("dashboard.adminWorkspace.affordanceResolve") : t("dashboard.adminWorkspace.affordanceOpen")} />
              </>
            ),
          },
          {
            key: "pending-approvals",
            title: t("dashboard.adminWorkspace.pendingApprovals"),
            desc: pendingTalent.length === 0
              ? t("dashboard.adminWorkspace.pendingApprovalsEmpty")
              : t("dashboard.adminWorkspace.pendingApprovalsWaiting"),
            onClick: () => openDrawer("talent-approvals"),
            custom: (
              <>
                <div className="flex items-center gap-2">
                  <div>
                    <div className="text-[13px] font-semibold text-admin-ink">{t("dashboard.adminWorkspace.pendingApprovals")}</div>
                    <div className="text-[12px] mt-0.5 text-admin-ink-muted">
                      {pendingTalent.length === 0
                        ? t("dashboard.adminWorkspace.pendingApprovalsEmpty")
                        : t("dashboard.adminWorkspace.pendingApprovalsWaiting")}
                    </div>
                  </div>
                  {pendingTalent.length > 0 && (
                    <span
                      style={{ "--pill-bg": COLORS.amber } as CSSProperties}
                      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 py-0 rounded-full bg-[var(--pill-bg)] text-white text-[10.5px] font-bold"
                    >{pendingTalent.length}</span>
                  )}
                </div>
                <Affordance label={pendingTalent.length === 0 ? t("dashboard.adminWorkspace.affordanceOpenQueue") : t("dashboard.adminWorkspace.affordanceReview")} />
              </>
            ),
          },
        ],
      },
      {
        id: "registration",
        label: t("dashboard.adminWorkspace.registrationLabel"),
        desc: t("dashboard.adminWorkspace.registrationDesc"),
        visible: true,
        rows: [],
        extra: <RegistrationSection />,
        extraSearch: [{ title: t("dashboard.adminWorkspace.registrationLabel"), desc: t("dashboard.adminWorkspace.registrationDesc") }],
      },
      {
        id: "discover",
        label: t("dashboard.adminWorkspace.discoverLabel"),
        desc: t("dashboard.adminWorkspace.discoverDesc"),
        visible: true,
        rows: [
          {
            key: "discover-talents",
            title: t("dashboard.adminWorkspace.discoverTalentsTitle"),
            desc: t("dashboard.adminWorkspace.discoverTalentsDesc"),
          },
          {
            key: "discover-analytics",
            title: t("dashboard.adminWorkspace.discoverAnalyticsTitle"),
            desc: t("dashboard.adminWorkspace.discoverAnalyticsDesc"),
            right: state.plan === "free" ? <LockedPill plan="studio" /> : undefined,
          },
          {
            key: "discover-boost",
            title: t("dashboard.adminWorkspace.discoverBoostTitle"),
            desc: t("dashboard.adminWorkspace.discoverBoostDesc"),
            right: (state.plan === "free" || state.plan === "studio") ? <LockedPill plan="agency" /> : undefined,
          },
          {
            key: "discover-rollup",
            title: t("dashboard.adminWorkspace.discoverRollupTitle"),
            desc: t("dashboard.adminWorkspace.discoverRollupDesc"),
            right: state.plan !== "network" ? <LockedPill plan="network" /> : undefined,
          },
        ],
        extra: (
          <>
            <div className="pt-2.5 px-3.5 pb-3 text-[11.5px] italic leading-[1.5] text-admin-ink-muted">
              {t("dashboard.adminWorkspace.discoverFootnote")}
            </div>
            <div className="px-[14px] pb-3">
              <DiscoverExposureSection />
            </div>
          </>
        ),
        extraSearch: [
          { title: t("dashboard.adminDiscoverSettings.exposureTitle"), desc: t("dashboard.adminDiscoverSettings.exposurePlatformLabel") },
        ],
      },
      {
        id: "compliance",
        label: t("dashboard.adminWorkspace.complianceLabel"),
        desc: t("dashboard.adminWorkspace.complianceDesc"),
        visible: true,
        rows: [
          {
            key: "gdpr-export",
            title: t("dashboard.adminWorkspace.exportData"),
            desc: t("dashboard.adminWorkspace.exportDataDesc"),
            onClick: () => openDrawer("gdpr-export"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceExport")} />,
          },
          {
            key: "consent-log",
            title: t("dashboard.adminWorkspace.consentLog"),
            desc: t("dashboard.adminWorkspace.consentLogDesc"),
            onClick: () => openDrawer("consent-log"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceView")} />,
          },
          {
            key: "contract-templates",
            title: t("dashboard.adminWorkspace.contractTemplates"),
            desc: t("dashboard.adminWorkspace.contractTemplatesDesc"),
            onClick: () => openDrawer("contract-templates"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceManage")} />,
          },
          {
            key: "audit-log",
            title: t("dashboard.adminWorkspace.auditLog"),
            desc: t("dashboard.adminWorkspace.auditLogDesc"),
            onClick: () => openDrawer("audit-log"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceView")} />,
          },
        ],
      },
      {
        id: "integrations",
        label: t("dashboard.adminWorkspace.integrationsLabel"),
        desc: t("dashboard.adminWorkspace.integrationsDesc"),
        visible: true,
        extraPosition: "before",
        extra: <IntegrationsSection />,
        extraSearch: [{ title: t("dashboard.adminWorkspace.integrationsLabel"), desc: t("dashboard.adminWorkspace.integrationsDesc") }],
        rows: [
          {
            key: "calendar-sync",
            title: t("dashboard.adminWorkspace.calendarSync"),
            desc: t("dashboard.adminWorkspace.calendarSyncDesc"),
            onClick: () => openDrawer("calendar-sync"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceManage")} />,
          },
          {
            key: "referral-dashboard",
            title: t("dashboard.adminWorkspace.referralProgram"),
            desc: t("dashboard.adminWorkspace.referralProgramDesc"),
            onClick: () => openDrawer("referral-dashboard"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceView")} />,
          },
          {
            key: "system-status",
            title: t("dashboard.adminWorkspace.systemStatus"),
            desc: t("dashboard.adminWorkspace.systemStatusDesc"),
            onClick: () => openDrawer("system-status"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceView")} />,
          },
        ],
      },
      {
        id: "email",
        label: t("dashboard.adminWorkspace.emailLabel"),
        desc: t("dashboard.adminWorkspace.emailDesc"),
        visible: true,
        rows: [
          {
            key: "email-templates",
            title: t("dashboard.adminWorkspace.emailTemplates"),
            desc: t("dashboard.adminWorkspace.emailTemplatesDesc"),
            onClick: () => openDrawer("email-templates"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceManage")} />,
          },
          {
            key: "email-branding",
            title: t("dashboard.adminWorkspace.emailBranding"),
            desc: t("dashboard.adminWorkspace.emailBrandingDesc"),
            onClick: () => openDrawer("email-branding"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceCustomize")} />,
          },
          {
            key: "email-sequences",
            title: t("dashboard.adminWorkspace.emailSequences"),
            desc: t("dashboard.adminWorkspace.emailSequencesDesc"),
            onClick: () => openDrawer("email-sequences"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceManage")} />,
          },
          {
            key: "notification-prefs",
            title: t("dashboard.adminWorkspace.notificationPrefs"),
            desc: t("dashboard.adminWorkspace.notificationPrefsDesc"),
            onClick: () => openDrawer("notification-prefs"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceConfigure")} />,
          },
        ],
        extra: <AutoAckSettingsRow />,
        extraSearch: [{ title: t("dashboard.adminWorkspace.autoAckTitle"), desc: t("dashboard.adminWorkspace.autoAckDesc") }],
      },
      {
        id: "advanced",
        label: t("dashboard.adminWorkspace.advancedLabel"),
        desc: t("dashboard.adminWorkspace.advancedDesc"),
        visible: true,
        rows: [
          ...(isAdmin
            ? [{
                key: "feature-controls",
                title: t("dashboard.adminWorkspace.allFeatureToggles"),
                desc: t("dashboard.adminWorkspace.allFeatureTogglesDesc"),
                onClick: () => openDrawer("feature-controls"),
                right: <Affordance label={t("dashboard.adminWorkspace.affordanceConfigure")} />,
              }]
            : []),
          {
            key: "import-talent",
            title: t("dashboard.adminWorkspace.importTalent"),
            desc: t("dashboard.adminWorkspace.importTalentDesc"),
            onClick: () => openDrawer("csv-import", { type: "talent" }),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceImport")} />,
          },
          {
            key: "migration-assistant",
            title: t("dashboard.adminWorkspace.migrationAssistant"),
            desc: t("dashboard.adminWorkspace.migrationAssistantDesc"),
            onClick: () => openDrawer("migration-assistant"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceMigrate")} />,
          },
          {
            key: "beta-program",
            title: t("dashboard.adminWorkspace.betaProgram"),
            desc: t("dashboard.adminWorkspace.betaProgramDesc"),
            onClick: () => openDrawer("beta-program"),
            right: <Affordance label={t("dashboard.adminWorkspace.affordanceManage")} />,
          },
          ...(isAdmin
            ? [{
                key: "activity-log",
                title: t("dashboard.adminWorkspace.activityLog"),
                desc: t("dashboard.adminWorkspace.activityLogDesc"),
                onClick: () => router.push(`${adminBasePath}/activity-log`),
                right: <Affordance label={t("dashboard.adminWorkspace.affordanceOpen")} />,
              }]
            : []),
          ...(isOwner
            ? [{
                key: "danger-zone",
                title: t("dashboard.adminWorkspace.deleteTransferWorkspace"),
                desc: t("dashboard.adminWorkspace.deleteTransferWorkspaceDesc"),
                titleColor: "#DC2626",
                borderColor: "#FCA5A5",
                onClick: () => openDrawer("danger-zone"),
                right: <Affordance label={t("dashboard.adminWorkspace.affordanceOpen")} />,
              }]
            : []),
        ],
      },
    ];
    return list;
  }, [
    t, state.plan, state.role, state.workspaceType, planLabel, planTheme, isOwner, isAdmin, isFree, effectiveTenant.name, tenantSlug, adminBasePath, router,
    bridgeTalentSelfProfile, effectiveTeamMembers.length, pendingTrustCount, disputedClaimsCount,
    pendingTalent.length, openDrawer, openUpgrade, setPage,
  ]);

  const visibleGroups = useMemo(() => groups.filter((g) => g.visible), [groups]);

  // ── Search index — flattens every visible row (+ bespoke section) across
  //    every group so the search box can match by label/description. ──────
  type SearchHit = { groupId: GroupId; groupLabel: string; title: string; desc: string; onClick?: () => void };
  const searchIndex: SearchHit[] = useMemo(() => visibleGroups.flatMap((g) => [
    ...g.rows.map((r) => ({ groupId: g.id, groupLabel: g.label, title: r.title, desc: r.desc, onClick: r.onClick })),
    ...(g.extraSearch ?? []).map((e) => ({ groupId: g.id, groupLabel: g.label, title: e.title, desc: e.desc, onClick: undefined })),
  ]), [visibleGroups]);

  const trimmedQuery = query.trim().toLowerCase();
  const matches = useMemo(
    () => (trimmedQuery ? searchIndex.filter((h) => `${h.title} ${h.desc}`.toLowerCase().includes(trimmedQuery)) : []),
    [searchIndex, trimmedQuery],
  );

  const activeGroupData = visibleGroups.find((g) => g.id === activeGroup) ?? visibleGroups[0];

  const searchInput = (
    <div className="relative mb-2.5">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
        <circle cx="11" cy="11" r="7" stroke={COLORS.inkMuted} strokeWidth="1.8" />
        <path d="m20 20-3.5-3.5" stroke={COLORS.inkMuted} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("dashboard.adminWorkspace.searchPlaceholder")}
        style={{
          "--r": RADIUS.md,
          "--bc": COLORS.border,
          "--ff": FONTS.body,
          "--fg": COLORS.ink,
        } as CSSProperties}
        className="w-full pt-[9px] pr-3 pb-[9px] pl-8 rounded-[var(--r)] border border-solid border-[var(--bc)] bg-white font-[var(--ff)] text-[13px] text-[var(--fg)] outline-none"
      />
    </div>
  );

  return (
    <>
      <PageHeader
        title={t("dashboard.adminWorkspace.title")}
        subtitle={t("dashboard.adminWorkspace.subtitle")}
        actions={<AutoSaveIndicator savedAt={savedAt} />}
      />

      {tenantSlug && (
        <CreateMyTalentProfileDialog
          open={createTalentDialogOpenSettings}
          onOpenChange={setCreateTalentDialogOpenSettings}
          tenantSlug={tenantSlug}
        />
      )}

      <div className="flex gap-6 items-start max-w-[980px]">
        {/* Left nav — flat list, one click per group. Collapses to a native
            <select> on phone (reuses useViewport, the same hook DrawerShell
            and the bottom-nav already use for responsive breakpoints). */}
        <div className={`shrink-0 top-4 ${isPhone ? "w-full static" : "w-60 sticky"}`}>
          {searchInput}
          {isPhone ? (
            <select
              value={activeGroup}
              onChange={(e) => { setActiveGroup(e.target.value as GroupId); setQuery(""); }}
              aria-label={t("dashboard.adminWorkspace.jumpToSection")}
              style={{
                "--r": RADIUS.md,
                "--bc": COLORS.border,
                "--ff": FONTS.body,
                "--fg": COLORS.ink,
              } as CSSProperties}
              className="w-full py-2.5 px-3 rounded-[var(--r)] border border-solid border-[var(--bc)] bg-white font-[var(--ff)] text-[13.5px] font-semibold text-[var(--fg)]"
            >
              {visibleGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.label}</option>
              ))}
            </select>
          ) : (
            <div data-tulala-settings-nav className="flex flex-col gap-0.5">
              {visibleGroups.map((g) => (
                <NavItem key={g.id} group={g} active={!trimmedQuery && activeGroup === g.id} onClick={() => { setActiveGroup(g.id); setQuery(""); }} />
              ))}
            </div>
          )}
        </div>

        {/* Content pane */}
        <div className="flex-1 min-w-0">
          {trimmedQuery ? (
            matches.length === 0 ? (
              <div style={{ "--ff": FONTS.body } as CSSProperties} className="font-[var(--ff)] py-6 px-1 text-[13px] text-admin-ink-muted">
                {t("dashboard.adminWorkspace.noSearchResults")}
              </div>
            ) : (
              <div>
                {matches.map((hit, i) => (
                  <SettingsRow
                    key={`${hit.groupId}-${i}`}
                    onClick={hit.onClick ?? (() => { setActiveGroup(hit.groupId); setQuery(""); })}
                  >
                    <div>
                      <div className="text-[10.5px] font-semibold uppercase tracking-[0.3px] mb-[3px] text-admin-ink-muted">
                        {hit.groupLabel}
                      </div>
                      <div className="text-[13px] font-semibold text-admin-ink">{hit.title}</div>
                      {hit.desc && <div className="text-[12px] mt-0.5 text-admin-ink-muted">{hit.desc}</div>}
                    </div>
                    <Affordance label={t("dashboard.adminWorkspace.affordanceOpen")} />
                  </SettingsRow>
                ))}
              </div>
            )
          ) : (
            activeGroupData && (
              <div data-settings-section={activeGroupData.id}>
                <div className="mb-3">
                  <div style={{ "--ff": FONTS.display } as CSSProperties} className="font-[var(--ff)] text-[17px] font-bold tracking-[-0.2px] text-admin-ink">
                    {activeGroupData.label}
                  </div>
                  <div className="text-[12.5px] mt-0.5 text-admin-ink-muted">{activeGroupData.desc}</div>
                </div>
                {activeGroupData.extraPosition === "before" && activeGroupData.extra}
                {activeGroupData.rows.map(renderSimpleRow)}
                {activeGroupData.extraPosition !== "before" && activeGroupData.extra}
              </div>
            )
          )}

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
        </div>
      </div>
    </>
  );
}
