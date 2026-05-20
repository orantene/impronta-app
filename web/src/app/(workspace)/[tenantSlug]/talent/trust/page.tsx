// T7 — Talent Trust profile sub-tab.
//
// Standalone page showing the talent their current trust signals:
// verified badges they've earned + which trust touchpoints are
// available but not yet earned (with "Start verification" actions).
//
// Lives outside the mega talent.tsx shell so the audit gap can ship
// without unblocking that extraction. Reachable directly at
// /<tenant>/talent/trust; the existing TalentProfile page can link to
// it later when the next polish pass touches the editor.
//
// Spec: project_client_trust_badges.md + project_discover_unified.md
// §10 (talent audit T7 / T8).

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTrustBadgesForTalents, type LoadedTrustBadge }
  from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent-trust-badges";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  success:    "#1A7348",
  successSoft: "rgba(26,115,72,0.10)",
  amber:      "#D69E2E",
  amberSoft:  "rgba(214,158,46,0.10)",
} as const;

/**
 * Canonical set of trust touchpoints a talent CAN earn. Indexed by the
 * UI kind so we can show "earned" vs "not earned" for each.
 */
type TouchpointDescriptor = {
  kind: LoadedTrustBadge["kind"];
  label: string;
  description: string;
  /** Action copy when not yet earned. */
  ctaLabel: string;
  /** Tone — used to grey out non-actionable rows. */
  selfActionable: boolean;
};

const TOUCHPOINTS: TouchpointDescriptor[] = [
  {
    kind: "id-verified",
    label: "ID verified",
    description: "Government-issued ID confirmed by Stripe Identity. Required for paid bookings.",
    ctaLabel: "Start ID verification",
    selfActionable: true,
  },
  {
    kind: "age-verified",
    label: "Age verified",
    description: "Confirmed via ID verification + date of birth. Automatic side-effect of ID step.",
    ctaLabel: "Earned via ID verification",
    selfActionable: false,
  },
  {
    kind: "background-check",
    label: "Background-checked",
    description: "Optional third-party check. Some clients filter by this badge.",
    ctaLabel: "Request background check",
    selfActionable: true,
  },
  {
    kind: "union",
    label: "Union / license",
    description: "Upload union card or professional license. Renews yearly.",
    ctaLabel: "Upload credentials",
    selfActionable: true,
  },
  {
    kind: "agency-verified",
    label: "Agency-verified",
    description: "Your primary agency has confirmed your roster status. Auto-set when an Agency-plan workspace adds you with exclusivity confirmed.",
    ctaLabel: "Agency-driven (no action needed)",
    selfActionable: false,
  },
  {
    kind: "top-rated",
    label: "Top-rated",
    description: "Awarded after 10+ booked-and-completed jobs with 4.7+ avg client rating.",
    ctaLabel: "Earn via booked work",
    selfActionable: false,
  },
  {
    kind: "tulala-featured",
    label: "Tulala featured",
    description: "Editorial pick — talent showcased on the Tulala discovery surface.",
    ctaLabel: "Curated by Tulala team",
    selfActionable: false,
  },
];

