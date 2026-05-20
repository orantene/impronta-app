"use client";

import { useState } from "react";
import { Divider, Icon, PrimaryButton, SecondaryButton, SecondaryCard } from "../../primitives";
import { COLORS, FONTS, MY_TALENT_PROFILE, TALENT_PROFILES_BY_ID, TAXONOMY, applyProfileOverride, buildFreshTalentProfile, clearPendingReview, computeProfileCompleteness, getPendingReviewForRoster, getProfileById, useAdminShell, usePendingReviewSubscription, useProfileOverrideSubscription } from "../../state";
import { PageHeader } from "../shared/page-chrome-1";
import { TierBreakdown } from "../shared/profile-1";
import { AllSectionsGrid, EngagementStrip, ProfileHero } from "../shared/profile-sections-1";
import { PersonalPageBand } from "../shared/profile-sections-2";



export function MyProfilePage() {
  const { openDrawer, toast, bridgeTalentSelfProfile } = useAdminShell();
  // Use the real profile id from the bridge when available; fall back to mock.
  const selfTalentId = bridgeTalentSelfProfile?.id ?? "t1";
  // Subscribe to override store + read the MERGED profile. Edits in
  // the workspace/self profile shell that finalSubmit() into the
  // override store now flow through here without a refresh.
  useProfileOverrideSubscription();
  usePendingReviewSubscription();
  const pendingMine = getPendingReviewForRoster({ id: selfTalentId, name: bridgeTalentSelfProfile?.displayName ?? MY_TALENT_PROFILE.name });
  // For display: when the live bridge has a real talent profile that
  // ISN'T in the prototype mock index (i.e., a genuine signed-in talent),
  // build a fresh profile scaffold from bridge fields. Otherwise fall
  // back to mock data (Marta) so the prototype demo still works.
  const baseProfile = applyProfileOverride(
    selfTalentId,
    bridgeTalentSelfProfile && !TALENT_PROFILES_BY_ID[selfTalentId]
      ? buildFreshTalentProfile(bridgeTalentSelfProfile)
      : getProfileById(selfTalentId),
  );
  // Catalog-driven completeness — replaces the static `completeness`
  // int + `missing` array on the seed. Counts applicable fields per
  // primaryType, counts filled, returns percent + a missing list.
  // As the catalog grows or the talent fills more fields, the math
  // updates automatically — no hand-tuned numbers.
  const catalogCompleteness = computeProfileCompleteness(
    baseProfile,
    [baseProfile.primaryType, ...baseProfile.secondaryTypes]
  );
  // Override both `completeness` (number) AND `missing` (string[]) so
  // every downstream consumer reads the catalog-derived values.
  const p = {
    ...baseProfile,
    completeness: catalogCompleteness.percent,
    missing: catalogCompleteness.missing.map(m => m.label),
  };
  const m = p.measurements;

  // Map missing fields to the unified profile-shell section that
  // completes them. Single source of truth — every "fix this" click
  // deep-links into talent-profile-shell with mode "edit-self" instead
  // of opening a parallel mini-drawer with its own field shape +
  // privacy semantics. The legacy talent-* mini-drawers (talent-
  // polaroids, talent-rate-card, …) become unreachable from this
  // path; they stay registered for backwards-compat with anything
  // else that still calls them, but the talent-side dashboard funnels
  // entirely through the shell now.
  const missingFieldRoutes: { label: string; section: string }[] =
    p.missing.map((field) => {
      const lower = field.toLowerCase();
      if (lower.includes("polaroid"))    return { label: field, section: "polaroids" };
      if (lower.includes("rate"))        return { label: field, section: "rates" };
      if (lower.includes("showreel"))    return { label: field, section: "media" };
      if (lower.includes("measurement")) return { label: field, section: "details" };
      if (lower.includes("document") || lower.includes("file")) return { label: field, section: "files" };
      if (lower.includes("portfolio") || lower.includes("photo") || lower.includes("album")) return { label: field, section: "albums" };
      if (lower.includes("language"))    return { label: field, section: "languages" };
      if (lower.includes("availab"))     return { label: field, section: "availability" };
      if (lower.includes("skill"))       return { label: field, section: "refinement" };
      if (lower.includes("credit"))      return { label: field, section: "credits" };
      if (lower.includes("limit"))       return { label: field, section: "limits" };
      if (lower.includes("verif"))       return { label: field, section: "verifications" };
      // Default — land on Identity (fields like name / pronouns / DOB).
      return { label: field, section: "identity" };
    });
  const openSection = (section: string) => openDrawer("talent-profile-shell", { mode: "edit-self", talentId: selfTalentId, section });
  const [completenessOpen, setCompletenessOpen] = useState(false);

  // Phase C4 — derive role labels for the page header. Primary +
  // secondary roles render as "Model · also Host" so the multi-role
  // identity is obvious at the top of the dashboard.
  const primaryRoleLabel = TAXONOMY.find(t => t.id === p.primaryType)?.label ?? "Talent";
  const secondaryRoleLabels = p.secondaryTypes
    .map(id => TAXONOMY.find(t => t.id === id)?.label)
    .filter((l): l is string => !!l);
  const roleSummary = secondaryRoleLabels.length > 0
    ? `${primaryRoleLabel} · also ${secondaryRoleLabels.join(" · ")}`
    : primaryRoleLabel;

  return (
    <>
      <PageHeader
        title={bridgeTalentSelfProfile?.displayName ?? p.name}
        subtitle={`${bridgeTalentSelfProfile?.primaryTypeLabel ?? roleSummary}${p.measurementsSummary ? ` · ${p.measurementsSummary}` : ""}${(bridgeTalentSelfProfile?.homeCity ?? p.city) ? ` · ${bridgeTalentSelfProfile?.homeCity ?? p.city}` : ""}`}
        actions={
          // Header actions are intentionally compact (size="sm"). The
          // md size is for body-level CTAs; in a header alongside the
          // h1, md reads as too-chunky. Both buttons match width feel
          // because they're sized identically and the icon adds the
          // ~9px the longer label needs to balance.
          <>
            <SecondaryButton size="sm" onClick={() => openDrawer("talent-public-preview")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="external" size={11} /> Preview as client
              </span>
            </SecondaryButton>
            <PrimaryButton size="sm" onClick={() => openSection("identity")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="pencil" size={11} /> Edit profile
              </span>
            </PrimaryButton>
          </>
        }
      />

      {/* Audit fix #2 — pending-review banner. Shows when Marta has
          submitted a self-edit that the agency hasn't reviewed yet,
          plus a soft "withdraw" affordance so she can pull it back if
          she changes her mind before the agency acts. */}
      {pendingMine && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            marginBottom: 14,
            borderRadius: 12,
            background: "rgba(46,124,209,0.06)",
            border: `1px solid rgba(46,124,209,0.22)`,
            fontFamily: FONTS.body,
          }}
        >
          <span aria-hidden className="text-sm">⏳</span>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1f4d8a" }}>
              Submitted to your agency · waiting for review
            </div>
            <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">
              {pendingMine.note} · usually reviewed within 1 business day.
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              clearPendingReview(pendingMine.talentId);
              toast("Submission withdrawn — your changes are still saved");
            }}
            style={{
              padding: "5px 11px",
              borderRadius: 999,
              border: `1px solid rgba(46,124,209,0.4)`,
              background: "#fff",
              color: "#1f4d8a",
              fontFamily: FONTS.body,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Withdraw
          </button>
        </div>
      )}

      {p.completeness < 100 && (
        <div
          style={{
            marginBottom: 16,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 14,
            fontFamily: FONTS.body,
            overflow: "hidden",
          }}
        >
          {/* ── Collapsed header — always visible, click to expand ── */}
          <button
            type="button"
            onClick={() => setCompletenessOpen(o => !o)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "16px 20px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: FONTS.body,
            }}
          >
            {/* SVG progress ring */}
            <svg width="64" height="64" viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
              <circle cx="32" cy="32" r="26" fill="none" stroke={COLORS.borderSoft} strokeWidth="5" />
              <circle
                cx="32" cy="32" r="26"
                fill="none"
                stroke={COLORS.indigo}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 26}`}
                strokeDashoffset={`${2 * Math.PI * 26 * (1 - p.completeness / 100)}`}
                transform="rotate(-90 32 32)"
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
              <text
                x="32" y="36"
                textAnchor="middle"
                fontFamily={FONTS.display}
                fontSize="13"
                fontWeight="700"
                fill={COLORS.indigoDeep}
              >{p.completeness}%</text>
            </svg>

            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }} className="text-admin-ink">
                Profile {p.completeness}% complete
              </div>
              <div className="text-admin-ink-muted text-admin-12h">
                {missingFieldRoutes.length} field{missingFieldRoutes.length === 1 ? "" : "s"} left · tap to see what&apos;s missing
              </div>
            </div>

            <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, transform: completenessOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }} className="bg-admin-surface-alt text-admin-ink-muted">
              ›
            </span>
          </button>

          {/* ── Thin progress bar ── */}
          <div style={{ height: 3, background: COLORS.borderSoft, margin: "0 20px" }}>
            <div style={{
              height: "100%",
              width: `${p.completeness}%`,
              background: COLORS.indigo,
              borderRadius: 999,
              transition: "width 0.6s ease",
            }} />
          </div>

          {/* ── Accordion body ── */}
          {completenessOpen && (
            <div style={{ padding: "16px 20px 20px" }}>
              <TierBreakdown
                missing={catalogCompleteness.missing}
                primaryType={baseProfile.primaryType}
                secondaryTypes={baseProfile.secondaryTypes}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                {missingFieldRoutes.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openSection(r.section); }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "5px 11px",
                      background: COLORS.indigoSoft,
                      border: `1px solid rgba(91,107,160,0.20)`,
                      borderRadius: 999,
                      cursor: "pointer",
                      fontFamily: FONTS.body,
                      fontSize: 11.5,
                      fontWeight: 500,
                      color: COLORS.indigoDeep,
                    }}
                  >
                    <Icon name="plus" size={10} stroke={2} color={COLORS.indigoDeep} />
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Hero band ──────────────────────────────────────────────── */}
      <ProfileHero />

      {/* ── All sections — primary nav into the profile shell ─────── */}
      <Divider label="Edit sections" />
      <AllSectionsGrid openSection={openSection} />

      {/* ── Engagement strip ──────────────────────────────────────── */}
      <div className="mt-4">
        <EngagementStrip profile={p} />
      </div>

      {/* ── Public profile URL ────────────────────────────────────── */}
      <div className="mt-3">
        <SecondaryCard
          title="Public profile"
          description={p.publicUrl
            ? `Lives at ${p.publicUrl}. Always reflects your latest published edits.`
            : "Not published yet — fill in the essentials to get a public URL."}
          affordance={p.publicUrl ? "Open in new tab" : undefined}
          onClick={p.publicUrl ? () => window.open(`https://${p.publicUrl}`, "_blank") : undefined}
        >
          {p.publicUrl && (
            <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, border: `1px solid rgba(15,79,62,0.18)`, display: "flex", alignItems: "center", gap: 10 }} className="bg-admin-surface-alt">
              <Icon name="external" size={12} color={COLORS.accentDeep} />
              <span style={{ fontFamily: FONTS.mono, fontSize: 11.5 }} className="text-admin-ink">{p.publicUrl}</span>
            </div>
          )}
        </SecondaryCard>
      </div>

      {/* ── Personal page (premium subscription tier) ─────────────── */}
      <Divider label="Personal page" />
      <PersonalPageBand />
    </>
  );
}
