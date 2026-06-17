"use server";

/**
 * Talent Max Site — site & page MANAGEMENT server actions.
 *
 * Powers the `/talent/site` dashboard + the multi-page builder chrome:
 *   - provision the site on first open (`ensureMaxSiteAction`),
 *   - load the management state (`loadMaxSiteManagerAction`),
 *   - add / rename / delete / reorder / set-home pages,
 *   - rename the site slug (validated unique, slugified),
 *   - upload the site logo (→ `talent_sites.logo_url`),
 *   - PUBLISH the whole site (site_published_at + publish each page +
 *     shell_published = shell_tree).
 *
 * AUTH: every action is talent-OWNER-gated + MAX-gated.
 *   - Owner: resolved via `requireTalentSelf()` (the signed-in user's own
 *     talent_profiles row). `talent_sites` + `talent_pages` RLS independently
 *     enforces owner-only writes, so a forged talentProfileId can't write.
 *   - Max: `assertTalentCanUseCustomBuilder(planKey)` — Pro/Free are refused
 *     with `plan_required` (the dashboard renders an upsell, not a 404).
 *
 * "use server" file — every export is an async action. Pure decisions live in
 * `site-page-management-core.ts`; provisioning in `provision-max-site.ts`.
 *
 * Reads that must span ALL talents (site-slug de-dup) use the service-role
 * client, scoped to a single talent's WRITE; every other read/write uses the
 * cookie-session client so RLS takes effect.
 */

import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { assertTalentCanUseCustomBuilder } from "@/lib/server/talent-self-guard";
import { provisionTalentMaxSite } from "./provision-max-site";
import { deriveSiteSlug, slugifySiteName } from "./derive-site-slug";
import {
  derivePageSlug,
  isReservedPageSlug,
  nextSortOrder,
  planReorder,
  planSetHome,
  canDeletePage,
  type ManagedPage,
} from "./site-page-management-core";
import { buildStarterHomePageTree } from "../default-max-site-trees";
import { isMaxSiteTemplateKey } from "../max-site-templates/registry";
import type { MaxSiteTemplateKey } from "../max-site-templates/types";
import { buildAppliedTemplateTrees } from "./apply-template-core";
import type {
  MaxSiteManagerPage,
  MaxSiteManagerState,
  MaxSiteActionResult,
} from "./site-management-types";

const PAGE_COLUMNS =
  "id, slug, title, nav_label, status, is_home, sort_order, published_at, updated_at";

// ── Shared gate ──────────────────────────────────────────────────────────────

type GateOk = {
  ok: true;
  talentProfileId: string;
  displayName: string;
  profileCode: string | null;
  userId: string;
  planKey: string;
};
type GateFail = Extract<MaxSiteActionResult, { ok: false }>;

/**
 * Resolve the signed-in talent + assert Max. Every management action funnels
 * through this so the owner + Max checks live in one place. Lower tiers get
 * `plan_required` (the dashboard shows an upsell).
 */
async function gate(): Promise<GateOk | GateFail> {
  const scope = await requireTalentSelf();
  if (!scope.ok) {
    return { ok: false, code: scope.code, error: scope.error };
  }
  if (!assertTalentCanUseCustomBuilder(scope.planKey)) {
    return {
      ok: false,
      code: "plan_required",
      error: "Upgrade to Max to build and manage your website.",
    };
  }
  return {
    ok: true,
    talentProfileId: scope.talentProfile.id,
    displayName: scope.talentProfile.displayName,
    profileCode: scope.talentProfile.profileCode,
    userId: scope.session.user.id,
    planKey: scope.planKey,
  };
}

function siteUrl(slug: string | null): string | null {
  return slug ? `/t/site/${encodeURIComponent(slug)}` : null;
}

// ── Ensure / provision ───────────────────────────────────────────────────────

