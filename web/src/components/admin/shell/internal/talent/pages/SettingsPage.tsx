"use client";

import type { ReactNode } from "react";
import { SettingsSectionIcon } from "@/components/admin/settings/settings-section-icons";
import { CommercialBookingTermsCard } from "@/app/(workspace)/[tenantSlug]/talent/settings/CommercialBookingTermsCard";
import { DefaultCurrencyCard } from "@/app/(workspace)/[tenantSlug]/talent/settings/DefaultCurrencyCard";
import { PreferredLanguageCard } from "@/app/(workspace)/[tenantSlug]/talent/settings/PreferredLanguageCard";
import { ProfileVisibilityCard } from "@/app/(workspace)/[tenantSlug]/talent/settings/ProfileVisibilityCard";
import { TalentPlanCard } from "@/app/(workspace)/[tenantSlug]/talent/settings/TalentPlanCard";
import { usePresenceText } from "@/components/talent/studio/presence-i18n";
import { useDashboardText } from "../../dashboard-i18n";
import { PasskeysCard } from "../../modern-features";
import { Divider, SecondaryCard, StatDot } from "../../primitives";
import { MY_AGENCIES, MY_TALENT_PROFILE, useAdminShell } from "../../state";
import { Grid, PageHeader } from "../shared/page-chrome-1";
import { ContactPolicySummary, TalentTrustCard } from "../shared/settings-1";

const HARD_BTN =
  "inline-flex min-h-11 items-center rounded-full border border-admin-border-soft bg-white px-4 text-[13px] font-semibold text-admin-ink";

const HARD_TONE: Record<"ok" | "warn" | "risk", string> = {
  ok: "bg-admin-success-soft text-admin-success-deep",
  warn: "bg-admin-amber-soft text-admin-amber-deep",
  risk: "bg-admin-critical-soft text-admin-critical-deep",
};

/**
 * Talent Settings, grouped by the question a talent is asking: when she
 * works, the money rules, her account, who she works with, and the things
 * that are hard to undo. Hiding a page, leaving an agency and closing the
 * account are three different things in three different places.
 */
