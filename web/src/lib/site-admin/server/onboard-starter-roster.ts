/**
 * onboard-starter-roster.ts — the Free starter's DEMO ROSTER seed.
 *
 * Split out of `onboard-starter-content.ts` (which is at its 800-line cap) so
 * the workspace-shape gate below has room to be explained.
 *
 * THE GATE
 * ────────
 * This seed used to ask only two questions: what does the workspace PAY, and
 * how many roster rows does it already have? It never asked what the workspace
 * IS. So a `business` workspace — a restaurant, a clinic, a wedding band, every
 * signup that answered "I am a local business" on /get-started — was handed
 * three fabricated talent profiles (Luna Alvarez, Mateo Rossi, Sofia Bennett),
 * two of them featured with portraits, on a storefront that represents nobody.
 *
 * `rosterEnabled(normalizeWorkspaceType(...))` is the same predicate
 * `ensureDirectoryPageIfRosterActive` and `assertRosterWorkspace` already use,
 * and it fails OPEN toward "talent": an unknown or missing `workspace_type`
 * keeps the seed, so this can never silently strip an agency's starter roster.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { platformOwnedStamp } from "@/lib/media/ownership";
import { normalizeWorkspaceType, rosterEnabled } from "@/lib/saas/workspace-type";

import { resolveFreeStarterRosterSeedCount } from "./onboard-starter-content-policy";
import { FREE_STARTER_TALENT_SEEDS } from "./onboard-starter-content-entries";

export async function seedFreeStarterRosterProfiles(params: {
  client: SupabaseClient;
  tenantId: string;
  actorProfileId: string;
}): Promise<number> {
  const [{ data: agency }, visibleRes, totalRes] = await Promise.all([
    params.client
      .from("agencies")
      .select("plan_tier, talent_seat_limit, workspace_type")
      .eq("id", params.tenantId)
      .maybeSingle<{
        plan_tier: string | null;
        talent_seat_limit: number | null;
        workspace_type: string | null;
      }>(),
    params.client
      .from("agency_talent_roster")
      .select("id", { head: true, count: "exact" })
      .eq("tenant_id", params.tenantId)
      .eq("status", "active")
      .in("agency_visibility", ["site_visible", "featured"]),
    params.client
      .from("agency_talent_roster")
      .select("id", { head: true, count: "exact" })
      .eq("tenant_id", params.tenantId)
      .neq("status", "removed"),
  ]);

  // WORKSPACE SHAPE FIRST. A business workspace represents nobody, so no
  // number of free seats makes three demo models the right first impression.
  if (!rosterEnabled(normalizeWorkspaceType(agency?.workspace_type))) return 0;

  const targetCount = resolveFreeStarterRosterSeedCount({
    planTier: agency?.plan_tier ?? null,
    seatLimit: agency?.talent_seat_limit ?? null,
    publicVisibleCount: visibleRes.count ?? 0,
    totalRosterCount: totalRes.count ?? 0,
  });
  if (targetCount <= 0) return 0;

  const { data: talentTypeTerms } = await params.client
    .from("taxonomy_terms")
    .select("id")
    .eq("kind", "talent_type")
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .limit(targetCount);

  let seeded = 0;
  for (let index = 0; index < targetCount; index += 1) {
    const template = FREE_STARTER_TALENT_SEEDS[index % FREE_STARTER_TALENT_SEEDS.length]!;
    const { data: codeRow, error: codeError } =
      await params.client.rpc("generate_profile_code");
    if (codeError || !codeRow) {
      logServerError("onboardStarterContent.seedRoster.profileCode", codeError ?? "missing profile code");
      continue;
    }

    const { data: inserted, error: insertError } = await params.client
      .from("talent_profiles")
      .insert({
        profile_code: String(codeRow),
        display_name: template.displayName,
        first_name: template.firstName,
        last_name: template.lastName,
        short_bio: template.shortBio,
        workflow_status: "approved",
        visibility: "public",
        // Template content: visible on THIS workspace's storefront, but never
        // auto-enrolled into the platform hub. Without this marker
        // `trg_talent_auto_enroll_hub` published every seeded copy to
        // tulala.digital/directory, so each new workspace added 5 more clones
        // of the same 5 demo people (33 accumulated before 20260806002850).
        is_starter_seed: true,
        membership_tier: "free",
        membership_status: "active",
        is_featured: index < 2,
        featured_level: index < 2 ? 1 : 0,
        featured_position: index + 1,
      })
      .select("id")
      .single<{ id: string }>();

    if (insertError || !inserted?.id) {
      logServerError("onboardStarterContent.seedRoster.insertTalent", insertError ?? "missing talent id");
      continue;
    }

    const { error: rosterError } = await params.client
      .from("agency_talent_roster")
      .insert({
        tenant_id: params.tenantId,
        source_workspace_id: params.tenantId,
        talent_profile_id: inserted.id,
        source_type: "agency_created",
        status: "active",
        agency_visibility: index < 2 ? "featured" : "site_visible",
        hub_visibility_status: "not_submitted",
        is_primary: false,
        added_by: params.actorProfileId,
      });

    if (rosterError) {
      logServerError("onboardStarterContent.seedRoster.insertRoster", rosterError);
      await params.client.from("talent_profiles").delete().eq("id", inserted.id);
      continue;
    }

    // Demo headshot: a media_assets row pointing at a root-relative
    // `web/public` asset. approval_state=approved + variant_kind=card is
    // exactly what the card-thumbnail resolvers rank first, so the seeded
    // roster renders real editorial portraits instead of blank dark cards
    // (owner rule: editorial/real photos, never placeholder boxes).
    const { error: mediaError } = await params.client
      .from("media_assets")
      .insert({
        tenant_id: params.tenantId,
        owner_talent_profile_id: inserted.id,
        // Ownership truth (plan §5a / P1) — seeded demo imagery ships with
        // the platform, so it is 'platform'-owned, not the workspace's and
        // not the demo talent's.
        ...platformOwnedStamp(params.actorProfileId),
        bucket_id: "media-public",
        storage_path: template.portraitPath,
        variant_kind: "card",
        approval_state: "approved",
        sort_order: 0,
      });
    if (mediaError) {
      // Non-fatal: the profile still works; the card degrades to initials.
      logServerError("onboardStarterContent.seedRoster.insertMedia", mediaError);
    }

    const typeTermId = talentTypeTerms?.[index]?.id;
    if (typeTermId) {
      const { error: taxonomyError } = await params.client
        .from("talent_profile_taxonomy")
        .insert({
          talent_profile_id: inserted.id,
          taxonomy_term_id: typeTermId,
          is_primary: true,
          // REQUIRED. Omitting this defaults the column to 'attribute', which
          // `validate_talent_profile_taxonomy_relationship` rejects for a
          // talent_type term — so every seeded starter profile silently ended
          // up with no role at all (blank type label on the storefront card,
          // invisible to the directory's type facet).
          relationship_type: "primary_role",
        });
      if (taxonomyError) {
        logServerError("onboardStarterContent.seedRoster.insertTaxonomy", taxonomyError);
      }
    }

    seeded += 1;
  }

  return seeded;
}
