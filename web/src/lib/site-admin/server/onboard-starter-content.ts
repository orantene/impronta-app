/**
 * New-tenant starter content seeding.
 *
 * When a new agency is provisioned (manually via SQL today, or via a future
 * onboarding flow), we want them to land on a working storefront — not a 404.
 * This helper ensures the canonical homepage row exists for the tenant.
 *
 * It is idempotent: re-calling for a tenant that already has a homepage is a
 * no-op (delegates to `ensureHomepageRow`, which is itself idempotent).
 *
 * Wiring:
 * - Called automatically from the self-serve workspace signup provisioning path
 *   (`workspace-signup.server.ts`) with `seedFreeStarter: true`.
 * - Can also be run manually for SQL-provisioned tenants, e.g.:
 *
 *   import { onboardStarterContent } from "@/lib/site-admin/server/onboard-starter-content";
 *   await onboardStarterContent({ tenantId: "<new-agency-uuid>" });
 *
 * Default behavior seeds only the homepage row in DRAFT state.
 *
 * Callers can opt into `seedFreeStarter` to also create the Free one-page
 * starter sections and publish the homepage immediately (used by the
 * self-serve workspace signup flow so fresh free workspaces have a live URL
 * out of the box).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin";
import { sectionUpsertSchema } from "@/lib/site-admin/forms/sections";
import { getSectionType } from "@/lib/site-admin/sections/registry";
import { getLibraryDefault } from "@/lib/site-admin/sections/shared/default-content";
import { getThemePreset } from "@/lib/site-admin/presets/theme-presets";
import { validateThemePatch } from "@/lib/site-admin/tokens/registry";
import { logServerError } from "@/lib/server/safe-error";
import {
  resolveCasExpectedVersion,
  shouldSkipFreeStarterHomepageSeed,
} from "./onboard-starter-content-policy";
import { seedFreeStarterRosterProfiles } from "./onboard-starter-roster";
import { persistSignupBusinessDescription } from "./onboard-signup-description";
import { publishSection, upsertSection } from "./sections";
import {
  ensureHomepageRow,
  publishHomepage,
  saveHomepageDraftComposition,
} from "./homepage";
import { resolvePlatformDefaultStorefrontTree } from "./default-storefront-template";
import { buildFreeStarterEntries } from "./onboard-starter-content-entries";
import type { StarterAudience } from "./onboard-starter-content-entries";
import { ensureDirectoryPageIfRosterActive } from "./onboard-directory-page";
import { ensureNotFoundPage } from "./onboard-notfound-page";
import { ensureBookingPage } from "./onboard-booking-page";

// Re-exported so existing consumers (edit-mode starter recipe, tests) keep a
// single import site for the seed's public surface.
export { buildFreeStarterEntries } from "./onboard-starter-content-entries";

export interface OnboardStarterContentInput {
  tenantId: string;
  /**
   * Locale to seed the homepage in. Defaults to "en". The tenant can add
   * additional locales later from `/admin/site-settings/identity`.
   */
  locale?: string;
  /**
   * Actor profile id for capability-gated section + homepage draft/publish
   * operations when seeding starter sections.
   */
  actorProfileId?: string | null;
  /**
   * When true, attempts to seed and publish the Free one-page starter if this
   * tenant has an empty homepage composition.
   */
  seedFreeStarter?: boolean;
  /**
   * The signup answer to "Which describes you best?", carried from the lead
   * row so the starter homepage speaks to the right kind of business. Falls
   * back to DEFAULT_SIGNUP_AUDIENCE (the funnel's own default) when a caller
   * has no lead to read it from.
   */
  audience?: StarterAudience;
  /**
   * The free-text "what do you do?" blurb the /get-started disclosure collects
   * (`saas_marketing_signups.business_description`). Parked on the workspace so
   * the page-builder AI's "describe your page" front door has something real to
   * start from instead of an empty box.
   */
  businessDescription?: string | null;
}

export interface OnboardStarterContentResult {
  ok: boolean;
  homepagePageId?: string;
  starterSeeded?: boolean;
  starterRosterSeededCount?: number;
  error?: string;
}


/**
 * Slug of the theme preset the Free starter publishes. Matches the
 * edit-mode Free Quickstart recipe (`starter-action.ts`), so a signup-seeded
 * storefront and a recipe-applied one land on the same design register.
 */
const FREE_STARTER_THEME_PRESET_SLUG = "classic";

