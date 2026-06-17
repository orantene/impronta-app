import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { deriveSiteSlug } from "./derive-site-slug";
import {
  buildDefaultShellTree,
  buildStarterHomePageTree,
} from "../default-max-site-trees";
import {
  buildDefaultTalentProfileTree,
  hydrateTalentTree,
} from "../default-talent-tree";
import { talentProfileTokens } from "../default-talent-template";
import { loadDefaultTalentFreeformContext } from "./default-talent-context";

export type ProvisionMaxSiteResult =
  | {
      ok: true;
      created: boolean;
      siteId: string;
      siteSlug: string;
    }
  | { ok: false; error: string };

const STARTER_HOME_SLUG = "home";

/**
 * Build the starter HOME page `blocks` for a freshly-provisioned Max site.
 *
 * Reuses the talent PROFILE's enriched freeform tree + hydration so a brand-new
 * site home already looks premium (hero with name + photo, About bio, Services
 * grid, gallery, inquiry CTA) before the talent touches the editor — instead of
 * the bare "Your headline here" placeholder.
 *
 * `maxSiteUrl` is passed EMPTY on purpose: this IS the talent's own site home, so
 * a self-referential "♔ MAX / Visit my site" badge would link the page to
 * itself. The empty token makes `hydrateTalentTree → pruneEmptyMaxBadge` drop the
 * whole badge container, so no self-link renders.
 *
 * Falls back to the minimal `buildStarterHomePageTree` when the talent has no
 * loadable profile data (no profile row / no service role), so provisioning never
 * fails to seed *a* valid home tree. Degrade-safe — any load error falls back too.
 */
async function buildStarterHomeBlocks(
  talentProfileId: string,
  displayName: string,
): Promise<BuilderNode[]> {
  try {
    const ctx = await loadDefaultTalentFreeformContext(talentProfileId);
    if (ctx?.profile) {
      // maxSiteUrl = "" → the Max badge / "Visit my site" CTA prunes (no
      // self-referential link on the site's own home page).
      const tokens = talentProfileTokens(ctx.profile, ctx.media, "");
      return hydrateTalentTree(buildDefaultTalentProfileTree(), tokens);
    }
  } catch (err) {
    logServerError("talentMaxSite.provision.starterHomeHydrate", err);
  }
  // No profile data (or a load failure) → the minimal valid starter.
  return buildStarterHomePageTree({ displayName });
}

/**
 * Ensure a talent has a complete Talent Max Site scaffold:
 *   1. a `talent_sites` row (the SITE record),
 *   2. a derived, globally-unique `site_slug`,
 *   3. a default `shell_tree` (logo slot + nav + footer), and
 *   4. a starter `talent_pages` HOME row (is_home=true) with a starter tree.
 *
 * IDEMPOTENT — re-running fills only the still-missing pieces (slug / shell /
 * home page) and never overwrites authored content. MAX-GATED — refuses for any
 * talent whose effective plan is not `talent_portfolio` (the same gate the RLS
 * `talent_profile_has_max` enforces for writes; checked here so service-role
 * provisioning can't bypass it).
 *
 * Uses the service-role client because slug de-duplication must read across ALL
 * sites (RLS would hide other talents' rows). All writes are scoped to this one
 * talent_profile_id.
 */
