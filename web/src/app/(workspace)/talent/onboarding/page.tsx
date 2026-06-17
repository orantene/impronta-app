// Guided talent onboarding wizard (MVP).
//
// A focused, stepped flow that walks a newly-provisioned talent through the
// fields the canonical completeness checklist requires before they can
// publish / go live. It is an ADDITIVE alternate path to the existing
// drawer-based editor — nothing here replaces the dashboard.
//
// Architecture decisions (see PR description):
//   - Completeness is the SERVER-canonical model: this page loads
//     `loadTalentDashboardData()` and passes the resulting `checklist`,
//     `completionScore`, `missingItems`, and `canSubmit` straight into the
//     wizard. We do NOT re-derive any completeness logic.
//   - Each step writes through an EXISTING talent self-* server action
//     (updateSelfIdentity / syncSelfTalentTypeTaxonomyFromShell /
//     saveSelfLanguages / updateSelfLocation / updateSelfRates /
//     startTalentOnboarding / updateSelfProfileWorkflowFromShell). No new
//     mutation paths were created.
//   - The route opts out of the heavy dashboard shell (see talent/layout.tsx).

import { redirect } from "next/navigation";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTalentDashboardData } from "@/lib/talent-dashboard-data";
import { getTalentProfileEditorDataForSelf } from "@/lib/server-actions/talent-self-profile-sections";
import {
  getEnabledParentCategoriesForPickerAsTalent,
} from "@/lib/server-actions/talent-self-services";
import { getActiveTalentAgencyContext } from "@/lib/talent/active-agency-context";
import { loadCurrentTalentPayoutSnapshot } from "@/lib/server-actions/talent-self";
import { TalentOnboardingWizard, type OnboardingPrefill } from "./TalentOnboardingWizard";

type RateRow = OnboardingPrefill["ratesData"][number];

function coerceRateRows(value: unknown): RateRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row): RateRow[] => {
    if (typeof row !== "object" || row === null) return [];
    const r = row as Record<string, unknown>;
    const amount = typeof r.amount === "number" ? r.amount : Number(r.amount);
    if (!Number.isFinite(amount)) return [];
    return [
      {
        typeId: typeof r.typeId === "string" ? r.typeId : "default",
        amount,
        currency: typeof r.currency === "string" ? r.currency : "USD",
        unit: typeof r.unit === "string" ? r.unit : "day",
      },
    ];
  });
}

function englishBio(bios: unknown): string {
  if (!Array.isArray(bios)) return "";
  const en = bios.find(
    (b): b is { locale: string; text: string } =>
      typeof b === "object" && b !== null && (b as { locale?: unknown }).locale === "en",
  );
  return en?.text ?? "";
}

export const dynamic = "force-dynamic";

export default async function TalentOnboardingPage() {
  const session = await getCachedActorSession();
  if (!session.user) {
    redirect("/login?next=/talent/onboarding");
  }

  // Canonical completeness + profile snapshot. The same loader the roster /
  // dashboard reads — single source of truth for the progress card and the
  // publish gate.
  const load = await loadTalentDashboardData();
  if (!load.ok) {
    // No linked talent profile (or no DB) → there's nothing to onboard. Send
    // them to the talent root, which routes them to the right landing.
    redirect("/talent");
  }
  const data = load.data;
  const talentProfileId = data.profile.id;

  // Prefill values for the field steps come from the existing self editor-data
  // loader (the same one the profile-shell drawer hydrates from).
  const editorRes = await getTalentProfileEditorDataForSelf({
    talent_profile_id: talentProfileId,
  });
  const editor = editorRes.ok ? editorRes.data : null;

  // Discipline / talent-type picker options (parent categories). Secondary
  // type/group lookups happen client-side on demand via the self picker action.
  const parentsRes = await getEnabledParentCategoriesForPickerAsTalent({
    talent_profile_id: talentProfileId,
  });
  const parentCategories = parentsRes.ok ? parentsRes.parents : [];

  // Active agency context — needed for the Connect onboarding return URL.
  const activeAgency = await getActiveTalentAgencyContext(talentProfileId);

  // Connect payout snapshot (drives whether the Payout step shows "connect" vs
  // "already set up").
  const payout = await loadCurrentTalentPayoutSnapshot();

  return (
    <TalentOnboardingWizard
      talentProfileId={talentProfileId}
      checklist={data.checklist}
      completionScore={data.completionScore}
      canSubmit={data.canSubmit}
      workflowStatus={data.profile.workflow_status}
      mediaCount={data.mediaCount}
      previewHref={data.previewHref}
      tenantSlug={activeAgency?.slug ?? null}
      parentCategories={parentCategories}
      payoutStatus={payout.status}
      prefill={{
        displayName: editor?.display_name ?? data.profile.display_name ?? "",
        primaryTalentSlug: editor?.shell_primary_talent_slug ?? null,
        secondaryTalentSlugs: editor?.shell_secondary_talent_slugs ?? [],
        homeBase: editor?.home_city_text ?? "",
        gender: editor?.gender ?? "",
        dateOfBirth: editor?.date_of_birth ?? "",
        phone: editor?.phone ?? "",
        shortBio: englishBio(editor?.bios),
        ratesData: coerceRateRows(editor?.rates_data),
      }}
    />
  );
}