/**
 * Provision the talent's Max site if missing (idempotent), then return its id +
 * slug. Called on first open of `/talent/site`. Uses the service-role
 * provisioning helper (slug de-dup must span all sites); the Max gate is checked
 * here AND inside the helper.
 */
export async function ensureMaxSiteAction(): Promise<
  MaxSiteActionResult<{ siteSlug: string }>
> {
  const g = await gate();
  if (!g.ok) return g;
  const result = await provisionTalentMaxSite(g.talentProfileId, g.userId);
  if (!result.ok) {
    return { ok: false, code: "server_error", error: result.error };
  }
  return { ok: true, data: { siteSlug: result.siteSlug } };
}

// ── Load manager state ───────────────────────────────────────────────────────

/**
 * Load everything the `/talent/site` dashboard renders. Provisions the site
 * first (so a brand-new Max talent lands on a populated dashboard), then reads
 * the site row + every page via the cookie-session client (owner RLS).
 */
export async function loadMaxSiteManagerAction(): Promise<
  MaxSiteActionResult<MaxSiteManagerState>
> {
  const scope = await requireTalentSelf();
  if (!scope.ok) return { ok: false, code: scope.code, error: scope.error };

  const tier =
    scope.planKey === "talent_portfolio"
      ? ("max" as const)
      : scope.planKey === "talent_pro"
        ? ("pro" as const)
        : ("free" as const);
  const canManage = assertTalentCanUseCustomBuilder(scope.planKey);

  // Non-Max talents: return a minimal state so the dashboard renders the upsell.
  if (!canManage) {
    return {
      ok: true,
      data: {
        canManage: false,
        tier,
        talentProfileId: scope.talentProfile.id,
        displayName: scope.talentProfile.displayName,
        siteSlug: null,
        logoUrl: null,
        sitePublishedAt: null,
        hasPublishedShell: false,
        publicSiteUrl: null,
        pages: [],
      },
    };
  }

  // Provision on open (idempotent) so the manager is never empty for a Max talent.
  await provisionTalentMaxSite(scope.talentProfile.id, scope.session.user.id);

  const sb = await getCachedServerSupabase();
  if (!sb) return { ok: false, code: "server_error", error: "Not configured." };

  const { data: siteRow, error: siteErr } = await sb
    .from("talent_sites")
    .select("site_slug, logo_url, site_published_at, shell_published")
    .eq("talent_profile_id", scope.talentProfile.id)
    .maybeSingle();
  if (siteErr) {
    logServerError("maxSiteManager.load.site", siteErr);
    return { ok: false, code: "server_error", error: "Could not load your site." };
  }

  const { data: pageRows, error: pagesErr } = await sb
    .from("talent_pages")
    .select(PAGE_COLUMNS)
    .eq("talent_profile_id", scope.talentProfile.id)
    .order("sort_order", { ascending: true });
  if (pagesErr) {
    logServerError("maxSiteManager.load.pages", pagesErr);
    return { ok: false, code: "server_error", error: "Could not load your pages." };
  }

  const site = (siteRow ?? null) as {
    site_slug: string | null;
    logo_url: string | null;
    site_published_at: string | null;
    shell_published: unknown;
  } | null;

  const pages: MaxSiteManagerPage[] = ((pageRows ?? []) as Array<{
    id: string;
    slug: string;
    title: string;
    nav_label: string | null;
    status: string;
    is_home: boolean;
    sort_order: number;
    published_at: string | null;
    updated_at: string;
  }>).map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    navLabel: p.nav_label,
    status: p.status,
    isHome: p.is_home,
    sortOrder: p.sort_order,
    publishedAt: p.published_at,
    updatedAt: p.updated_at,
  }));

  return {
    ok: true,
    data: {
      canManage: true,
      tier,
      talentProfileId: scope.talentProfile.id,
      displayName: scope.talentProfile.displayName,
      siteSlug: site?.site_slug ?? null,
      logoUrl: site?.logo_url ?? null,
      sitePublishedAt: site?.site_published_at ?? null,
      hasPublishedShell:
        Array.isArray(site?.shell_published) && site!.shell_published.length > 0,
      publicSiteUrl: siteUrl(site?.site_slug ?? null),
      pages,
    },
  };
}

