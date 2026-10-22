// T7 — Talent Trust profile sub-tab.
//
// Server page showing the talent their current trust signals: verified badges
// they've earned + which trust touchpoints are not yet earned.
//
// TUL-1819: the talent shell HOSTS this page in its body (see
// pathIsTalentShellHosted), so it carries the normal sidebar and nav. Only ID
// verification has a working flow (Settings -> Verification); every other row
// is status text, never a dead button.
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

/**
 * Canonical set of trust touchpoints a talent CAN earn. Indexed by the
 * UI kind so we can show "earned" vs "not earned" for each. User-facing
 * text lives in ./_trust-copy.ts (en + es).
 */
type TouchpointDescriptor = {
  kind: LoadedTrustBadge["kind"] & TrustKind;
  /** True only when a working self-serve flow exists (ID verification). */
  selfActionable: boolean;
};

const TOUCHPOINTS: TouchpointDescriptor[] = [
  { kind: "id-verified", selfActionable: true },
  { kind: "age-verified", selfActionable: false },
  { kind: "background-check", selfActionable: false },
  { kind: "union", selfActionable: false },
  { kind: "agency-verified", selfActionable: false },
  { kind: "top-rated", selfActionable: false },
  { kind: "tulala-featured", selfActionable: false },
];

const SETTINGS_HREF = "/talent/settings";

export default async function PlatformTalentTrustPage() {
  const { tenantId } = await resolveTalentPageScope(Promise.resolve({}));
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
      <div className="max-w-[720px] px-7 py-8 font-sans">
        <h1 className="m-0 text-2xl font-semibold text-zinc-950">{c.title}</h1>
        <div className="mt-3 text-[13.5px] leading-relaxed text-zinc-500">{c.noProfile}</div>
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
    <div className="max-w-[920px] px-7 py-6 font-sans">
      <div className="mb-[22px]">
        <h1 className="m-0 text-[26px] font-semibold tracking-tight text-zinc-950">{c.heading}</h1>
        <div className="mt-1.5 max-w-[620px] text-[13px] leading-normal text-zinc-500">{c.lede}</div>
      </div>

      {/* Summary chip */}
      <div className="mb-[22px] inline-flex items-center gap-2 rounded-[10px] border border-emerald-700/20 bg-emerald-700/10 px-3.5 py-2.5 text-[13px]">
        <span className="text-base" aria-hidden>✓</span>
        <span className="font-semibold text-zinc-950">
          {c.signalsEarned(earnedCount, totalEarnable)}
        </span>
        {earnedCount === 0 && !earnedByKind.has("id-verified") && (
          <Link href={SETTINGS_HREF} className="font-medium text-blue-700 underline">
            {c.startWithId}
          </Link>
        )}
      </div>

      {/* Touchpoint list */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-900/10 bg-white">
        {TOUCHPOINTS.map((t, i) => {
          const isEarned = earnedByKind.has(t.kind);
          const tp = c.touchpoints[t.kind];
          const earnedBadge = earnedByKind.get(t.kind);
          return (
            <div
              key={t.kind}
              className={`grid grid-cols-[1fr_auto] gap-[18px] px-[18px] py-3.5 ${
                i === 0 ? "" : "border-t border-zinc-900/5"
              } ${isEarned ? "bg-emerald-700/10" : ""}`}
            >
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm" aria-hidden>
                    {isEarned ? "✓" : "○"}
                  </span>
                  <span className="text-sm font-semibold text-zinc-950">{tp.label}</span>
                  {isEarned && earnedBadge && (
                    <span className="rounded-full bg-emerald-700/10 px-[7px] py-0.5 text-[10.5px] font-semibold text-emerald-700">
                      {c.earnedOn(new Date(earnedBadge.earnedAt).toLocaleDateString(locale))}
                    </span>
                  )}
                </div>
                <div className="pl-[22px] text-[12.5px] leading-normal text-zinc-500">
                  {tp.description}
                </div>
              </div>
              <div className="flex items-center">
                {isEarned ? (
                  <span className="text-[11.5px] font-semibold text-emerald-700">{c.active}</span>
                ) : t.selfActionable ? (
                  <Link
                    href={SETTINGS_HREF}
                    className="rounded-md border border-blue-700/20 bg-blue-700/10 px-2.5 py-1 text-[11px] font-semibold text-blue-700 no-underline"
                  >
                    {tp.ctaLabel} →
                  </Link>
                ) : (
                  <span className="text-[11px] italic text-zinc-500">{tp.ctaLabel}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
