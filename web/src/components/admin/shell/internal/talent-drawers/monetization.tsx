"use client";

// ════════════════════════════════════════════════════════════════════
// talent-drawers/monetization — Phase 1d body chunk.
// Owns: TalentPayoutsDrawer, TalentVerificationDrawer,
// TalentReferralsDrawer, TalentHubCompareDrawer, TalentTaxDocsDrawer,
// TalentConflictResolveDrawer.
// Bodies copied byte-for-byte from talent-drawers.tsx; no behavior change.
// ════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { COLORS, EARNINGS_ROWS, FONTS, useAdminShell } from "../state";
import {
  Divider,
  DrawerShell,
  EmptyState,
  Icon,
  PrimaryButton,
  SecondaryButton,
} from "../primitives";
import { KvRow, SummaryStat } from "./shared";

// ─── Payouts ────────────────────────────────────────────────────

export function TalentPayoutsDrawer() {
  const { state, closeDrawer, setTalentPage } = useAdminShell();
  const open = state.drawer.drawerId === "talent-payouts";
  const goToPayouts = () => { closeDrawer(); setTalentPage("payouts"); };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Set up payouts"
      description="Stripe Connect handles KYC + banking. Tulala never sees your bank details."
      width={560}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
          <PrimaryButton onClick={goToPayouts}>Set up payouts</PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div style={{ padding: "12px 14px", border: `1px solid rgba(15,79,62,0.18)`, borderRadius: 10, fontFamily: FONTS.body, fontSize: 12, lineHeight: 1.5 }} className="bg-admin-accent-soft text-admin-ink">
          <strong className="text-admin-accent-deep">Encrypted via Stripe.</strong>{" "}
          Bank details and ID never touch Tulala servers.
        </div>
        <div style={{ padding: "20px 16px", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12, fontFamily: FONTS.body, textAlign: "center" }} className="bg-admin-surface-alt">
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }} className="text-admin-ink">
            Connect your bank in a few minutes
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, maxWidth: 360, margin: "0 auto 14px" }} className="text-admin-ink-muted">
            Complete Stripe&apos;s secure identity + bank setup right inside Tulala. Once
            connected, your share of every confirmed booking transfers to you automatically.
          </div>
          <PrimaryButton onClick={goToPayouts}>Set up payouts →</PrimaryButton>
        </div>
        <KvRow label="Payout schedule" value="Per-booking · on Stripe's standard schedule" />
        <KvRow label="Currency" value="Set during Stripe onboarding" />
        <KvRow label="Tax form" value="W-8BEN / W-9 depending on residency" />
      </div>
    </DrawerShell>
  );
}

// ─── Trust verification (D1) ────────────────────────────────────

/**
 * Identity verification scaffold. Multi-step ID upload flow that — once
 * approved by an admin — lifts the talent's trust tier from Basic to
 * Verified, unlocking the Verified badge on roster cards and inquiry
 * workspaces.
 *
 * This is a scaffold. The real flow uses a vendor (Stripe Identity, Onfido,
 * Persona) that returns a verification result via webhook; the prototype
 * stops at "submitted — under review" so the admin queue is implied but
 * not modeled here.
 */
export function TalentVerificationDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-verification";

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Verify your identity"
      description="Upload a government ID + a quick selfie. Once approved you get the Verified badge — clients see it on every inquiry."
      width={560}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <button
            type="button"
            disabled
            style={{
              padding: "9px 16px",
              background: "rgba(11,11,13,0.12)",
              border: "none",
              borderRadius: 8,
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 500,
              color: COLORS.inkMuted,
              cursor: "not-allowed",
            }}
            title="ID verification coming soon"
          >
            Start verification
          </button>
        </>
      }
    >
      <div style={{ padding: "12px 14px", border: `1px solid rgba(15,79,62,0.18)`, borderRadius: 10, marginBottom: 14, fontFamily: FONTS.body, fontSize: 12, lineHeight: 1.5 }} className="bg-admin-accent-soft text-admin-ink">
        <strong className="text-admin-accent-deep">End-to-end encrypted.</strong>{" "}
        Documents are reviewed by Tulala&apos;s trust team and deleted after approval. Never shared with clients.
      </div>

      <div className="flex flex-col gap-3.5">
        <h3 style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, margin: 0, letterSpacing: -0.15 }} className="text-admin-ink">
          Why verify?
        </h3>
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { label: "Verified badge on every inquiry", body: "Clients filter on it. Verified profiles get ~3× more replies in our data." },
            { label: "Higher trust tier", body: "Eligible for Silver and Gold tiers as your booking history grows." },
            { label: "Required for payouts > €1k", body: "Compliance — Stripe needs the same KYC anyway." },
          ].map((item, idx) => (
            <li
              key={idx}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 12px",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 9,
                fontFamily: FONTS.body,
              }}
            >
              <span style={{ width: 22, height: 22, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }} className="bg-admin-accent-soft text-admin-accent-deep">
                {idx + 1}
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35 }} className="text-admin-ink">
                  {item.label}
                </div>
                <div style={{ fontSize: 12, marginTop: 2, lineHeight: 1.45 }} className="text-admin-ink-muted">
                  {item.body}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div style={{ padding: "16px", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 1.55, textAlign: "center" }} className="bg-admin-surface-alt text-admin-ink-muted">
          ID verification is coming soon. We&apos;ll notify you when it&apos;s available.
        </div>
      </div>
    </DrawerShell>
  );
}