// ── Page: add ────────────────────────────────────────────────────────────────

/**
 * Add a new page to the site. Slug is derived from the title (deduped against
 * the talent's existing pages), appended at the end (next sort_order), drafted
 * with an empty starter tree. Returns the new page's id + slug so the UI can
 * jump straight into the builder.
 */
export async function addMaxSitePageAction(input: {
  title: string;
  navLabel?: string | null;
}): Promise<MaxSiteActionResult<{ id: string; slug: string }>> {
  const g = await gate();
  if (!g.ok) return g;

  const title = input.title?.trim();
  if (!title) {
    return { ok: false, code: "invalid_input", error: "Give the page a title." };
  }

  const sb = await getCachedServerSupabase();
  if (!sb) return { ok: false, code: "server_error", error: "Not configured." };

  const { data: existing } = await sb
    .from("talent_pages")
    .select("slug, sort_order, is_home, id")
    .eq("talent_profile_id", g.talentProfileId);

  const rows = (existing ?? []) as Array<{
    slug: string;
    sort_order: number;
    is_home: boolean;
    id: string;
  }>;
  const slug = derivePageSlug(
    input.navLabel?.trim() || title,
    rows.map((r) => r.slug),
  );
  const sortOrder = nextSortOrder(
    rows.map<ManagedPage>((r) => ({
      id: r.id,
      sortOrder: r.sort_order,
      isHome: r.is_home,
    })),
  );

  const { data: inserted, error } = await sb
    .from("talent_pages")
    .insert({
      talent_profile_id: g.talentProfileId,
      slug,
      title,
      nav_label: input.navLabel?.trim() || title,
      status: "draft",
      blocks: buildStarterHomePageTree({ displayName: title }),
      theme: {},
      is_home: false,
      sort_order: sortOrder,
      required_talent_tier: "talent_portfolio",
      created_by: g.userId,
    })
    .select("id, slug")
    .single();

  if (error || !inserted) {
    logServerError("maxSiteManager.addPage", error);
    return { ok: false, code: "server_error", error: "Could not add the page." };
  }
  return { ok: true, data: inserted as { id: string; slug: string } };
}

// ── Page: rename ─────────────────────────────────────────────────────────────

/**
 * Rename a page's title and/or nav label. Slug is NOT changed (it's a stable
 * public URL — changing it would break links + the builder's page-scoped key).
 */
export async function renameMaxSitePageAction(input: {
  pageId: string;
  title?: string;
  navLabel?: string | null;
}): Promise<MaxSiteActionResult> {
  const g = await gate();
  if (!g.ok) return g;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) return { ok: false, code: "invalid_input", error: "Title can't be empty." };
    patch.title = t;
  }
  if (input.navLabel !== undefined) {
    patch.nav_label = input.navLabel?.trim() || null;
  }

  const sb = await getCachedServerSupabase();
  if (!sb) return { ok: false, code: "server_error", error: "Not configured." };

  const { error, count } = await sb
    .from("talent_pages")
    .update(patch, { count: "exact" })
    .eq("id", input.pageId)
    .eq("talent_profile_id", g.talentProfileId);
  if (error) {
    logServerError("maxSiteManager.renamePage", error);
    return { ok: false, code: "server_error", error: "Could not rename the page." };
  }
  if (!count) return { ok: false, code: "page_not_found", error: "Page not found." };
  return { ok: true };
}

// ── Page: delete ─────────────────────────────────────────────────────────────

/**
 * Delete a page. Refuses to delete the home page while other pages exist (the
 * talent must re-home another page first) — enforced by the pure
 * `canDeletePage` planner before the DB delete.
 */