export async function provisionTalentMaxSite(
  talentProfileId: string,
  createdByUserId?: string | null,
): Promise<ProvisionMaxSiteResult> {
  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Not configured." };
  }

  // ── Max gate ──────────────────────────────────────────────────────────────
  const { data: profileRow, error: profileErr } = await admin
    .from("talent_profiles")
    .select("id, display_name, profile_code, talent_plan_key")
    .eq("id", talentProfileId)
    .maybeSingle();

  if (profileErr || !profileRow) {
    if (profileErr) logServerError("talentMaxSite.provision.profile", profileErr);
    return { ok: false, error: "Talent profile not found." };
  }

  const profile = profileRow as {
    display_name: string | null;
    profile_code: string | null;
    talent_plan_key: string | null;
  };

  if (profile.talent_plan_key !== "talent_portfolio") {
    return { ok: false, error: "Talent Max plan required." };
  }

  const displayName = profile.display_name?.trim() || profile.profile_code?.trim() || "Site";
  const now = new Date().toISOString();

  // ── 1. Ensure the talent_sites row ─────────────────────────────────────────
  const { data: existing, error: existingErr } = await admin
    .from("talent_sites")
    .select("id, site_slug, shell_tree")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();

  if (existingErr) {
    logServerError("talentMaxSite.provision.loadSite", existingErr);
    return { ok: false, error: "Could not load talent site." };
  }

  // ── Derive a unique slug (only when the site has none yet) ──────────────────
  async function deriveUniqueSlug(): Promise<string> {
    const { data: takenRows } = await admin!
      .from("talent_sites")
      .select("site_slug")
      .not("site_slug", "is", null)
      .neq("talent_profile_id", talentProfileId);
    const taken = (takenRows ?? [])
      .map((r) => (r as { site_slug: string | null }).site_slug)
      .filter((s): s is string => !!s);
    return deriveSiteSlug(profile.display_name, profile.profile_code, taken);
  }

  const defaultShell: BuilderNode[] = buildDefaultShellTree({ displayName });

  let siteId: string;
  let siteSlug: string;
  let created = false;

  if (existing) {
    const row = existing as { id: string; site_slug: string | null; shell_tree: unknown };
    siteId = row.id;
    siteSlug = row.site_slug ?? "";

    const patch: Record<string, unknown> = {};
    if (!row.site_slug) {
      siteSlug = await deriveUniqueSlug();
      patch.site_slug = siteSlug;
    }
    // Only seed a shell when the row has none (empty array / null).
    const hasShell = Array.isArray(row.shell_tree) && row.shell_tree.length > 0;
    if (!hasShell) {
      patch.shell_tree = defaultShell;
    }

    if (Object.keys(patch).length > 0) {
      patch.updated_at = now;
      patch.updated_by = createdByUserId ?? null;
      const { error: updErr } = await admin
        .from("talent_sites")
        .update(patch)
        .eq("id", siteId);
      if (updErr) {
        logServerError("talentMaxSite.provision.updateSite", updErr);
        return { ok: false, error: "Could not update talent site." };
      }
    }
  } else {
    siteSlug = await deriveUniqueSlug();
    const { data: inserted, error: insertErr } = await admin
      .from("talent_sites")
      .insert({
        talent_profile_id: talentProfileId,
        site_kind: "talent_personal",
        status: "draft",
        site_slug: siteSlug,
        shell_tree: defaultShell,
        version: 1,
        draft_updated_at: now,
        created_by: createdByUserId ?? null,
        updated_by: createdByUserId ?? null,
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      logServerError("talentMaxSite.provision.insertSite", insertErr);
      return { ok: false, error: "Could not provision talent site." };
    }
    siteId = (inserted as { id: string }).id;
    created = true;
  }

  // ── 4. Ensure a starter HOME page (is_home=true) ────────────────────────────
  const { data: homeRow, error: homeErr } = await admin
    .from("talent_pages")
    .select("id")
    .eq("talent_profile_id", talentProfileId)
    .eq("is_home", true)
    .maybeSingle();

  if (homeErr) {
    logServerError("talentMaxSite.provision.loadHome", homeErr);
    // Non-fatal — the site row exists; report success without the home page.
    return { ok: true, created, siteId, siteSlug };
  }

  if (!homeRow) {
    // A legacy single-page builder may already own the `home` slug WITHOUT the
    // is_home flag (the (talent_profile_id, slug) unique index would reject a
    // fresh insert). Promote that page to home; otherwise insert a starter.
    const { data: existingSlugPage } = await admin
      .from("talent_pages")
      .select("id")
      .eq("talent_profile_id", talentProfileId)
      .eq("slug", STARTER_HOME_SLUG)
      .maybeSingle();

    if (existingSlugPage) {
      const { error: promoteErr } = await admin
        .from("talent_pages")
        .update({ is_home: true, nav_label: "Home", updated_at: now })
        .eq("id", (existingSlugPage as { id: string }).id);
      if (promoteErr) {
        logServerError("talentMaxSite.provision.promoteHome", promoteErr);
        return { ok: true, created, siteId, siteSlug };
      }
    } else {
      // Seed the home with the talent's REAL profile data (hero/about/services/
      // gallery/CTA), hydrated from the profile tree; falls back to the minimal
      // starter when the talent has no data. Only ever runs on first provision
      // (this branch is reached only when no home page + no `home`-slug page
      // exists), so an authored home is never overwritten.
      const starterTree = await buildStarterHomeBlocks(talentProfileId, displayName);
      const { error: pageErr } = await admin.from("talent_pages").insert({
        talent_profile_id: talentProfileId,
        slug: STARTER_HOME_SLUG,
        title: displayName,
        status: "draft",
        blocks: starterTree,
        theme: {},
        is_home: true,
        sort_order: 0,
        nav_label: "Home",
        required_talent_tier: "talent_portfolio",
        created_by: createdByUserId ?? null,
      });
      if (pageErr) {
        logServerError("talentMaxSite.provision.insertHome", pageErr);
        // The site is provisioned; surface the partial state but don't hard-fail.
        return { ok: true, created, siteId, siteSlug };
      }
    }
  }

  return { ok: true, created, siteId, siteSlug };
}