/**
 * Publish the starter theme preset for a tenant whose design was never
 * touched. Idempotent and deliberately conservative: it only writes when
 * BOTH the live theme and the draft are empty and no preset was ever
 * applied, so it can never clobber an operator's design work.
 *
 * Writes live + draft in one update (the seed publishes the homepage in the
 * same run, so the design must be live too, not parked as a draft). Skips
 * the tag-bust on purpose: this runs during the signup render where
 * `updateTag` is not callable, and a brand-new tenant has no cached
 * storefront reads yet (plus loadPublicBranding carries a 300s safety TTL).
 */
async function publishStarterThemeIfUnset(params: {
  client: SupabaseClient;
  tenantId: string;
  actorProfileId: string;
}): Promise<void> {
  const preset = getThemePreset(FREE_STARTER_THEME_PRESET_SLUG);
  if (!preset) return;

  const { data: row, error } = await params.client
    .from("agency_branding")
    .select("tenant_id, version, theme_json, theme_json_draft, theme_preset_slug")
    .eq("tenant_id", params.tenantId)
    .maybeSingle<{
      tenant_id: string;
      version: number;
      theme_json: Record<string, unknown> | null;
      theme_json_draft: Record<string, unknown> | null;
      theme_preset_slug: string | null;
    }>();
  if (error || !row) {
    if (error) logServerError("onboardStarterContent.publishTheme.read", error);
    return;
  }

  const untouched =
    !row.theme_preset_slug &&
    Object.keys(row.theme_json ?? {}).length === 0 &&
    Object.keys(row.theme_json_draft ?? {}).length === 0;
  if (!untouched) return;

  // Registry gate (same treatment applyThemePreset uses): keep only the
  // registry-accepted subset so a stale preset key can never block the seed.
  const gate = validateThemePatch({ ...preset.tokens });

  const { error: updateError } = await params.client
    .from("agency_branding")
    .update({
      theme_json: gate.normalized,
      theme_json_draft: gate.normalized,
      theme_preset_slug: preset.slug,
      theme_published_at: new Date().toISOString(),
      version: row.version + 1,
      updated_by: params.actorProfileId,
    })
    .eq("tenant_id", params.tenantId)
    .eq("version", row.version);
  if (updateError) {
    logServerError("onboardStarterContent.publishTheme.write", updateError);
  }
}

/**
 * Count the slot rows already attached to a KNOWN page id.
 *
 * Deliberately keyed on `page_id` (which we already hold) rather than
 * re-resolving the homepage row: the read-after-write hazard this file guards
 * against is specific to re-finding `cms_pages`, not to reading its children.
 */
async function readHomepageSlotCounts(
  client: SupabaseClient,
  tenantId: string,
  pageId: string,
): Promise<{ ok: boolean; draftSlotCount: number; liveSlotCount: number }> {
  const { data, error } = await client
    .from("cms_page_sections")
    .select("is_draft")
    .eq("tenant_id", tenantId)
    .eq("page_id", pageId);
  // `ok: false` is NOT the same as "zero slots". The caller fails closed on it
  // so a transient read error can never authorize overwriting a live homepage.
  if (error || !data) {
    if (error) {
      logServerError("onboardStarterContent.readHomepageSlotCounts", error);
    }
    return { ok: false, draftSlotCount: 0, liveSlotCount: 0 };
  }
  const rows = data as Array<{ is_draft: boolean | null }>;
  return {
    ok: true,
    draftSlotCount: rows.filter((row) => row.is_draft === true).length,
    liveSlotCount: rows.filter((row) => row.is_draft === false).length,
  };
}

/**
 * Re-read `cms_pages.version` for a KNOWN page id, immediately before a CAS.
 *
 * Returns null when the read is unavailable so the caller can fall back to the
 * version it already holds instead of hard-failing.
 */
async function readHomepageVersion(
  client: SupabaseClient,
  tenantId: string,
  pageId: string,
): Promise<number | null> {
  const { data, error } = await client
    .from("cms_pages")
    .select("version")
    .eq("id", pageId)
    .eq("tenant_id", tenantId)
    .maybeSingle<{ version: number }>();
  if (error || !data) return null;
  return typeof data.version === "number" ? data.version : null;
}

async function seedFreeStarterHomepage(params: {
  client: SupabaseClient;
  tenantId: string;
  locale: Parameters<typeof ensureHomepageRow>[1]["locale"];
  actorProfileId: string;
  audience?: StarterAudience;
  /**
   * The homepage row `ensureHomepageRow` just created or found.
   *
   * FIRST-RUN CONTRACT (do not reintroduce a `loadHomepageForStaff` call here):
   * this function used to RE-READ the homepage over a second PostgREST
   * round-trip immediately after `ensureHomepageRow` INSERTed it. That
   * read-after-write returned null on every observed self-serve signup, so the
   * seed bailed with HOME_NOT_FOUND and every brand-new workspace was left with
   * a draft, section-less, roster-less homepage that rendered "No talent
   * published yet". The row is passed in directly instead.
   */
  page: {
    id: string;
    status: string | null;
    title: string | null;
    version: number;
  };
}): Promise<
  | { ok: true; seeded: boolean; rosterSeededCount: number }
  | { ok: false; error: string }
