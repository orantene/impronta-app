/**
 * Sync talent_type taxonomy rows from profile shell Services state (prototype path).
 * When SkillSlotPanel is active, callers set `enabled: false` and skip this.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import {
  assignTaxonomyTermToProfile,
  removeTaxonomyTermFromProfile,
  resolveTenantTalentTypeTermId,
} from "@/lib/talent-taxonomy-service";

const TALENT_TYPE_KIND = "talent_type";

type Result = { ok: true; warnings?: string[] } | { ok: false; error: string };

export async function syncTalentTypeTaxonomyFromShellSlugs(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    talentProfileId: string;
    primarySlug: string | null;
    secondarySlugs: string[];
  },
): Promise<Result> {
  const { tenantId, talentProfileId } = params;
  let primary = params.primarySlug?.trim() || null;
  const rawSecondaries = [...new Set(params.secondarySlugs.map((s) => s.trim()).filter(Boolean))].filter(
    (s) => s !== primary,
  );
  let secondaries = rawSecondaries;
  if (!primary && secondaries.length > 0) {
    primary = secondaries[0] ?? null;
    secondaries = secondaries.slice(1);
  }

  const desired = new Set<string>([...(primary ? [primary] : []), ...secondaries]);

  const { data: assignments, error: asgErr } = await supabase
    .from("talent_profile_taxonomy")
    .select("taxonomy_term_id, relationship_type, is_primary, taxonomy_terms!inner(id, slug, kind)")
    .eq("talent_profile_id", talentProfileId);

  if (asgErr) {
    logServerError("profile-shell-taxonomy/list", asgErr);
    return { ok: false, error: "Could not load taxonomy." };
  }

  type Row = {
    taxonomy_term_id: string;
    relationship_type: string;
    taxonomy_terms: { id: string; slug: string; kind: string } | { id: string; slug: string; kind: string }[];
  };

  const currentTalentTypes: { termId: string; slug: string }[] = [];
  for (const row of (assignments ?? []) as Row[]) {
    const tt = row.taxonomy_terms;
    const term = Array.isArray(tt) ? tt[0] : tt;
    if (!term || term.kind !== TALENT_TYPE_KIND) continue;
    currentTalentTypes.push({ termId: term.id, slug: term.slug });
  }

  // Talent types already on the profile are preserved as-is on every save. A
  // workspace that later disables a type (or imports a talent already holding
  // one it doesn't offer) must NOT be blocked from saving the rest of the
  // profile — the whole batch (identity, bio, home base, dynamic fields)
  // otherwise fails on one stale secondary type. Tenant availability is only
  // enforced for NEWLY-added types, mirroring the Services picker (which hides
  // disabled types) and removeTalentTaxonomyBySlug (which never enforces).
  const currentSlugs = new Set(currentTalentTypes.map((c) => c.slug));

  for (const { termId, slug } of currentTalentTypes) {
    if (!desired.has(slug)) {
      const rm = await removeTaxonomyTermFromProfile(supabase, {
        talentProfileId,
        taxonomyTermId: termId,
      });
      if (!rm.ok) return { ok: false, error: rm.error };
    }
  }

  // An UNAVAILABLE talent type must not brick the whole profile save.
  //
  // The grandfather rule above (`enforceTenantAvailability: !currentSlugs.has`)
  // only protects types ALREADY persisted. A type sitting in the editor's draft
  // that the workspace has since disabled is "new" by that test, so it used to
  // abort the entire batch — identity, bio, home base, dynamic fields and every
  // OTHER service with it — over one entry the operator often cannot even see.
  // Live blast radius when this was found: 42 of 57 Impronta talents hold at
  // least one term the workspace disabled, against 353 disabled terms.
  //
  // Availability is a statement about ONE type, so it is now enforced per type:
  // the offending type is skipped and NAMED in a warning, and everything else
  // saves. This is the behaviour the grandfather comment above already promised
  // ("must NOT be blocked from saving the rest of the profile"), and it matches
  // the warning path the admin shell already uses for this same failure.
  const warnings: string[] = [];

  if (primary) {
    const resolved = await resolveTenantTalentTypeTermId(supabase, {
      tenantId,
      slugOrId: primary,
      relationshipType: "primary_role",
      enforceTenantAvailability: !currentSlugs.has(primary),
    });
    if (!resolved.ok) {
      warnings.push(resolved.error);
    } else {
      const asg = await assignTaxonomyTermToProfile(supabase, {
        talentProfileId,
        taxonomyTermId: resolved.termId,
        relationshipType: "primary_role",
        tenantId,
      });
      // A failed WRITE stays fatal — that is a real persistence failure, not a
      // policy decision about one type.
      if (!asg.ok) return { ok: false, error: asg.error };
    }
  }

  for (const slug of secondaries) {
    const resolved = await resolveTenantTalentTypeTermId(supabase, {
      tenantId,
      slugOrId: slug,
      relationshipType: "secondary_role",
      enforceTenantAvailability: !currentSlugs.has(slug),
    });
    if (!resolved.ok) {
      warnings.push(resolved.error);
      continue;
    }
    const asg = await assignTaxonomyTermToProfile(supabase, {
      talentProfileId,
      taxonomyTermId: resolved.termId,
      relationshipType: "secondary_role",
      tenantId,
    });
    if (!asg.ok) return { ok: false, error: asg.error };
  }

  return warnings.length > 0 ? { ok: true, warnings } : { ok: true };
}