export async function deleteMaxSitePageAction(input: {
  pageId: string;
}): Promise<MaxSiteActionResult> {
  const g = await gate();
  if (!g.ok) return g;

  const sb = await getCachedServerSupabase();
  if (!sb) return { ok: false, code: "server_error", error: "Not configured." };

  const { data: rows } = await sb
    .from("talent_pages")
    .select("id, sort_order, is_home")
    .eq("talent_profile_id", g.talentProfileId);
  const pages = ((rows ?? []) as Array<{
    id: string;
    sort_order: number;
    is_home: boolean;
  }>).map<ManagedPage>((r) => ({
    id: r.id,
    sortOrder: r.sort_order,
    isHome: r.is_home,
  }));

  const decision = canDeletePage(pages, input.pageId);
  if (!decision.ok) {
    if (decision.reason === "not_found") {
      return { ok: false, code: "page_not_found", error: "Page not found." };
    }
    return {
      ok: false,
      code: "cannot_delete_home",
      error: "Set another page as Home before deleting this one.",
    };
  }

  const { error } = await sb
    .from("talent_pages")
    .delete()
    .eq("id", input.pageId)
    .eq("talent_profile_id", g.talentProfileId);
  if (error) {
    logServerError("maxSiteManager.deletePage", error);
    return { ok: false, code: "server_error", error: "Could not delete the page." };
  }
  return { ok: true };
}

// ── Page: reorder ────────────────────────────────────────────────────────────

/**
 * Reorder the site's pages. `orderedIds` is the desired order; the pure
 * `planReorder` computes the dense 0-based `sort_order` of only the rows that
 * change, and each is persisted individually (small N — a talent has a handful
 * of pages).
 */
export async function reorderMaxSitePagesAction(input: {
  orderedIds: string[];
}): Promise<MaxSiteActionResult> {
  const g = await gate();
  if (!g.ok) return g;
  if (!Array.isArray(input.orderedIds) || input.orderedIds.length === 0) {
    return { ok: false, code: "invalid_input", error: "No order provided." };
  }

  const sb = await getCachedServerSupabase();
  if (!sb) return { ok: false, code: "server_error", error: "Not configured." };

  const { data: rows } = await sb
    .from("talent_pages")
    .select("id, sort_order, is_home")
    .eq("talent_profile_id", g.talentProfileId);
  const pages = ((rows ?? []) as Array<{
    id: string;
    sort_order: number;
    is_home: boolean;
  }>).map<ManagedPage>((r) => ({
    id: r.id,
    sortOrder: r.sort_order,
    isHome: r.is_home,
  }));

  const changes = planReorder(pages, input.orderedIds);
  for (const c of changes) {
    const { error } = await sb
      .from("talent_pages")
      .update({ sort_order: c.sortOrder, updated_at: new Date().toISOString() })
      .eq("id", c.id)
      .eq("talent_profile_id", g.talentProfileId);
    if (error) {
      logServerError("maxSiteManager.reorder", error);
      return { ok: false, code: "server_error", error: "Could not reorder pages." };
    }
  }
  return { ok: true };
}

// ── Page: set home ───────────────────────────────────────────────────────────

/**
 * Make `pageId` the sole home page. The pure `planSetHome` orders the flag
 * flips so the partial-unique index (`one_home_per_profile`) never sees two home
 * rows mid-batch (clears the old home FIRST, then sets the target).
 */