// ─── Friend referrals (D7) ──────────────────────────────────────

export function TalentReferralsDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-referrals";
  // Honest stub — referral tracking has no backend yet, so we don't show a
  // fabricated invite link / referral list / earnings. The €50 promise stays
  // in the description as the product intent.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Refer a friend"
      description="When a talent you invited closes their first booking, you both earn €50 in payout credit."
      width={560}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="sparkle"
        title="Coming soon"
        body="Referral invites and €50 payout credit aren't live yet. We'll add your personal invite link here when they launch."
      />
    </DrawerShell>
  );
}

// ─── Hub compare (E7) ───────────────────────────────────────────

const HUB_COMPARE_DATA = [
  {
    name: "Tulala Hub · Madrid",
    listingFee: "€8/mo",
    avgInquiriesPerMonth: 9,
    averageDayRate: "€280",
    closeRate: "22%",
    talentCount: 240,
    notes: "Strong fashion + commercial briefs. Hub-fee waived for verified talents.",
    recommended: true,
  },
  {
    name: "Tulala Hub · Barcelona",
    listingFee: "€8/mo",
    avgInquiriesPerMonth: 6,
    averageDayRate: "€240",
    closeRate: "18%",
    talentCount: 180,
    notes: "More editorial / lifestyle. Slower volume, higher day rates.",
    recommended: false,
  },
  {
    name: "TalentLink · Lisbon",
    listingFee: "€12/mo",
    avgInquiriesPerMonth: 4,
    averageDayRate: "€220",
    closeRate: "14%",
    talentCount: 90,
    notes: "Smaller hub, higher signal-to-noise. Good if you're already on a Madrid hub.",
    recommended: false,
  },
];