export function SettingsPage() {
  const { openDrawer, setTalentPage, bridgeTalentSelfProfile, bridgeTalentAgencies, tenantSlug } = useAdminShell();
  const copy = useDashboardText();
  const { t: tx } = usePresenceText();
  const selfTalentId = bridgeTalentSelfProfile?.id ?? "t1";
  const settingsAgencies = bridgeTalentAgencies !== null
    ? bridgeTalentAgencies.map((a) => ({
        id:          a.id,
        name:        a.agencyName,
        status:      (["exclusive", "non-exclusive"] as const).includes(a.rosterStatus as never)
                       ? (a.rosterStatus as "exclusive" | "non-exclusive")
                       : ("non-exclusive" as const),
        joinedAt:    a.addedAt,
        isPrimary:   a.isPrimary,
      }))
    : MY_AGENCIES;
  // Prefer bridge data so a real tenant never sees a fixture agency name.
  const primaryAgencyName = settingsAgencies.find((a) => a.isPrimary)?.name
    ?? settingsAgencies[0]?.name;
  const openSection = (section: string) => openDrawer("talent-profile-shell", { mode: "edit-self", talentId: selfTalentId, section });

  const hardRows: Array<{ title: string; body: string; tag: string; tone: "ok" | "warn" | "risk"; action: ReactNode }> = [
    {
      title: tx("Hide a public page"),
      body: tx("One page stops being public. Bookings, payments and messages are untouched. Reversible in a tap."),
      tag: tx("In Where I appear"),
      tone: "ok",
      action: (
        <button type="button" className={HARD_BTN} onClick={() => setTalentPage("public-page")}>
          {tx("Open My presence")}
        </button>
      ),
    },
    {
      title: tx("Leave an agency"),
      body: tx("You stop receiving their jobs. Work already agreed is still yours to finish and still gets paid."),
      tag: tx("Ends a relationship"),
      tone: "warn",
      action: (
        <button type="button" className={HARD_BTN} onClick={() => openDrawer("representation")}>
          {tx("Open agencies")}
        </button>
      ),
    },
    {
      title: tx("Close your account"),
      body: tx("Everything goes: pages, clients, history, money records. Not possible while a booking is unfinished or money is owed to you."),
      tag: tx("Cannot be undone"),
      tone: "risk",
      action: (
        <button type="button" className={HARD_BTN} onClick={() => openDrawer("help")}>
          {tx("Ask support")}
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        guideNodeId="talent-notifications"
        title={copy.t("Settings")}
        subtitle={bridgeTalentSelfProfile?.displayName ?? tx("Grouped by the question you are asking")}
      />

      <Divider label={tx("When you work")} />
      <Grid cols="2">
        <SecondaryCard
          title={tx("Working hours and days off")}
          description={tx("Hours, breaks, time between appointments, how far ahead and how late clients can book.")}
          affordance={tx("Open hours")}
          onClick={() => setTalentPage("calendar-availability")}
        />
      </Grid>

      <Divider label={tx("Money rules")} />
      {/* Booking-terms DEFAULTS and currency. Gated on a real bridged
          profile: the mock prototype user has no talent_profiles row. */}
      {bridgeTalentSelfProfile && <CommercialBookingTermsCard talentId={bridgeTalentSelfProfile.id} />}
      {bridgeTalentSelfProfile && <DefaultCurrencyCard />}
      <Grid cols="2">
        <SecondaryCard
          title={tx("Where your money goes")}
          description={copy.t("Connect a Stripe account to receive payouts on confirmed bookings. Set up right inside Tulala.")}
          affordance={copy.t("Set up payouts")}
          onClick={() => setTalentPage("payouts")}
        />
        <SecondaryCard
          title={copy.t("Tax documents")}
          description={copy.t("Year-end summaries, W-8BEN/W-9 on file, off-platform self-declaration.")}
          affordance={copy.t("Open tax docs")}
          onClick={() => openDrawer("talent-tax-docs")}
        />
        {bridgeTalentSelfProfile && (
          <SecondaryCard
            title={copy.t("Services & pricing → moved to your Services tab")}
            description={copy.t("Manage everything clients can book or buy from your page in one place.")}
            affordance={tx("Open Services")}
            onClick={() => setTalentPage("services")}
          />
        )}
      </Grid>

      <Divider label={tx("You and your account")} icon={<SettingsSectionIcon sectionId="account" />} />
      {bridgeTalentSelfProfile && <PreferredLanguageCard />}
      <PasskeysCard
        userName={bridgeTalentSelfProfile?.displayName ?? MY_TALENT_PROFILE.name}
        userId={bridgeTalentSelfProfile?.id ?? "talent-self"}
      />
      <TalentTrustCard onOpenDetail={() => openDrawer("talent-trust-detail")} primaryAgencyName={primaryAgencyName} />
      <Grid cols="2">
        <SecondaryCard
          title={tx("What you are told about")}
          description={copy.t("What email and push you get when an agency sends you a request.")}
          affordance={copy.t("Manage prefs")}
          onClick={() => openDrawer("talent-notifications", { expanded: "settings" })}
        />
        <SecondaryCard
          title={copy.t("Contact preferences")}
          description={copy.t("Choose which client trust tiers can send you inquiries. Selectivity is opt-in; defaults stay open.")}
          meta={<ContactPolicySummary policy={MY_TALENT_PROFILE.contactPolicy} />}
          affordance={copy.t("Manage")}
          onClick={() => openDrawer("talent-contact-preferences")}
        />
        <SecondaryCard
          title={copy.t("Privacy")}
          description={tx("Search-engine indexing, sensitive measurements and document visibility.")}
          affordance={copy.t("Manage")}
          onClick={() => openSection("admin")}
        />
        <SecondaryCard
          title={copy.t("Identity verification")}
          description={copy.t("ID review plus connected-account badges. Social badges only turn on after ownership is verified.")}
          meta={<><StatDot tone="amber" /> {copy.t("Not yet verified")}</>}
          affordance={copy.t("Open verification")}
          onClick={() => openDrawer("talent-connections")}
        />
      </Grid>

      <Divider label={tx("Who you work with")} icon={<SettingsSectionIcon sectionId="agencies" />} />
      <Grid cols="auto">
        {settingsAgencies.map((a) => (
          <SecondaryCard
            key={a.id}
            title={a.name}
            description={`${copy.t(a.status === "exclusive" ? "Exclusive" : "Non-exclusive")} · ${copy.t("joined")} ${a.joinedAt}`}
            meta={
              <>
                <StatDot tone={a.isPrimary ? "green" : "ink"} />
                {copy.t(a.isPrimary ? "Primary" : "Secondary")}
              </>
            }
            affordance={copy.t("Open relationship")}
            onClick={() => openDrawer("representation", { focusAgencyId: a.id })}
          />
        ))}
        <SecondaryCard
          title={copy.t("Add another agency")}
          description={copy.t("Get invited via email. Agencies onboard talent, not the other way around.")}
          affordance={copy.t("Learn more")}
          onClick={() => openDrawer("representation")}
        />
        <SecondaryCard
          title={copy.t("My Circle")}
          description={copy.t("Trusted collaborators you can recommend into bookings in one tap.")}
          affordance={copy.t("Manage →")}
          onClick={() => openDrawer("circle-manage")}
        />
        <SecondaryCard
          title={copy.t("Talent network")}
          description={copy.t("Follow other talents, see who's working where, hand off briefs you can't take.")}
          affordance={copy.t("Open network")}
          onClick={() => openDrawer("talent-network")}
        />
        <SecondaryCard
          title={copy.t("Workspace · multi-agency")}
          description={copy.t("On the Network plan? Switch between agencies you own from one account.")}
          affordance={copy.t("Switch workspace")}
          onClick={() => openDrawer("talent-multi-agency-picker")}
        />
      </Grid>

      <Divider label={copy.t("Personal page")} icon={<SettingsSectionIcon sectionId="personal-page" />} />
      {bridgeTalentSelfProfile ? (
        <TalentPlanCard
          onCompare={() => openDrawer("talent-tier-compare")}
          onUpgrade={() => openDrawer("talent-tier-compare")}
        />
      ) : (
        <SecondaryCard
          title={copy.t("Plan")}
          description={tx("Sign in as a talent to see your live plan and any active trial.")}
          meta={<><StatDot tone="dim" /> {copy.t("Preview")}</>}
          affordance={copy.t("Compare plans")}
          onClick={() => openDrawer("talent-tier-compare")}
        />
      )}

      <Divider label={tx("Things that are hard to undo")} />
      <div className="mb-4 overflow-hidden rounded-2xl border border-admin-critical-soft bg-white font-admin-body">
        <p className="bg-admin-critical-soft px-4 py-3 text-[13px] text-admin-critical-deep">
          {tx("Hiding a page, leaving an agency and closing your account are three different things. Only the last one cannot be undone.")}
        </p>
        <ul className="divide-y divide-admin-border-soft">
          {hardRows.map((r) => (
            <li key={r.title} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 basis-[240px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold text-admin-ink">{r.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${HARD_TONE[r.tone]}`}>{r.tag}</span>
                </div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-admin-ink-muted">{r.body}</p>
              </div>
              {r.action}
            </li>
          ))}
        </ul>
        <p className="border-t border-admin-border-soft px-4 py-3 text-[12px] text-admin-ink-muted">
          {tx("Closing an account is handled by Tulala support for now. There is no self-serve button yet.")}
        </p>
      </div>
      {/* Hide everywhere: the talent's global switch, overriding every listing. */}
      {bridgeTalentSelfProfile && tenantSlug && (
        <ProfileVisibilityCard
          tenantSlug={tenantSlug}
          talentId={bridgeTalentSelfProfile.id}
          initialHidden={bridgeTalentSelfProfile.isPubliclyHidden}
          onOpenRepresentation={() => openDrawer("representation")}
          agencies={(bridgeTalentAgencies ?? []).map((a) => ({
            id: a.id,
            agencyName: a.agencyName,
            agencyVisibility: a.agencyVisibility,
            talentSiteHidden: a.talentSiteHidden,
          }))}
        />
      )}

      <Divider label={copy.t("Help & support")} />
      <Grid cols="2">
        <SecondaryCard
          title={copy.t("Help & support")}
          description={copy.t("Common questions, contracts, payouts, contact our team.")}
          affordance={copy.t("Get help")}
          onClick={() => openDrawer("help")}
        />
      </Grid>
    </>
  );
}