> {
  const { page } = params;

  const existingSlotCounts = await readHomepageSlotCounts(
    params.client,
    params.tenantId,
    page.id,
  );
  // Idempotence: the signup trampoline re-enters this on later logins.
  if (
    shouldSkipFreeStarterHomepageSeed({
      pageStatus: page.status,
      draftSlotCount: existingSlotCounts.draftSlotCount,
      liveSlotCount: existingSlotCounts.liveSlotCount,
      contentProbeOk: existingSlotCounts.ok,
    })
  ) {
    return { ok: true, seeded: false, rosterSeededCount: 0 };
  }

  // Plan tier drives the directory-page gate (Amendment A3: Free gets no
  // dedicated directory page; Studio/Agency do). Mirrors the Free-vs-paid
  // predicate used by resolveFreeStarterRosterSeedCount. Display name
  // personalizes the seeded hero copy.
  const { data: planRow } = await params.client
    .from("agencies")
    .select("plan_tier, display_name")
    .eq("id", params.tenantId)
    .maybeSingle<{ plan_tier: string | null; display_name: string | null }>();

  // Publish a real design theme BEFORE the sections go live. A tenant with
  // an empty theme_json renders the storefront off raw fallback tokens
  // (near-black primary + a "dark" platform site-theme class), which is what
  // produced the black-on-black hero CTA and ghost headings on fresh Free
  // signups. Non-fatal: a failure here degrades styling, never the seed.
  await publishStarterThemeIfUnset({
    client: params.client,
    tenantId: params.tenantId,
    actorProfileId: params.actorProfileId,
  });

  const rosterSeededCount = await seedFreeStarterRosterProfiles({
    client: params.client,
    tenantId: params.tenantId,
    actorProfileId: params.actorProfileId,
  });

  // ── Preferred source: the ADMIN-MANAGED Site Starter Kit ──────────────
  // Builder Lab → Design → Site Starter Kit manages published full-page
  // starter designs, and Builder Lab → Default surfaces points the platform
  // DEFAULT storefront at one of them. When that chain resolves, seed the
  // new tenant's homepage as an editable COPY of the admin-managed design
  // (freeform builderTree, no curated slots — the same shape one-click
  // starter designs persist). Admins then control what every new Free
  // workspace looks like from the Lab, with no deploy; the hardcoded
  // section starter below remains only as the fallback for installs where
  // no starter template is published.
  // The resolver stamps the admin-authored template for THIS tenant before it
  // hands the tree back: `{{business.name}}` becomes the workspace's display
  // name and `{{audience:…}}` collapses to the case this signup answered. Both
  // facts are known here and nowhere later, which is why they are read at the
  // resolve call rather than after it.
  const starterKitTree = await resolvePlatformDefaultStorefrontTree(
    params.client,
    {
      businessName: planRow?.display_name,
      audience: params.audience,
    },
  );
  if (starterKitTree && starterKitTree.builderTree.length > 0) {
    const kitSaveVersion = resolveCasExpectedVersion({
      freshVersion: await readHomepageVersion(
        params.client,
        params.tenantId,
        page.id,
      ),
      fallbackVersion: page.version,
    });
    const kitSaved = await saveHomepageDraftComposition(params.client, {
      tenantId: params.tenantId,
      values: {
        tenantId: params.tenantId,
        locale: params.locale,
        expectedVersion: kitSaveVersion,
        metadata: {
          title: page.title?.trim() || "Homepage",
          metaDescription: undefined,
          introTagline: undefined,
          ogTitle: undefined,
          ogDescription: undefined,
          ogImageUrl: undefined,
          canonicalUrl: undefined,
          noindex: false,
        },
        slots: {},
        builderTree: starterKitTree.builderTree,
      },
      actorProfileId: params.actorProfileId,
    });
    if (kitSaved.ok) {
      const kitPublishVersion = resolveCasExpectedVersion({
        freshVersion: await readHomepageVersion(
          params.client,
          params.tenantId,
          page.id,
        ),
        fallbackVersion: kitSaved.data.version,
      });
      const kitPublished = await publishHomepage(params.client, {
        tenantId: params.tenantId,
        values: {
          tenantId: params.tenantId,
          locale: params.locale,
          expectedVersion: kitPublishVersion,
        },
        actorProfileId: params.actorProfileId,
      });
      if (kitPublished.ok) {
        return { ok: true, seeded: true, rosterSeededCount };
      }
      logServerError(
        "onboardStarterContent.starterKit.publish (falling back to section starter)",
        new Error(kitPublished.code ?? "PUBLISH_FAILED"),
      );
    } else {
      logServerError(
        "onboardStarterContent.starterKit.save (falling back to section starter)",
        new Error(kitSaved.code ?? "SAVE_FAILED"),
      );
    }
  }

  const slots: Record<string, Array<{ sectionId: string; sortOrder: number }>> = {};
  const slotCounts = new Map<string, number>();

  for (const entry of buildFreeStarterEntries(planRow?.display_name, params.audience)) {
    const registry = getSectionType(entry.sectionTypeKey);
    if (!registry) continue;

    const defaults = getLibraryDefault(entry.sectionTypeKey);
    const parsed = sectionUpsertSchema.safeParse({
      tenantId: params.tenantId,
      sectionTypeKey: entry.sectionTypeKey,
      schemaVersion: registry.currentVersion,
      props: {
        ...defaults.props,
        ...(entry.propsOverride ?? {}),
      },
      expectedVersion: 0,
      name: defaults.name,
    });
    if (!parsed.success) continue;

    const created = await upsertSection(params.client, {
      tenantId: params.tenantId,
      values: parsed.data,
      actorProfileId: params.actorProfileId,
    });
    if (!created.ok) continue;

    const published = await publishSection(params.client, {
      tenantId: params.tenantId,
      values: {
        tenantId: params.tenantId,
        id: created.data.id,
        expectedVersion: created.data.version,
      },
      actorProfileId: params.actorProfileId,
    });
    if (!published.ok) continue;

    const sortOrder = slotCounts.get(entry.slotKey) ?? 0;
    slotCounts.set(entry.slotKey, sortOrder + 1);
    (slots[entry.slotKey] ??= []).push({
      sectionId: published.data.id,
      sortOrder,
    });
  }

  const totalSections = Object.values(slots).reduce(
    (sum, entries) => sum + entries.length,
    0,
  );
  if (totalSections === 0) {
    return { ok: false, error: "FREE_STARTER_EMPTY" };
  }

  // CAS #1 — re-read the version immediately before the write. `ensureHomepageRow`
  // and the section seeding above are separate round-trips; the version we
  // captured at ensure-time can already be stale by the time we get here.
  const saveExpectedVersion = resolveCasExpectedVersion({
    freshVersion: await readHomepageVersion(
      params.client,
      params.tenantId,
      page.id,
    ),
    fallbackVersion: page.version,
  });

  const saved = await saveHomepageDraftComposition(params.client, {
    tenantId: params.tenantId,
    values: {
      tenantId: params.tenantId,
      locale: params.locale,
      expectedVersion: saveExpectedVersion,
      metadata: {
        title: page.title?.trim() || "Homepage",
        metaDescription: undefined,
        introTagline: undefined,
        ogTitle: undefined,
        ogDescription: undefined,
        ogImageUrl: undefined,
        canonicalUrl: undefined,
        noindex: false,
      },
      slots,
    },
    actorProfileId: params.actorProfileId,
  });
  if (!saved.ok) {
    return { ok: false, error: saved.code ?? "SAVE_STARTER_FAILED" };
  }

  // CAS #2 — same treatment before the publish. The draft save inserted a
  // revision row and bumped the page; re-read rather than trusting the version
  // the save reported, so a concurrent/interleaved write cannot turn the seed
  // into a VERSION_CONFLICT that leaves the workspace unpublished.
  const publishExpectedVersion = resolveCasExpectedVersion({
    freshVersion: await readHomepageVersion(
      params.client,
      params.tenantId,
      page.id,
    ),
    fallbackVersion: saved.data.version,
  });

  const publishedHomepage = await publishHomepage(params.client, {
    tenantId: params.tenantId,
    values: {
      tenantId: params.tenantId,
      locale: params.locale,
      expectedVersion: publishExpectedVersion,
    },
    actorProfileId: params.actorProfileId,
  });
  if (!publishedHomepage.ok) {
    return {
      ok: false,
      error: publishedHomepage.code ?? "PUBLISH_STARTER_FAILED",
    };
  }

  return { ok: true, seeded: true, rosterSeededCount };
}

