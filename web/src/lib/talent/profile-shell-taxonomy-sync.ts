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

type Result = { ok: true } | { ok: false; error: string };

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

  for (const { termId, slug } of currentTalentTypes) {
    if (!desired.has(slug)) {
      const rm = await removeTaxonomyTermFromProfile(supabase, {
        talentProfileId,
        taxonomyTermId: termId,
      });
      if (!rm.ok) return { ok: false, error: rm.error };
    }
  }

  if (primary) {
    const resolved = await resolveTenantTalentTypeTermId(supabase, {
      tenantId,
      slugOrId: primary,
      relationshipType: "primary_role",
    });
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const id = resolved.termId;
    const asg = await assignTaxonomyTermToProfile(supabase, {
      talentProfileId,
      taxonomyTermId: id,
      relationshipType: "primary_role",
    });
    if (!asg.ok) return { ok: false, error: asg.error };
  }

  for (const slug of secondaries) {
    const resolved = await resolveTenantTalentTypeTermId(supabase, {
      tenantId,
      slugOrId: slug,
      relationshipType: "secondary_role",
    });
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const asg = await assignTaxonomyTermToProfile(supabase, {
      talentProfileId,
      taxonomyTermId: resolved.termId,
      relationshipType: "secondary_role",
    });
    if (!asg.ok) return { ok: false, error: asg.error };
  }

  return { ok: true };
}
