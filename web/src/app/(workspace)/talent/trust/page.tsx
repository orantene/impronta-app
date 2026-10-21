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
import { resolveTalentPageScope } from "@/lib/talent/platform-talent-context";
import { logServerError } from "@/lib/server/safe-error";
import { getRequestLocale } from "@/i18n/request-locale";
import { trustCopy, type TrustKind } from "./_trust-copy";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug?: string }>;

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.6)",
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
 * UI kind so we can show "earned" vs "not earned" for each. User-facing
 * text lives in ./_trust-copy.ts (en + es).
 */
type TouchpointDescriptor = {
  kind: LoadedTrustBadge["kind"] & TrustKind;
  /** Tone: used to grey out non-actionable rows. */
  selfActionable: boolean;
};

const TOUCHPOINTS: TouchpointDescriptor[] = [
  { kind: "id-verified", selfActionable: true },
  { kind: "age-verified", selfActionable: false },
  { kind: "background-check", selfActionable: true },
  { kind: "union", selfActionable: true },
  { kind: "agency-verified", selfActionable: false },
  { kind: "top-rated", selfActionable: false },
  { kind: "tulala-featured", selfActionable: false },
];

export default async function PlatformTalentTrustPage() {
  const { tenantSlug, tenantId } = await resolveTalentPageScope(Promise.resolve({}));
  const locale = await getRequestLocale();
  const c = trustCopy(locale);
  const session = await getCachedActorSession();
  if (!session.user) notFound();

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
          {c.title}
        </h1>
        <div style={{ marginTop: 12, fontSize: 13.5, color: C.inkMuted, lineHeight: 1.55 }}>
          {c.noProfile}
        </div>
      </div>
    );
  }

  const talentProfileId = profile.id as string;
  const earned: LoadedTrustBadge[] = await loadTrustBadgesForTalents(
    [talentProfileId],
    tenantId,
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
          {c.backToProfile}
        </Link>
      </div>

      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, color: C.ink, letterSpacing: -0.3 }}>
          {c.heading}
        </h1>
        <div style={{ fontSize: 13, color: C.inkMuted, marginTop: 6, lineHeight: 1.5, maxWidth: 620 }}>
          {c.lede}
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
          {c.signalsEarned(earnedCount, totalEarnable)}
        </span>
        {earnedCount === 0 && (
          <span style={{ color: C.inkMuted, fontWeight: 500 }}>
            {c.startWithId}
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
          const tp = c.touchpoints[t.kind];
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
                    {tp.label}
                  </span>
                  {isEarned && earnedBadge && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 600, color: C.success,
                      padding: "2px 7px", borderRadius: 999,
                      background: "rgba(26,115,72,0.10)",
                    }}>
                      {c.earnedOn(new Date(earnedBadge.earnedAt).toLocaleDateString(locale))}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: C.inkMuted, lineHeight: 1.5, paddingLeft: 22 }}>
                  {tp.description}
                </div>
              </div>
              <div className="flex items-center">
                {isEarned ? (
                  <span style={{
                    fontSize: 11.5, color: C.success, fontWeight: 600,
                  }}>
                    {c.active}
                  </span>
                ) : t.selfActionable ? (
                  <span style={{
                    fontSize: 11, color: C.accent, fontWeight: 600,
                    padding: "4px 10px", borderRadius: 6,
                    background: C.accentSoft, border: `1px solid ${C.accent}33`,
                  }}>
                    {tp.ctaLabel} →
                  </span>
                ) : (
                  <span style={{
                    fontSize: 11, color: C.inkDim, fontStyle: "italic",
                  }}>
                    {tp.ctaLabel}
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
        <strong>{c.rolloutBold}</strong>{" "}
        {c.rolloutBefore}{" "}
        <Link href={`/${tenantSlug}/talent/settings`} style={{ color: C.accent, textDecoration: "underline" }}>
          {c.settingsAccount}
        </Link>{" "}
        {c.rolloutAfter}
      </div>
    </div>
  );
}
