"use client";

import { SettingsSectionIcon } from "@/components/admin/settings/settings-section-icons";
import { CommercialBookingTermsCard } from "@/app/(workspace)/[tenantSlug]/talent/settings/CommercialBookingTermsCard";
import { DefaultCurrencyCard } from "@/app/(workspace)/[tenantSlug]/talent/settings/DefaultCurrencyCard";
import { PreferredLanguageCard } from "@/app/(workspace)/[tenantSlug]/talent/settings/PreferredLanguageCard";
import { ProfileVisibilityCard } from "@/app/(workspace)/[tenantSlug]/talent/settings/ProfileVisibilityCard";
import { TalentPlanCard } from "@/app/(workspace)/[tenantSlug]/talent/settings/TalentPlanCard";
import { useDashboardText } from "../../dashboard-i18n";
import { PasskeysCard } from "../../modern-features";
import { Divider, Icon, SecondaryButton, SecondaryCard, StatDot } from "../../primitives";
import { COLORS, FONTS, MY_AGENCIES, MY_TALENT_PROFILE, useAdminShell } from "../../state";
import { Grid, PageHeader } from "../shared/page-chrome-1";
import { ContactPolicySummary, TalentTrustCard } from "../shared/settings-1";



export function SettingsPage() {
  const { openDrawer, setTalentPage, bridgeTalentSelfProfile, bridgeTalentAgencies, tenantSlug } = useAdminShell();
  const copy = useDashboardText();
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
        bookingsYTD: 0,
      }))
    : MY_AGENCIES;
  // Derive primary agency name for trust card — prefer bridge data so
  // a real tenant never sees "Atelier Roma" (task 0.7).
  const primaryAgencyName = settingsAgencies.find((a) => a.isPrimary)?.name
    ?? settingsAgencies[0]?.name;
  // Settings privacy → admin section of profile shell. Same funnel
  // as MyProfilePage / ProfileHero / TalentTodayPage.
  const openSection = (section: string) => openDrawer("talent-profile-shell", { mode: "edit-self", talentId: selfTalentId, section });

  return (
    <>
      <PageHeader
        title={copy.t("Settings")}
        subtitle={copy.t("Agencies, notifications, privacy and payouts. Where you appear lives in Reach.")}
        actions={
          <SecondaryButton onClick={() => setTalentPage("reach")}>
            {copy.t("Open Reach →")}
          </SecondaryButton>
        }
      />

      {/* Profile visibility — the talent's own global show/hide switch.
          Overrides every agency's directory listing. Live only when we have
          a real bridged profile (mock prototype mode has no DB row). */}
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

      {/* L49 — Default currency picker. Gated on a real bridged profile
          for the same reason as ProfileVisibility — the prototype's mock
          user has no `talent_profiles` row, so the talent-self guard
          would fail. */}
      {bridgeTalentSelfProfile && (
        <DefaultCurrencyCard />
      )}

      {/* WS2 / R1 — Preferred language. Overrides the agency default for the
          talent's own dashboard + the default language of their public page,
          constrained to the agency's supported set. Same bridged-profile gate
          as DefaultCurrencyCard (the mock prototype user has no talent_profiles
          row, so the self-scoped load/save would fail). */}
      {bridgeTalentSelfProfile && (
        <PreferredLanguageCard />
      )}

      {/* Commercial booking terms — talent's preferred deposit / refund /
          instant-book / fixed-rate DEFAULTS. Gated on a real bridged profile
          (same idiom as DefaultCurrencyCard — the mock prototype user has no
          talent_profiles row, so the focused load/save actions would fail).
          Configuration only: the binding per-offer terms are set in the
          booking flow, not here. */}
      {bridgeTalentSelfProfile && (
        <CommercialBookingTermsCard talentId={bridgeTalentSelfProfile.id} />
      )}

      {/* Services moved to their own top-level tab (/talent/services) — the
          single door to pricing. Settings keeps only booking PREFERENCES. */}
      {bridgeTalentSelfProfile && (
        <button
          type="button"
          onClick={() => setTalentPage("services")}
          style={{ display: "block", width: "100%", textAlign: "left", padding: "14px 16px", borderRadius: 12, background: "#fff", border: "1px solid rgba(24,24,27,0.08)", cursor: "pointer", fontFamily: '"Inter", system-ui, sans-serif', marginBottom: 16 }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0B0B0D" }}>{copy.t("Services & pricing → moved to your Services tab")}</div>
          <div style={{ fontSize: 11.5, color: "rgba(11,11,13,0.62)", marginTop: 2 }}>{copy.t("Manage everything clients can book or buy from your page in one place.")}</div>
        </button>
      )}

      {/* Trust & Verification — talent's view of their own trust state */}
      <TalentTrustCard onOpenDetail={() => openDrawer("talent-trust-detail")} primaryAgencyName={primaryAgencyName} />

      {/* Account security — passkey-based sign-in (WebAuthn). Real
          navigator.credentials API; in this prototype the credential ID
          round-trips localStorage instead of a server. */}
      <PasskeysCard
        userName={bridgeTalentSelfProfile?.displayName ?? MY_TALENT_PROFILE.name}
        userId={bridgeTalentSelfProfile?.id ?? "talent-self"}
      />

      {/* A4 cross-link banner — Reach owns distribution decisions; Privacy
          here is just the locked / sensitive bits. */}
      <button
        type="button"
        onClick={() => setTalentPage("reach")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          padding: "12px 14px",
          marginBottom: 16,
          background: COLORS.indigoSoft,
          border: `1px solid rgba(91,107,160,0.18)`,
          borderRadius: 10,
          cursor: "pointer",
          fontFamily: FONTS.body,
          textAlign: "left",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: "rgba(91,107,160,0.18)",
            color: COLORS.indigoDeep,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="globe" size={13} stroke={1.7} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-admin-indigo-deep text-admin-12h font-semibold">
            {copy.t("Distribution decisions live in Reach")}
          </div>
          <div style={{ fontSize: 11.5, opacity: 0.78, marginTop: 1 }} className="text-admin-indigo-deep">
            {copy.t("Toggle channels, manage which hubs and studios you're listed on, set exposure presets. All over there.")}
          </div>
        </div>
        <span className="text-admin-indigo-deep text-admin-11h font-semibold">
          {copy.t("Open Reach →")}
        </span>
      </button>

      <Divider label={copy.t("My Circle")} icon={<SettingsSectionIcon sectionId="circle" />} />
      <button
        type="button"
        onClick={() => openDrawer("circle-manage")}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          width: "100%", padding: "14px 16px", marginBottom: 16,
          background: COLORS.royalSoft, border: `1px solid rgba(95,75,139,0.18)`,
          borderRadius: 10, cursor: "pointer", fontFamily: FONTS.body, textAlign: "left",
        }}
      >
        <span aria-hidden style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(95,75,139,0.18)", color: COLORS.royal, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="team" size={14} stroke={1.7} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-admin-royal-deep text-admin-13 font-semibold">{copy.t("My Circle")}</div>
          <div style={{ fontSize: 11.5, opacity: 0.78, marginTop: 2 }} className="text-admin-royal">
            {copy.t("Trusted collaborators you can recommend into bookings in one tap.")}
          </div>
        </div>
        <span className="text-admin-royal-deep text-admin-11h font-semibold">{copy.t("Manage →")}</span>
      </button>

      <Divider label={copy.t("Agencies")} icon={<SettingsSectionIcon sectionId="agencies" />} />
      <Grid cols="auto">
        {settingsAgencies.map((a) => (
          <SecondaryCard
            key={a.id}
            title={a.name}
            description={`${copy.t(a.status === "exclusive" ? "Exclusive" : "Non-exclusive")} · ${copy.t("joined")} ${a.joinedAt}`}
            meta={
              <>
                <StatDot tone={a.isPrimary ? "green" : "ink"} />
                {copy.t(a.isPrimary ? "Primary" : "Secondary")} · {a.bookingsYTD} {copy.t("bookings")}
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
      </Grid>

      {/* Personal page — LIVE plan / free-trial block (replaces the old Demo
          card). Trials are granted from the platform-admin dashboard and sync
          here automatically via the shared trial engine. Gated on a real
          bridged profile (the mock prototype has no talent_profiles row, so the
          self-scoped summary loader would fail) — same idiom as the cards above. */}
      <Divider label={copy.t("Personal page")} icon={<SettingsSectionIcon sectionId="personal-page" />} />
      {bridgeTalentSelfProfile ? (
        <TalentPlanCard
          onCompare={() => openDrawer("talent-tier-compare")}
          onUpgrade={() => openDrawer("talent-tier-compare")}
        />
      ) : (
        <SecondaryCard
          title={copy.t("Plan")}
          description={copy.t("Talent subscription tiers (Free / Pro / Portfolio). Sign in as a talent to see your live plan and any active trial.")}
          meta={<><StatDot tone="dim" /> {copy.t("Preview")}</>}
          affordance={copy.t("Compare plans")}
          onClick={() => openDrawer("talent-tier-compare")}
        />
      )}
      <Grid cols="2">
        <SecondaryCard
          title={copy.t("Personal page builder")}
          description={copy.t("Templates, sections, embeds and a Portfolio custom domain. Coexists with all your agency rosters.")}
          affordance={copy.t("Open page builder")}
          onClick={() => setTalentPage("public-page")}
        />
      </Grid>

      <Divider label={copy.t("Account")} icon={<SettingsSectionIcon sectionId="account" />} />
      <Grid cols="2">
        <SecondaryCard
          title={copy.t("Contact preferences")}
          description={copy.t("Choose which client trust tiers can send you inquiries. Selectivity is opt-in; defaults stay open.")}
          meta={<ContactPolicySummary policy={MY_TALENT_PROFILE.contactPolicy} />}
          affordance={copy.t("Manage")}
          onClick={() => openDrawer("talent-contact-preferences")}
        />
        <SecondaryCard
          title={copy.t("Notifications")}
          description={copy.t("What email and push you get when an agency sends you a request.")}
          affordance={copy.t("Manage prefs")}
          onClick={() => openDrawer("talent-notifications", { expanded: "settings" })}
        />
        <SecondaryCard
          title={copy.t("Privacy")}
          description={copy.t("Search-engine indexing, sensitive measurements, document visibility. Channel toggles moved to Reach.")}
          affordance={copy.t("Manage")}
          onClick={() => openSection("admin")}
        />
        <SecondaryCard
          title={copy.t("Payouts")}
          description={copy.t("Connect a Stripe account to receive payouts on confirmed bookings. Set up right inside Tulala.")}
          affordance={copy.t("Set up payouts")}
          onClick={() => setTalentPage("payouts")}
        />
        <SecondaryCard
          title={copy.t("Identity verification")}
          description={copy.t("ID review plus connected-account badges. Social badges only turn on after ownership is verified.")}
          meta={<><StatDot tone="amber" /> {copy.t("Not yet verified")}</>}
          affordance={copy.t("Open verification")}
          onClick={() => openDrawer("talent-connections")}
        />
        {/* "Refer a friend" card hidden — referral invites + €50 payout
            credit have no backend yet; showing an entry point to a
            coming-soon-only drawer is a dead affordance. Restore when the
            referral engine ships. */}
        <SecondaryCard
          title={copy.t("Tax documents")}
          description={copy.t("Year-end summaries, W-8BEN/W-9 on file, off-platform self-declaration.")}
          affordance={copy.t("Open tax docs")}
          onClick={() => openDrawer("talent-tax-docs")}
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
        <SecondaryCard
          title={copy.t("Help & support")}
          description={copy.t("Common questions, contracts, payouts, contact our team.")}
          affordance={copy.t("Get help")}
          onClick={() => openDrawer("help")}
        />
        {/* Audit #47 — "Sign out / leave" card removed. Sign out lives
            in the identity bar; ending an agency relationship lives in
            the per-agency relationship drawer (Agencies section above). */}
      </Grid>
    </>
  );
}