export async function setMaxSiteHomePageAction(input: {
  pageId: string;
}): Promise<MaxSiteActionResult> {
  const g = await gate();
  if (!g.ok) return g;

  const sb = await getCachedServerSupabase();
  if (!sb) return { ok: false, code: "server_error", error: "Not configured." };

  const { data: rows } = await sb
    .from("talent_pages")
    .select("id, sort_order, is_home")
    .eq("talent_profile_id", g.talentProfileId);
  const pages = ((rows ?? []) as Array<{
    id: string;
    sort_order: number;
    is_home: boolean;
  }>).map<ManagedPage>((r) => ({
    id: r.id,
    sortOrder: r.sort_order,
    isHome: r.is_home,
  }));

  const plan = planSetHome(pages, input.pageId);
  if (plan === null) {
    return { ok: false, code: "page_not_found", error: "Page not found." };
  }
  // Apply in order (clears first, then the set) so the index stays satisfied.
  for (const flip of plan) {
    const { error } = await sb
      .from("talent_pages")
      .update({ is_home: flip.isHome, updated_at: new Date().toISOString() })
      .eq("id", flip.id)
      .eq("talent_profile_id", g.talentProfileId);
    if (error) {
      logServerError("maxSiteManager.setHome", error);
      return { ok: false, code: "server_error", error: "Could not set the home page." };
    }
  }
  return { ok: true };
}

// ── Site slug ────────────────────────────────────────────────────────────────

/**
 * Change the site's public slug. Slugified, then checked unique against ALL
 * OTHER sites (service-role read — RLS would hide other talents' rows). The
 * unique partial index on `talent_sites.site_slug` is the hard backstop.
 */
export async function setMaxSiteSlugAction(input: {
  slug: string;
}): Promise<MaxSiteActionResult<{ slug: string }>> {
  const g = await gate();
  if (!g.ok) return g;

  const desired = slugifySiteName(input.slug ?? "");
  if (!desired) {
    return { ok: false, code: "invalid_input", error: "Enter a valid site address." };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };

  // Slugs taken by OTHER sites — guarantee uniqueness before the write.
  const { data: takenRows } = await admin
    .from("talent_sites")
    .select("site_slug")
    .not("site_slug", "is", null)
    .neq("talent_profile_id", g.talentProfileId);
  const taken = ((takenRows ?? []) as Array<{ site_slug: string | null }>)
    .map((r) => r.site_slug)
    .filter((s): s is string => !!s);

  if (taken.includes(desired)) {
    return {
      ok: false,
      code: "slug_taken",
      error: "That address is taken. Try another.",
    };
  }

  const sb = await getCachedServerSupabase();
  if (!sb) return { ok: false, code: "server_error", error: "Not configured." };

  const { error, count } = await sb
    .from("talent_sites")
    .update(
      { site_slug: desired, updated_at: new Date().toISOString(), updated_by: g.userId },
      { count: "exact" },
    )
    .eq("talent_profile_id", g.talentProfileId);
  if (error) {
    // 23505 = unique_violation — a concurrent claim grabbed the slug.
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, code: "slug_taken", error: "That address is taken. Try another." };
    }
    logServerError("maxSiteManager.setSlug", error);
    return { ok: false, code: "server_error", error: "Could not update the address." };
  }
  if (!count) return { ok: false, code: "site_not_found", error: "Site not found." };
  return { ok: true, data: { slug: desired } };
}

// ── Logo upload ──────────────────────────────────────────────────────────────

const LOGO_ALLOWED_TYPES = ["image/png", "image/svg+xml", "image/jpeg", "image/webp"];
const LOGO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Upload the site logo to public storage and store its URL on
 * `talent_sites.logo_url`. The default shell renders this logo in the header
 * (`buildDefaultShellTree`) when present. Storage write uses the service-role
 * client (path-scoped, no RLS match needed); the DB write is owner-RLS scoped.
 */