/**
 * Seed the minimum-viable storefront for a brand-new tenant.
 *
 * Currently this is just the homepage row (draft, no sections). As we add
 * starter templates (about page, contact page, default nav) those go here too.
 */
export async function onboardStarterContent(
  client: SupabaseClient,
  input: OnboardStarterContentInput,
): Promise<OnboardStarterContentResult> {
  const locale = (input.locale ?? DEFAULT_PLATFORM_LOCALE) as Parameters<
    typeof ensureHomepageRow
  >[1]["locale"];

  const ensured = await ensureHomepageRow(client, {
    tenantId: input.tenantId,
    locale,
  });

  if (!ensured.ok) {
    return { ok: false, error: ensured.code ?? "ENSURE_FAILED" };
  }

  // Independent of `seedFreeStarter`: the blurb belongs to the workspace, not
  // to the starter homepage, and the two crash-recovery provisioning paths
  // re-enter here after the homepage seed has already short-circuited.
  await persistSignupBusinessDescription(client, {
    tenantId: input.tenantId,
    businessDescription: input.businessDescription,
  });

  if (input.seedFreeStarter) {
    const actorProfileId = input.actorProfileId ?? null;
    if (!actorProfileId) {
      return {
        ok: false,
        error: "ACTOR_REQUIRED_FOR_STARTER_SEED",
        homepagePageId: ensured.data.id,
      };
    }
    const seeded = await seedFreeStarterHomepage({
      client,
      tenantId: input.tenantId,
      locale,
      actorProfileId,
      audience: input.audience,
      // Hand the just-ensured row straight over. See the `page` prop doc:
      // re-reading it here is what broke every self-serve signup.
      page: {
        id: ensured.data.id,
        status: ensured.data.status,
        title: ensured.data.title,
        version: ensured.data.version,
      },
    });
    if (!seeded.ok) {
      return {
        ok: false,
        error: seeded.error,
        homepagePageId: ensured.data.id,
      };
    }

    // ── DEFAULT PAGES CONTRACT ───────────────────────────────────────────
    // Deliberately OUTSIDE `seedFreeStarterHomepage`, which short-circuits
    // once a workspace has homepage content (the signup trampoline re-enters
    // on later logins). Running the two ensures here instead means they also
    // BACKFILL: a workspace provisioned before this contract existed picks up
    // its 404 — and its directory page, if its roster has since become active
    // — the next time the trampoline runs. Both are idempotent and non-fatal.
    //
    // 404 is unconditional: every public site needs a dead-end that belongs to
    // its owner, on every plan and every workspace type. It costs the operator
    // nothing — never linked, never indexed, never in the sitemap, and exempt
    // from the page quota. If it fails, the platform-branded 404 boundary in
    // `src/app/not-found.tsx` still catches the request, so the degradation is
    // the page, not the workspace.
    const notFoundResult = await ensureNotFoundPage({
      admin: client,
      tenantId: input.tenantId,
      actorProfileId,
      locale,
    });
    if (!notFoundResult.ok) {
      logServerError(
        "onboardStarterContent.ensureNotFoundPage (non-fatal)",
        new Error(notFoundResult.error),
      );
    }

    // The directory page is CAPABILITY-keyed, not plan-keyed: a workspace
    // needs a page listing its roster because of what it IS and what it HAS,
    // never because of what it pays. See `directoryPageCapabilityEnabled`.
    const directoryResult = await ensureDirectoryPageIfRosterActive({
      admin: client,
      tenantId: input.tenantId,
      actorProfileId,
    });
    if (!directoryResult.ok) {
      logServerError(
        "onboardStarterContent.ensureDirectoryPage (non-fatal)",
        new Error(directoryResult.error),
      );
    }

    const bookingResult = await ensureBookingPage({
      admin: client,
      tenantId: input.tenantId,
      actorProfileId,
    });
    if (!bookingResult.ok) {
      logServerError(
        "onboardStarterContent.ensureBookingPage (non-fatal)",
        new Error(bookingResult.error),
      );
    }

    // CONTACT is deliberately NOT seeded. Owner-ratified: a published
    // placeholder contact page from minute one is a worse first impression
    // than a shorter nav, and it undercuts the AI-draft magic moment. The
    // dangling default is resolved the other way instead — the default shell
    // nav and footer link sets no longer hard-code `/contact`, which on an
    // agency host is a CMS clean-URL that 404s until such a page exists.

    return {
      ok: true,
      homepagePageId: ensured.data.id,
      starterSeeded: seeded.seeded,
      starterRosterSeededCount: seeded.rosterSeededCount,
    };
  }

  return { ok: true, homepagePageId: ensured.data.id, starterSeeded: false };
}