export function TalentHubCompareDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-hub-compare";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Compare hubs"
      description="Side-by-side: listing fee, monthly volume, and close-rate. Numbers are rolling 90-day averages from talents on each hub."
      width={760}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {HUB_COMPARE_DATA.map((hub) => (
          <div
            key={hub.name}
            style={{
              position: "relative",
              padding: "14px 14px 16px",
              background: "#fff",
              border: `1px solid ${hub.recommended ? COLORS.accent : COLORS.borderSoft}`,
              borderRadius: 12,
              fontFamily: FONTS.body,
            }}
          >
            {hub.recommended && (
              <span style={{ position: "absolute", top: -10, left: 12, color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", padding: "3px 8px", borderRadius: 999 }} className="bg-admin-accent">
                Best fit
              </span>
            )}
            <div style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 500, marginBottom: 10, letterSpacing: -0.1 }} className="text-admin-ink">
              {hub.name}
            </div>
            <KvRow label="Listing fee" value={hub.listingFee} />
            <KvRow label="Inquiries / mo" value={String(hub.avgInquiriesPerMonth)} />
            <KvRow label="Avg day rate" value={hub.averageDayRate} />
            <KvRow label="Close rate" value={hub.closeRate} />
            <KvRow label="Roster size" value={`${hub.talentCount} talents`} />
            <p style={{ margin: "10px 0 0", fontSize: 11.5, lineHeight: 1.5 }} className="text-admin-ink-muted">
              {hub.notes}
            </p>
            <div className="mt-3">
              <PrimaryButton
                size="sm"
                onClick={() => undefined}
              >
                {hub.recommended ? "Get listed" : "List on this hub"}
              </PrimaryButton>
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Tax docs (D3) ──────────────────────────────────────────────
//
// Documented decision in DP1 + DP10: should off-platform earnings flow
// into 1099 reporting? In-kind / gift earnings? Default position taken
// here: ON-platform earnings are reported automatically; off-platform is
// opt-in (talent declares it) with a clear tax-receipt download. This
// matches what most marketplaces do (Fiverr, Upwork, Etsy) and avoids
// surprising talents at year-end.

export function TalentTaxDocsDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-tax-docs";
  const yearTotal = EARNINGS_ROWS.reduce((sum, e) => {
    const num = parseFloat(e.amount.replace(/[^0-9.]/g, "")) || 0;
    return sum + num;
  }, 0);
  const platformTotal = EARNINGS_ROWS
    .filter((e) => e.source.kind !== "manual")
    .reduce((sum, e) => sum + (parseFloat(e.amount.replace(/[^0-9.]/g, "")) || 0), 0);
  const offPlatformTotal = yearTotal - platformTotal;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Tax documents"
      description="Year-end summary + downloadable forms. Tulala reports your platform earnings; off-platform you declare yourself."
      width={580}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <SummaryStat label="2026 total" value={`€${yearTotal.toLocaleString()}`} accent="ink" />
        <SummaryStat label="Platform" value={`€${platformTotal.toLocaleString()}`} accent="green" />
        <SummaryStat label="Off-platform" value={`€${offPlatformTotal.toLocaleString()}`} accent="amber" />
      </div>

      <Divider label="Available documents" />

      <div className="flex flex-col gap-2">
        {[
          { label: `${new Date().getUTCFullYear()} income summary`, body: "Platform-reported earnings only · PDF download", action: "Download", href: `/api/talent/tax-summary?year=${new Date().getUTCFullYear()}` },
          { label: "W-8BEN form", body: "Official IRS form — opens irs.gov in a new tab", action: "Open", href: "https://www.irs.gov/pub/irs-pdf/fw8ben.pdf" },
          { label: "2025 income summary", body: "Platform-reported earnings only · PDF download", action: "Download", href: "/api/talent/tax-summary?year=2025" },
        ].map((doc, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              if ((doc as { href?: string }).href && typeof window !== "undefined") {
                window.open((doc as { href: string }).href, "_blank", "noopener,noreferrer");
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              fontFamily: FONTS.body,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <Icon name="external" size={14} color={COLORS.inkMuted} />
            <div className="flex-1 min-w-0">
              <div className="text-admin-ink text-admin-13 font-medium">{doc.label}</div>
              <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">{doc.body}</div>
            </div>
            <span className="text-admin-accent-deep text-admin-11h font-semibold">{doc.action}</span>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16, padding: "12px 14px", border: `1px solid rgba(91,107,160,0.18)`, borderRadius: 10, fontFamily: FONTS.body, fontSize: 12, lineHeight: 1.5 }} className="bg-admin-indigo-soft text-admin-indigo-deep">
        <strong className="font-semibold">About off-platform & in-kind:</strong>{" "}
        Off-platform earnings you log via &quot;Log work&quot; appear in your year-end summary
        as self-declared income. In-kind / gift work shows separately and isn&apos;t
        included in the cash total — useful for your records, not reported to tax
        authorities. Talk to a local advisor for your jurisdiction.
      </div>
    </DrawerShell>
  );
}

// ─── Smart conflict resolution (E2) ─────────────────────────────
//
// Surfaces a calendar conflict (two holds for overlapping dates, or a
// new inquiry that overlaps a confirmed booking) and offers three
// resolution paths: prefer-A, prefer-B, propose-alt-window. The
// resolution flow is wrapped in a confirm-step so the talent owns the
// decision; AI ranks options based on day-rate, client trust tier, and
// agency relationship.

export function TalentConflictResolveDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-conflict-resolve";
  const [choice, setChoice] = useState<"a" | "b" | "alt" | null>(null);

  // Mock conflict — in production resolved from inquiry.dates × booking.dates
  const conflict = {
    a: { client: "Mango", date: "May 14", brief: "Spring campaign · Madrid", rate: "€1,200/day", trust: "Verified", recommended: true },
    b: { client: "Atelier Paris", date: "May 14", brief: "Editorial wrap · Paris", rate: "€800/day", trust: "Basic", recommended: false },
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Conflict on May 14"
      description="Two clients want you the same day. Tulala ranks them by rate, trust, and agency relationship. You decide."
      width={620}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      {(["a", "b"] as const).map((key) => {
        const c = conflict[key];
        const selected = choice === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setChoice(key)}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              width: "100%",
              padding: "14px 16px",
              marginBottom: 10,
              background: "#fff",
              border: `1px solid ${selected ? COLORS.accent : c.recommended ? "rgba(15,79,62,0.30)" : COLORS.borderSoft}`,
              borderRadius: 12,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: FONTS.body,
              position: "relative",
            }}
          >
            {c.recommended && (
              <span style={{ position: "absolute", top: -10, left: 14, color: "#fff", fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", padding: "3px 8px", borderRadius: 999 }} className="bg-admin-accent">
                AI suggests
              </span>
            )}
            <span
              aria-hidden
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: `2px solid ${selected ? COLORS.accent : COLORS.border}`,
                background: selected ? COLORS.accent : "transparent",
                marginTop: 2,
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {selected && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
            </span>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{c.client}</div>
              <div style={{ fontSize: 12, marginTop: 2 }} className="text-admin-ink-muted">{c.brief}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                <span className="text-admin-green text-xs font-semibold">{c.rate}</span>
                <span className="text-admin-ink-muted text-admin-11h">· {c.trust}</span>
              </div>
            </div>
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => setChoice("alt")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          padding: "12px 16px",
          background: "rgba(11,11,13,0.025)",
          border: `1px dashed ${choice === "alt" ? COLORS.accent : COLORS.border}`,
          borderRadius: 12,
          cursor: "pointer",
          textAlign: "left",
          fontFamily: FONTS.body,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            border: `2px solid ${choice === "alt" ? COLORS.accent : COLORS.border}`,
            background: choice === "alt" ? COLORS.accent : "transparent",
            flexShrink: 0,
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-admin-ink text-admin-13 font-medium">Propose alternative dates to both</div>
          <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
            Suggest May 12 to Mango and May 16 to Atelier · we draft the messages
          </div>
        </div>
      </button>
    </DrawerShell>
  );
}
