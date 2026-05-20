"use client";

// ════════════════════════════════════════════════════════════════════
// talent-drawers/profile-extras — Phase 1d body chunk.
// Owns: TalentLinksDrawer, TalentReviewsDrawer, TalentShowreelDrawer,
// TalentMeasurementsDrawer, TalentDocumentsDrawer,
// TalentEmergencyContactDrawer, TalentPublicPreviewDrawer.
// Private helpers: PreviewKv.
// Bodies copied byte-for-byte from talent-drawers.tsx; no behavior change.
// ════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { updateSelfEmergencyContact } from "@/lib/server-actions/talent-self-profile-sections";
import {
  COLORS,
  FONTS,
  MY_TALENT_PROFILE,
  TALENT_TIER_META,
  TENANT,
  useAdminShell,
  type TalentSubscriptionTier,
} from "../state";
import {
  Divider,
  DrawerShell,
  FieldRow,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from "../primitives";
import { ProfileSectionNotConnected, SaveErrorBanner, SummaryStat } from "./shared";

// ─── External links ─────────────────────────────────────────────

export function TalentLinksDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-links";
  const links = MY_TALENT_PROFILE.links;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="External links"
      description="Social, IMDb, personal site. Follower counts auto-refresh weekly when you connect the account."
      width={560}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <div className="flex flex-col gap-2">
        {links.map((l, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <span style={{ fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", width: 80 }} className="text-admin-ink-muted">
              {l.kind}
            </span>
            <div className="min-w-0">
              <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500 }} className="text-admin-ink">
                {l.label}
              </div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">
                {l.url}
              </div>
            </div>
            {l.followers ? (
              <span style={{ fontFamily: FONTS.body, fontSize: 11.5 }} className="text-admin-ink-muted">
                {l.followers}
              </span>
            ) : (
              <span style={{ fontFamily: FONTS.body, fontSize: 11.5 }} className="text-admin-ink-dim">—</span>
            )}
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Reviews ────────────────────────────────────────────────────

export function TalentReviewsDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-reviews";
  const reviews = MY_TALENT_PROFILE.reviews;
  const stats = MY_TALENT_PROFILE.bookingStats;
  const avg = reviews.reduce((a, r) => a + r.rating, 0) / Math.max(reviews.length, 1);

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Reviews & endorsements"
      description="Producers and creative directors can leave a review after a wrap. They're verified — no anonymous critiques."
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
        <SummaryStat label="Average" value={`${avg.toFixed(1)} / 5`} accent="green" />
        <SummaryStat label="Reviews" value={String(reviews.length)} accent="ink" />
        <SummaryStat label="On-time rate" value={`${stats.onTimeRate}%`} accent="green" />
      </div>
      <div className="flex flex-col gap-2.5">
        {reviews.map((r) => (
          <div
            key={r.id}
            style={{
              padding: "14px 16px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span className="text-admin-accent-deep text-admin-13">
                {"★".repeat(r.rating)}
                <span className="text-admin-ink-dim">{"★".repeat(5 - r.rating)}</span>
              </span>
              <span style={{ fontFamily: FONTS.body, fontSize: 11.5, marginLeft: "auto" }} className="text-admin-ink-muted">
                {r.shootDate}
              </span>
            </div>
            <p style={{ margin: 0, fontFamily: FONTS.body, fontSize: 13.5, lineHeight: 1.55 }} className="text-admin-ink">
              &quot;{r.body}&quot;
            </p>
            <div style={{ marginTop: 8, fontFamily: FONTS.body, fontSize: 11.5 }} className="text-admin-ink-muted">
              — {r.reviewerName} · {r.reviewerRole} · {r.brand}
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Showreel ───────────────────────────────────────────────────

export function TalentShowreelDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-showreel";
  const p = MY_TALENT_PROFILE;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Showreel"
      description={`${p.showreelDuration ?? "0:42"} · A 30–45 sec clip of you on camera. Casting directors love these.`}
      width={620}
      footer={
        <>
          <SecondaryButton disabled>Replace clip</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>Close</PrimaryButton>
        </>
      }
    >
      <div style={{ aspectRatio: "16 / 9", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 96, border: `1px solid ${COLORS.borderSoft}`, marginBottom: 16, position: "relative" }} className="bg-admin-surface-alt">
        {p.showreelThumb ?? "🎞️"}
      </div>
      <Divider label="Why a showreel" />
      <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.7 }} className="text-admin-ink">
        <li>Speaking voice + accent for any TV/voiceover briefs</li>
        <li>Range of expression beyond what a still shows</li>
        <li>Movement quality — walking, turning, gesture</li>
        <li>Natural light + tight crop is fine. No need for a studio piece.</li>
      </ul>
    </DrawerShell>
  );
}

// ─── Measurements ───────────────────────────────────────────────

export function TalentMeasurementsDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-measurements";

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Measurements"
      description="This measurements panel is not connected to your live profile yet."
      width={580}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <ProfileSectionNotConnected section="measurements" />
    </DrawerShell>
  );
}

// ─── Documents ──────────────────────────────────────────────────

export function TalentDocumentsDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-documents";

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Documents"
      description="This documents panel is not connected to your live profile yet."
      width={560}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <ProfileSectionNotConnected section="documents" />
    </DrawerShell>
  );
}

// ─── Emergency contact ──────────────────────────────────────────

export function TalentEmergencyContactDrawer() {
  const { state, closeDrawer, bridgeTalentSelfProfile } = useAdminShell();
  const open = state.drawer.drawerId === "talent-emergency-contact";
  const talentProfileId = bridgeTalentSelfProfile?.id ?? null;
  const c = MY_TALENT_PROFILE.emergencyContact;

  const [name, setName] = useState(c.name);
  const [relation, setRelation] = useState(c.relation);
  const [phone, setPhone] = useState(c.phone);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!talentProfileId) { setSaveError("No talent profile loaded — reload and try again."); return; }
    if (!name.trim()) { setSaveError("Name is required."); return; }
    setSaving(true);
    setSaveError(null);
    const result = await updateSelfEmergencyContact({
      talent_profile_id: talentProfileId,
      name,
      relation,
      phone,
    });
    setSaving(false);
    if (!result.ok) { setSaveError(result.error); return; }
    closeDrawer();
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Emergency contact"
      description="Visible only during an active booking, to the producer running the call sheet. Hidden the rest of the time."
      width={520}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </>
      }
    >
      {saveError && <SaveErrorBanner error={saveError} onDismiss={() => setSaveError(null)} />}
      <div className="flex flex-col gap-3.5">
        <FieldRow label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </FieldRow>
        <FieldRow label="Relation">
          <TextInput value={relation} onChange={(e) => setRelation(e.target.value)} />
        </FieldRow>
        <FieldRow label="Phone" hint="Stored encrypted. Masked on every other surface.">
          <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} />
        </FieldRow>
        <Divider label="When this is shown" />
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.7 }} className="text-admin-ink-muted">
          <li>The day of a confirmed booking, on that booking&apos;s call sheet only</li>
          <li>To the producer named on the contract — no one else</li>
          <li>Auto-revoked 24h after the wrap time</li>
        </ul>
      </div>
    </DrawerShell>
  );
}

