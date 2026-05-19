"use client";

import { PasskeysCard } from "../../modern-features";
import { Divider, Icon, SecondaryButton, SecondaryCard, StatDot, Toggle } from "../../primitives";
import { COLORS, FONTS, MY_AGENCIES, MY_TALENT_PROFILE, useAdminShell } from "../../state";
import { Grid, PageHeader } from "../shared/page-chrome-1";
import { ContactPolicySummary, MOCK_CIRCLE_PREVIEW_COUNT, TalentTrustCard } from "../shared/settings-1";



export function SettingsPage() {
  const { openDrawer, setTalentPage, bridgeTalentSelfProfile, bridgeTalentAgencies } = useAdminShell();
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
        title="Settings"
        subtitle="Agencies, notifications, privacy and payouts. Where you appear lives in Reach."
        actions={
          <SecondaryButton onClick={() => setTalentPage("reach")}>
            Open Reach →
          </SecondaryButton>
        }
      />

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
          <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.indigoDeep }}>
            Distribution decisions live in Reach
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: COLORS.indigoDeep,
              opacity: 0.78,
              marginTop: 1,
            }}
          >
            Toggle channels, manage which hubs and studios you're listed on, set exposure presets — all over there.
          </div>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.indigoDeep }}>
          Open Reach →
        </span>
      </button>

      <Divider label="My Circle" />
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
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.royalDeep }}>My Circle</div>
          <div style={{ fontSize: 11.5, color: COLORS.royal, opacity: 0.78, marginTop: 2 }}>
            Trusted collaborators you can recommend into bookings in one tap. {MOCK_CIRCLE_PREVIEW_COUNT} people in your circle.
          </div>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.royalDeep }}>Manage →</span>
      </button>

      <Divider label="Agencies" />
      <Grid cols="auto">
        {settingsAgencies.map((a) => (
          <SecondaryCard
            key={a.id}
            title={a.name}
            description={`${a.status === "exclusive" ? "Exclusive" : "Non-exclusive"} · joined ${a.joinedAt}`}
            meta={
              <>
                <StatDot tone={a.isPrimary ? "green" : "ink"} />
                {a.isPrimary ? "Primary" : "Secondary"} · {a.bookingsYTD} bookings
              </>
            }
            affordance="Open relationship"
            onClick={() => openDrawer("talent-agency-relationship", { id: a.id })}
          />
        ))}
        <SecondaryCard
          title="Add another agency"
          description="Get invited via email — agencies onboard talent, not the other way around."
          affordance="Learn more"
          onClick={() => openDrawer("talent-agency-relationship", { mode: "add" })}
        />
      </Grid>

      {/* Personal page — subscription tier not yet in bridge; show
          Demo label so real tenants never see Marta's "Pro" plan (task 0.7). */}
      <Divider label="Personal page" />
      <Grid cols="2">
        <SecondaryCard
          title="Plan · coming soon"
          description="Talent subscription tiers (Basic / Pro / Portfolio) will appear here once billing is live."
          meta={<><StatDot tone="dim" /> Demo · coming soon</>}
          affordance="Compare plans"
          onClick={() => openDrawer("talent-tier-compare")}
        />
        <SecondaryCard
          title="Personal page builder"
          description="Templates, sections, embeds and (Portfolio) custom domain. Coexists with all your agency rosters."
          meta={<><StatDot tone="dim" /> Coming soon</>}
          affordance="Choose template"
          onClick={() => openDrawer("talent-page-template")}
        />
      </Grid>

      <Divider label="Account" />
      <Grid cols="2">
        <SecondaryCard
          title="Contact preferences"
          description="Choose which client trust tiers can send you inquiries. Selectivity is opt-in — defaults stay open."
          meta={<ContactPolicySummary policy={MY_TALENT_PROFILE.contactPolicy} />}
          affordance="Manage"
          onClick={() => openDrawer("talent-contact-preferences")}
        />
        <SecondaryCard
          title="Notifications"
          description="What email and push you get when an agency sends you a request."
          affordance="Manage prefs"
          onClick={() => openDrawer("talent-notifications", { expanded: "settings" })}
        />
        <SecondaryCard
          title="Privacy"
          description="Search-engine indexing, sensitive measurements, document visibility. Channel toggles moved to Reach."
          affordance="Manage"
          onClick={() => openSection("admin")}
        />
        <SecondaryCard
          title="Payouts"
          description="Bank info for direct payouts when an agency uses Tulala billing."
          affordance="Manage"
          onClick={() => openDrawer("talent-payouts")}
        />
        <SecondaryCard
          title="Identity verification"
          description="Get the Verified badge on every inquiry. ID + selfie · reviewed by our trust team within 24h."
          meta={<><StatDot tone="amber" /> Not yet verified</>}
          affordance="Verify identity"
          onClick={() => openDrawer("talent-verification")}
        />
        <SecondaryCard
          title="Refer a friend"
          description="When a talent you invite closes their first booking, you both earn €50 in payout credit."
          meta={<><StatDot tone="green" /> 1 active</>}
          affordance="Open referrals"
          onClick={() => openDrawer("talent-referrals")}
        />
        <SecondaryCard
          title="Tax documents"
          description="Year-end summaries, W-8BEN/W-9 on file, off-platform self-declaration."
          affordance="Open tax docs"
          onClick={() => openDrawer("talent-tax-docs")}
        />
        <SecondaryCard
          title="Talent network"
          description="Follow other talents, see who's working where, hand off briefs you can't take."
          meta={<><StatDot tone="green" /> 2 following</>}
          affordance="Open network"
          onClick={() => openDrawer("talent-network")}
        />
        <SecondaryCard
          title="Workspace · multi-agency"
          description="On the Network plan? Switch between agencies you own. Studio Reyes + Bumble live · Acme primary."
          meta={<><StatDot tone="green" /> 3 workspaces</>}
          affordance="Switch workspace"
          onClick={() => openDrawer("talent-multi-agency-picker")}
        />
        <SecondaryCard
          title="Help & support"
          description="Common questions, contracts, payouts, contact our team."
          affordance="Get help"
          onClick={() => openDrawer("help")}
        />
        {/* Audit #47 — "Sign out / leave" card removed. Sign out lives
            in the identity bar; ending an agency relationship lives in
            the per-agency relationship drawer (Agencies section above). */}
      </Grid>
    </>
  );
}
