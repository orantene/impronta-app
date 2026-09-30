// Talent — Discover & apply to agencies + hubs (PR-G).
//
// Standalone server component. Lists agencies whose owners flipped
// `accepts_open_applications = TRUE`, plus hubs (agency_domains.kind='hub').
// Excludes anywhere the talent is already rostered or has a pending app.
// Hidden entirely while the talent has an active exclusive relationship —
// the loaders return [].
//
// Apply submission goes through `submitAgencyApplication` /
// `submitHubApplication` server actions (web/src/lib/talent/apply-actions.ts).
// Withdraw goes through `withdrawOwnApplication`.
//
// Capability gate (L48): `talent.agency.apply` / `talent.hub.apply`.
// Current policy: all plans (Basic / Pro / Portfolio) can apply — the gate
// is implicit: requireTalentSelf() ensures a talent profile exists.
// When a future spec restricts apply to a paid plan, add:
//   if (guard.talentProfile.talentPlanKey === "talent_basic" && APPLY_REQUIRES_PRO) notFound();
// here before the loaders.

import Link from "next/link";
import { redirect } from "next/navigation";

import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import {
  loadOpenAgenciesForTalent,
  loadOpenHubsForTalent,
  loadTalentOwnApplications,
} from "@/lib/talent/apply-loaders";
import { TalentApplyDiscoveryClient } from "@/components/talent/apply/TalentApplyDiscoveryClient";

export const dynamic = "force-dynamic";

export default async function TalentDiscoverAgenciesPage() {
  const guard = await requireTalentSelf();
  if (!guard.ok) {
    if (guard.code === "not_authenticated") {
      redirect("/login?next=/talent/discover-agencies");
    }
    // Talent profile missing — bounce to the My Site hub which has the
    // "create a talent profile" CTA.
    redirect("/talent/site");
  }

  const [openAgencies, openHubs, ownApplications] = await Promise.all([
    loadOpenAgenciesForTalent(guard.talentProfile.id),
    loadOpenHubsForTalent(guard.talentProfile.id),
    loadTalentOwnApplications(guard.talentProfile.id),
  ]);

  return (
    <TalentApplyDiscoveryClient
      openAgencies={openAgencies}
      openHubs={openHubs}
      ownApplications={ownApplications}
    />
  );
}