export default async function TalentTrustPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // Resolve the talent's own profile id from auth.uid().
  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();
  const { data: profile, error: profileErr } = await supabase
    .from("talent_profiles")
    .select("id, display_name, workflow_status")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (profileErr) logServerError("talent.trust.profileLoad", profileErr);
  if (!profile) {
    // User has no talent profile yet — show a generic empty state.
    return (
      <div style={{ fontFamily: FONT, padding: "32px 28px", maxWidth: 720 }}>
        <h1 style={{ margin: 0, fontSize: 24, color: C.ink, fontWeight: 600 }}>
          Trust signals
        </h1>
        <div style={{ marginTop: 12, fontSize: 13.5, color: C.inkMuted, lineHeight: 1.55 }}>
          You don&apos;t have a talent profile yet. Create one first to start
          earning verification badges.
        </div>
      </div>
    );
  }

  const talentProfileId = profile.id as string;
  const earned: LoadedTrustBadge[] = await loadTrustBadgesForTalents(
    [talentProfileId],
    scope.tenantId,
  );
  const earnedByKind = new Map(earned.map((b) => [b.kind, b]));

  const earnedCount = earned.length;
  const totalEarnable = TOUCHPOINTS.length;

  return (
    <div style={{ fontFamily: FONT, padding: "24px 28px", maxWidth: 920 }}>
      <div style={{ marginBottom: 18 }}>
        <Link
          href={`/${tenantSlug}/talent/profile`}
          style={{ fontSize: 11.5, color: C.inkMuted, textDecoration: "none" }}
        >
          ← Back to profile
        </Link>
      </div>

      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, color: C.ink, letterSpacing: -0.3 }}>
          Your trust signals
        </h1>
        <div style={{ fontSize: 13, color: C.inkMuted, marginTop: 6, lineHeight: 1.5, maxWidth: 620 }}>
          Verification badges signal trust to clients before they
          inquire. Some are self-serve (ID, license); others are earned
          (top-rated, agency-verified) or curated (Tulala featured).
          Earning more badges typically increases inquiry volume.
        </div>
      </div>

      {/* Summary chip */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "10px 14px", background: C.successSoft,
        border: `1px solid ${C.success}33`, borderRadius: 10, marginBottom: 22,
        fontSize: 13,
      }}>
        <span style={{ fontSize: 16 }} aria-hidden>✓</span>
        <span style={{ color: C.ink, fontWeight: 600 }}>
          {earnedCount} of {totalEarnable} signals earned
        </span>
        {earnedCount === 0 && (
          <span style={{ color: C.inkMuted, fontWeight: 500 }}>
            · start with ID verification below
          </span>
        )}
      </div>

      {/* Touchpoint list */}
      <div style={{
        display: "flex", flexDirection: "column", gap: 0,
        background: C.cardBg, border: `1px solid ${C.border}`,
        borderRadius: 12, overflow: "hidden",
      }}>
        {TOUCHPOINTS.map((t, i) => {
          const isEarned = earnedByKind.has(t.kind);
          const earnedBadge = earnedByKind.get(t.kind);
          return (
            <div
              key={t.kind}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 18,
                padding: "14px 18px",
                borderTop: i === 0 ? "none" : `1px solid ${C.borderSoft}`,
                background: isEarned ? C.successSoft : "transparent",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14 }} aria-hidden>
                    {isEarned ? "✓" : "○"}
                  </span>
                  <span style={{
                    fontSize: 14, fontWeight: 600, color: C.ink,
                  }}>
                    {t.label}
                  </span>
                  {isEarned && earnedBadge && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 600, color: C.success,
                      padding: "2px 7px", borderRadius: 999,
                      background: "rgba(26,115,72,0.10)",
                    }}>
                      Earned {new Date(earnedBadge.earnedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: C.inkMuted, lineHeight: 1.5, paddingLeft: 22 }}>
                  {t.description}
                </div>
              </div>
              <div className="flex items-center">
                {isEarned ? (
                  <span style={{
                    fontSize: 11.5, color: C.success, fontWeight: 600,
                  }}>
                    ✓ Active
                  </span>
                ) : t.selfActionable ? (
                  <span style={{
                    fontSize: 11, color: C.accent, fontWeight: 600,
                    padding: "4px 10px", borderRadius: 6,
                    background: C.accentSoft, border: `1px solid ${C.accent}33`,
                  }}>
                    {t.ctaLabel} →
                  </span>
                ) : (
                  <span style={{
                    fontSize: 11, color: C.inkDim, fontStyle: "italic",
                  }}>
                    {t.ctaLabel}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 18, padding: "12px 16px", background: C.amberSoft,
        border: `1px solid ${C.amber}33`, borderRadius: 10,
        fontSize: 12, color: C.ink, lineHeight: 1.55,
      }}>
        <strong>Self-serve verification is rolling out next sprint.</strong>{" "}
        For now, ID verification is started from{" "}
        <Link href={`/${tenantSlug}/talent/settings`} style={{ color: C.accent, textDecoration: "underline" }}>
          Settings → Account
        </Link>{" "}— other touchpoints are earned automatically or via
        agency action.
      </div>
    </div>
  );
}