export async function uploadMaxSiteLogoAction(
  formData: FormData,
): Promise<MaxSiteActionResult<{ logoUrl: string }>> {
  const g = await gate();
  if (!g.ok) return g;

  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) {
    return { ok: false, code: "invalid_input", error: "No file provided." };
  }
  if (!LOGO_ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, code: "invalid_input", error: "PNG, SVG, JPEG or WebP only." };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { ok: false, code: "invalid_input", error: "Logo must be under 10 MB." };
  }

  const admin = createServiceRoleClient();
  const sb = await getCachedServerSupabase();
  if (!admin || !sb) {
    return { ok: false, code: "server_error", error: "Not configured." };
  }

  const ext =
    file.type === "image/svg+xml"
      ? "svg"
      : file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const storagePath = `talent-site-logos/${g.talentProfileId}/${crypto.randomUUID()}.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadErr } = await admin.storage
    .from("media-public")
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (uploadErr) {
    logServerError("maxSiteManager.logo.upload", uploadErr);
    return { ok: false, code: "server_error", error: "Upload failed. Try again." };
  }

  const { data: urlData } = admin.storage.from("media-public").getPublicUrl(storagePath);
  const logoUrl = urlData.publicUrl;

  const { error: dbErr, count } = await sb
    .from("talent_sites")
    .update(
      { logo_url: logoUrl, updated_at: new Date().toISOString(), updated_by: g.userId },
      { count: "exact" },
    )
    .eq("talent_profile_id", g.talentProfileId);
  if (dbErr) {
    logServerError("maxSiteManager.logo.db", dbErr);
    return { ok: false, code: "server_error", error: "Could not save the logo." };
  }
  if (!count) return { ok: false, code: "site_not_found", error: "Site not found." };
  return { ok: true, data: { logoUrl } };
}

/** Remove the site logo (clears `talent_sites.logo_url`). */
export async function removeMaxSiteLogoAction(): Promise<MaxSiteActionResult> {
  const g = await gate();
  if (!g.ok) return g;
  const sb = await getCachedServerSupabase();
  if (!sb) return { ok: false, code: "server_error", error: "Not configured." };
  const { error } = await sb
    .from("talent_sites")
    .update({ logo_url: null, updated_at: new Date().toISOString(), updated_by: g.userId })
    .eq("talent_profile_id", g.talentProfileId);
  if (error) {
    logServerError("maxSiteManager.logo.remove", error);
    return { ok: false, code: "server_error", error: "Could not remove the logo." };
  }
  return { ok: true };
}

// ── Publish the whole site ───────────────────────────────────────────────────

/**
 * PUBLISH the site:
 *   1. publish EVERY page (status='published', published_at=now),
 *   2. bake the shell — `shell_published = shell_tree`, and
 *   3. mark the site live — `site_published_at = now`.
 *
 * The public render (`renderTalentMaxSite`) gates on `site_published_at` + the
 * talent currently holding Max + per-page `status='published'`, so all three
 * must land for the site to serve. Owner-RLS scoped throughout.
 */
export async function publishMaxSiteAction(): Promise<
  MaxSiteActionResult<{ publishedAt: string }>
> {
  const g = await gate();
  if (!g.ok) return g;

  const sb = await getCachedServerSupabase();
  if (!sb) return { ok: false, code: "server_error", error: "Not configured." };

  // Ensure the site exists (idempotent) before publishing.
  await provisionTalentMaxSite(g.talentProfileId, g.userId);

  const now = new Date().toISOString();

  // 1. Publish every page.
  const { error: pagesErr } = await sb
    .from("talent_pages")
    .update({ status: "published", published_at: now, updated_at: now })
    .eq("talent_profile_id", g.talentProfileId);
  if (pagesErr) {
    logServerError("maxSiteManager.publish.pages", pagesErr);
    return { ok: false, code: "server_error", error: "Could not publish your pages." };
  }

  // 2 + 3. Bake the shell + mark the site live. Read the current draft shell so
  //        shell_published mirrors shell_tree exactly.
  const { data: siteRow, error: readErr } = await sb
    .from("talent_sites")
    .select("shell_tree")
    .eq("talent_profile_id", g.talentProfileId)
    .maybeSingle();
  if (readErr) {
    logServerError("maxSiteManager.publish.readShell", readErr);
    return { ok: false, code: "server_error", error: "Could not read your shell." };
  }
  const shellTree = (siteRow as { shell_tree: unknown } | null)?.shell_tree ?? [];

  const { error: siteErr, count } = await sb
    .from("talent_sites")
    .update(
      {
        shell_published: shellTree,
        site_published_at: now,
        status: "published",
        published_at: now,
        updated_at: now,
        updated_by: g.userId,
      },
      { count: "exact" },
    )
    .eq("talent_profile_id", g.talentProfileId);
  if (siteErr) {
    logServerError("maxSiteManager.publish.site", siteErr);
    return { ok: false, code: "server_error", error: "Could not publish your site." };
  }
  if (!count) return { ok: false, code: "site_not_found", error: "Site not found." };

  return { ok: true, data: { publishedAt: now } };
}

// ── Apply a starter template ─────────────────────────────────────────────────

/**
 * APPLY a starter template to the DRAFT site: set `shell_tree` + the home page's
 * `blocks` from the chosen template key, hydrated with the talent's real profile
 * data (built + validated in `buildAppliedTemplateTrees`). REPLACES the current
 * draft shell + draft home; the talent then edits + publishes. Does NOT publish
 * (never touches `shell_published` / `*_published_at` / page `status`) and never
 * touches the `/t/<code>` discovery profile. Owner+Max-gated; RLS-backed;
 * idempotent (re-applying just rewrites the same draft).
 */
export async function applyMaxSiteTemplateAction(input: {
  templateKey: string;
}): Promise<MaxSiteActionResult<{ templateKey: MaxSiteTemplateKey }>> {
  const g = await gate();
  if (!g.ok) return g;

  if (!isMaxSiteTemplateKey(input.templateKey)) {
    return { ok: false, code: "invalid_input", error: "Unknown template." };
  }
  const templateKey = input.templateKey;

  // Ensure the site + home page exist (idempotent) before we overwrite the draft.
  const provisioned = await provisionTalentMaxSite(g.talentProfileId, g.userId);
  if (!provisioned.ok) {
    return { ok: false, code: "server_error", error: provisioned.error };
  }

  // Build + hydrate + validate both trees off the request path's heavy lifting.
  const built = await buildAppliedTemplateTrees(
    g.talentProfileId,
    g.displayName,
    templateKey,
  );
  if (!built.ok) {
    return { ok: false, code: "server_error", error: "Could not build that template." };
  }

  const sb = await getCachedServerSupabase();
  if (!sb) return { ok: false, code: "server_error", error: "Not configured." };

  const now = new Date().toISOString();

  // 1. Replace the DRAFT shell (shell_tree only — shell_published is untouched).
  const { error: shellErr, count: shellCount } = await sb
    .from("talent_sites")
    .update(
      {
        shell_tree: built.shellTree,
        draft_updated_at: now,
        updated_at: now,
        updated_by: g.userId,
      },
      { count: "exact" },
    )
    .eq("talent_profile_id", g.talentProfileId);
  if (shellErr) {
    logServerError("maxSiteManager.applyTemplate.shell", shellErr);
    return { ok: false, code: "server_error", error: "Could not apply the template shell." };
  }
  if (!shellCount) return { ok: false, code: "site_not_found", error: "Site not found." };

  // 2. Replace the DRAFT home page blocks. Target the is_home row; the page
  //    stays draft (status untouched) so the talent reviews + publishes.
  const { error: homeErr, count: homeCount } = await sb
    .from("talent_pages")
    .update(
      { blocks: built.homeTree, updated_at: now },
      { count: "exact" },
    )
    .eq("talent_profile_id", g.talentProfileId)
    .eq("is_home", true);
  if (homeErr) {
    logServerError("maxSiteManager.applyTemplate.home", homeErr);
    return { ok: false, code: "server_error", error: "Could not apply the template home page." };
  }
  if (!homeCount) {
    return { ok: false, code: "page_not_found", error: "Home page not found." };
  }

  return { ok: true, data: { templateKey } };
}