// ─── Public preview ─────────────────────────────────────────────
//
// Talent's view of "where am I visible right now and what would change
// if I upgraded?". Each tier tab shows:
//   1. **Distribution links** — the actual surfaces the public can see
//      this talent on at the selected tier. Copy + Open per row.
//   2. **What this tier unlocks** — concrete features added vs. the
//      previous tier. Always shown for context, even on Basic.
//
// We do NOT try to render a faked-mockup of the public page inside the
// drawer — that's brittle (image rendering issues) and never matches
// the real surface. Better: link them out to the live URLs.

export function TalentPublicPreviewDrawer() {
  const { state, closeDrawer, toast, openDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-public-preview";
  const p = MY_TALENT_PROFILE;
  const slug = p.subscription.personalPageUrl.replace(/^.*\/t\//, "").trim() || "marta-reyes";
  const currentTier = p.subscription.tier;
  const [previewTier, setPreviewTier] = useState<TalentSubscriptionTier>(currentTier);

  // ── Build the distribution-links list for the previewed tier ──
  type LinkRow = {
    id: string;
    label: string;
    sub: string;
    url: string;
    icon: string;
    primary?: boolean;
  };
  const links: LinkRow[] = (() => {
    const rows: LinkRow[] = [];

    // Tulala personal page — always present. Custom domain only on
    // Portfolio (and only if verified).
    const hasCustomDomain = previewTier === "portfolio" && p.subscription.customDomain && p.subscription.customDomainStatus === "verified";
    if (hasCustomDomain) {
      rows.push({
        id: "personal-custom",
        label: "Your custom domain",
        sub: "Portfolio tier · your own URL, no Tulala branding",
        url: `https://${p.subscription.customDomain}`,
        icon: "globe",
        primary: true,
      });
    } else {
      rows.push({
        id: "personal-tulala",
        label: previewTier === "portfolio" ? "Tulala personal page (fallback)" : "Tulala personal page",
        sub: previewTier === "portfolio"
          ? "Active until you connect a custom domain"
          : `${TALENT_TIER_META[previewTier].label} tier · canonical URL`,
        url: `https://tulala.digital/t/${slug}`,
        icon: "globe",
        primary: previewTier !== "portfolio",
      });
    }

    // Agency-roster page — shown for all tiers because the agency
    // page is independent of the talent's personal-page subscription.
    if (p.primaryAgency) {
      rows.push({
        id: "agency",
        label: `${p.primaryAgency} roster`,
        sub: `${TENANT.customDomain || TENANT.domain} · agency-controlled`,
        url: `https://${TENANT.customDomain || TENANT.domain}/talent/${slug}`,
        icon: "team",
      });
    }

    // Hub listings — same independence rule. Show 1-2 representative
    // hubs the talent appears on. (Production wires this to real
    // hub_memberships rows.)
    rows.push({
      id: "hub-discover",
      label: "Tulala Hub · Discover",
      sub: "Cross-agency hub feed · search-ranked",
      url: "https://tulala.network/hub/discover",
      icon: "search",
    });
    rows.push({
      id: "hub-vertical",
      label: "Tulala Hub · Hospitality vertical",
      sub: "Vertical-specific hub the talent is listed on",
      url: "https://tulala.network/hub/hospitality",
      icon: "briefcase",
    });

    return rows;
  })();

  // ── Tier feature lists ──
  // Each list is what THIS tier unlocks ON TOP of the tier below it.
  // Drives the "what this tier gives you" panel.
  const tierFeatures: Record<TalentSubscriptionTier, { headline: string; bullets: string[] }> = {
    basic: {
      headline: "Default canonical page on Tulala",
      bullets: [
        `Canonical URL: tulala.digital/t/${slug}`,
        "Identity, measurements, languages, track record",
        "Trust badges (verified email / IG / Tulala review)",
        "Distribution: agency roster + Tulala hubs",
      ],
    },
    pro: {
      headline: "Premium templates + featured media",
      bullets: [
        "3 premium page templates (Editorial / Studio / Roster)",
        "Featured media — embed up to 6 videos / IG / TikTok / YouTube",
        "Press section — show 6 magazine clippings",
        "Removes Tulala branding from your personal page footer",
        "Priority on hub search results",
      ],
    },
    portfolio: {
      headline: "Custom domain + full personal site",
      bullets: [
        "Connect your own domain (e.g. your-name.com)",
        "All Pro features included",
        "Story / About long-form section",
        "Tour dates, show calendar, EPK download, FAQ",
        "Unlimited media embeds",
        "Custom analytics: visitor count, top referrers",
      ],
    },
  };

  const features = tierFeatures[previewTier];
  const tierAheadOfCurrent = (
    previewTier === "portfolio" && currentTier !== "portfolio"
  ) || (previewTier === "pro" && currentTier === "basic");

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Preview as a client"
      description="Where you appear right now, plus what each tier unlocks. Tap a tier to see its distribution + feature set."
      width={720}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
          {tierAheadOfCurrent && (
            <PrimaryButton onClick={() => { closeDrawer(); openDrawer("talent-tier-compare"); }}>
              Upgrade to {TALENT_TIER_META[previewTier].label}
            </PrimaryButton>
          )}
        </>
      }
    >
      {/* Tier toggle */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          background: "rgba(11,11,13,0.04)",
          borderRadius: 999,
          marginBottom: 14,
          width: "fit-content",
        }}
      >
        {(["basic", "pro", "portfolio"] as const).map((t) => {
          const isActive = previewTier === t;
          const isCurrent = currentTier === t;
          return (
            <button
              key={t}
              onClick={() => setPreviewTier(t)}
              style={{
                padding: "5px 12px",
                background: isActive ? "#fff" : "transparent",
                color: isActive ? COLORS.ink : COLORS.inkMuted,
                border: "none",
                fontFamily: FONTS.body,
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 999,
                cursor: "pointer",
                boxShadow: isActive ? "0 1px 3px rgba(11,11,13,0.06)" : "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {TALENT_TIER_META[t].label}
              {isCurrent && (
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-accent-deep">
                  · current
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Distribution links ─────────────────────────────────────
          The actual surfaces a client can see this talent on. Copy +
          Open per row. Custom domain only appears on Portfolio when
          verified — otherwise the canonical Tulala URL is the active
          one. */}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }} className="text-admin-ink-muted">
        Where you appear · {TALENT_TIER_META[previewTier].label}
      </div>
      <div style={{
        display: "flex", flexDirection: "column", gap: 8,
        marginBottom: 18,
      }}>
        {links.map((row) => (
          <div key={row.id} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px",
            background: row.primary ? COLORS.accentSoft : "#fff",
            border: `1px solid ${row.primary ? "rgba(15,79,62,0.24)" : COLORS.borderSoft}`,
            borderRadius: 10,
          }}>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 13, fontWeight: 600, fontFamily: FONTS.body }} className="text-admin-ink">
                {row.label}
              </div>
              <div style={{ fontSize: 11.5, fontFamily: FONTS.body, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink-muted">
                {row.url.replace(/^https?:\/\//, "")} · {row.sub}
              </div>
            </div>
            <button type="button"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  navigator.clipboard.writeText(row.url).catch(() => {});
                }
                toast(`Copied ${row.url.replace(/^https?:\/\//, "")}`);
              }}
              style={{
                padding: "6px 10px", borderRadius: 7,
                background: "transparent",
                border: `1px solid ${COLORS.borderSoft}`,
                color: COLORS.inkMuted,
                fontSize: 11.5, fontWeight: 500, cursor: "pointer",
                fontFamily: FONTS.body,
              }}
            >Copy</button>
            <a href={row.url} target="_blank" rel="noreferrer"
              style={{
                padding: "6px 10px", borderRadius: 7,
                background: COLORS.fill, color: "#fff",
                border: "none",
                fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                fontFamily: FONTS.body,
                textDecoration: "none",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}
            >
              Open
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                <path d="M2 7l5-5M3 2h4v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </div>
        ))}
      </div>

      {/* ── What this tier unlocks ─────────────────────────────────
          Always shown — drives the upsell when the previewed tier is
          ahead of `currentTier`. Footer CTA flips to "Upgrade to X"
          in that case. */}
      <div style={{
        padding: 14,
        background: previewTier === currentTier ? "#fff" : COLORS.accentSoft,
        border: `1px solid ${previewTier === currentTier ? COLORS.borderSoft : "rgba(15,79,62,0.24)"}`,
        borderRadius: 12,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: FONTS.body }} className="text-admin-ink">
            {features.headline}
          </div>
          {previewTier !== currentTier && tierAheadOfCurrent && (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", background: "#fff", padding: "2px 7px", borderRadius: 999 }} className="text-admin-accent-deep">
              Upgrade required
            </span>
          )}
          {previewTier === currentTier && (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-success-deep">
              Active
            </span>
          )}
        </div>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 1.6 }} className="text-admin-ink">
          {features.bullets.map((b, i) => (
            <li key={i} style={{ marginBottom: 2 }}>{b}</li>
          ))}
        </ul>
      </div>

      {/* ── What's hidden until they inquire ─────────────────────────
          Useful context kept from the previous design — answers
          "what data does the client NOT see?". Quiet styling. */}
      <div style={{
        marginTop: 14, padding: "10px 12px",
        background: "rgba(11,11,13,0.02)", border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }} className="text-admin-ink-muted">
          Hidden until they inquire
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 12, lineHeight: 1.55 }} className="text-admin-ink-muted">
          <li>Full measurements (private — agency-controlled)</li>
          <li>Rate ranges (rate card visibility = {p.rateCard.visibility})</li>
          <li>Limits and wardrobe constraints</li>
          <li>Documents, emergency contact, agency-internal notes</li>
        </ul>
      </div>
    </DrawerShell>
  );
}

function PreviewKv({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        background: "rgba(11,11,13,0.02)",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 8,
      }}
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 10, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" }} className="text-admin-ink-muted">
        {label}
      </div>
      <div style={{ fontFamily: FONTS.body, fontSize: 12.5, marginTop: 3 }} className="text-admin-ink">{value}</div>
    </div>
  );
}
