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
import { type SectionTypeKey, getSectionType } from "@/lib/site-admin/sections/registry";
import { getLibraryDefault } from "@/lib/site-admin/sections/shared/default-content";
import { logServerError } from "@/lib/server/safe-error";
import {
  resolveCasExpectedVersion,
  resolveFreeStarterRosterSeedCount,
  shouldSkipFreeStarterHomepageSeed,
} from "./onboard-starter-content-policy";
import { publishSection, upsertSection } from "./sections";
import {
  ensureHomepageRow,
  publishHomepage,
  saveHomepageDraftComposition,
} from "./homepage";
import { ensureDirectoryPage } from "./onboard-directory-page";

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
}

export interface OnboardStarterContentResult {
  ok: boolean;
  homepagePageId?: string;
  starterSeeded?: boolean;
  starterRosterSeededCount?: number;
  error?: string;
}

interface FreeStarterEntry {
  slotKey: string;
  sectionTypeKey: SectionTypeKey;
  propsOverride?: Record<string, unknown>;
}

const FREE_STARTER_ENTRIES: ReadonlyArray<FreeStarterEntry> = [
  {
    slotKey: "hero",
    sectionTypeKey: "hero",
    propsOverride: {
      headline: "Your studio, live in one page.",
      subheadline:
        "A simple launch page with services, featured roster profiles, and one clear inquiry CTA.",
      primaryCta: { label: "Book a call", href: "/contact" },
      secondaryCta: { label: "See profiles", href: "/directory" },
    },
  },
  {
    slotKey: "services",
    sectionTypeKey: "category_grid",
    propsOverride: {
      eyebrow: "Services",
      headline: "What this studio offers",
      items: [
        { label: "Makeup", tagline: "Editorial + events" },
        { label: "Hair", tagline: "Set + ceremony ready" },
        { label: "Photography", tagline: "Portrait + campaign" },
        { label: "Styling", tagline: "Wardrobe + direction" },
      ],
      columnsDesktop: 4,
      variant: "portrait-masonry",
    },
  },
  {
    slotKey: "featured",
    sectionTypeKey: "featured_talent",
    propsOverride: {
      eyebrow: "Roster",
      headline: "Featured professionals",
      intro:
        "This section auto-loads real published profiles from your workspace roster (up to five on Free).",
      sourceMode: "auto_recent",
      limit: 5,
      columnsDesktop: 3,
      variant: "grid",
    },
  },
  {
    slotKey: "final_cta",
    sectionTypeKey: "cta_banner",
    propsOverride: {
      eyebrow: "Ready to book",
      headline: "Tell us your date and project.",
      copy:
        "Share your event details and we'll return availability with a suggested team within one business day.",
      primaryCta: { label: "Start inquiry", href: "/contact" },
      variant: "centered-overlay",
    },
  },
];

interface FreeStarterTalentSeed {
  displayName: string;
  firstName: string;
  lastName: string;
  shortBio: string;
}

const FREE_STARTER_TALENT_SEEDS: ReadonlyArray<FreeStarterTalentSeed> = [
  {
    displayName: "Luna Alvarez",
    firstName: "Luna",
    lastName: "Alvarez",
    shortBio:
      "Editorial makeup artist with destination and campaign experience.",
  },
  {
    displayName: "Mateo Rossi",
    firstName: "Mateo",
    lastName: "Rossi",
    shortBio:
      "Wedding and lifestyle photographer focused on candid storytelling.",
  },
  {
    displayName: "Sofia Bennett",
    firstName: "Sofia",
    lastName: "Bennett",
    shortBio: "Bridal and event hairstylist for luxury and editorial productions.",
  },
  {
    displayName: "Noah Sinclair",
    firstName: "Noah",
    lastName: "Sinclair",
    shortBio:
      "Creative stylist helping teams build cohesive wardrobe direction.",
  },
  {
    displayName: "Camila Ortega",
    firstName: "Camila",
    lastName: "Ortega",
    shortBio:
      "Production coordinator keeping timelines, vendors, and on-set flow aligned.",
  },
];

async function seedFreeStarterRosterProfiles(params: {
  client: SupabaseClient;
  tenantId: string;
  actorProfileId: string;
}): Promise<number> {
  const [{ data: agency }, visibleRes, totalRes] = await Promise.all([
    params.client
      .from("agencies")
      .select("plan_tier, talent_seat_limit")
      .eq("id", params.tenantId)
      .maybeSingle<{ plan_tier: string | null; talent_seat_limit: number | null }>(),
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
  // predicate used by resolveFreeStarterRosterSeedCount.
  const { data: planRow } = await params.client
    .from("agencies")
    .select("plan_tier")
    .eq("id", params.tenantId)
    .maybeSingle<{ plan_tier: string | null }>();
  const planTier = planRow?.plan_tier ?? null;

  const rosterSeededCount = await seedFreeStarterRosterProfiles({
    client: params.client,
    tenantId: params.tenantId,
    actorProfileId: params.actorProfileId,
  });

  const slots: Record<string, Array<{ sectionId: string; sortOrder: number }>> = {};
  const slotCounts = new Map<string, number>();

  for (const entry of FREE_STARTER_ENTRIES) {
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

  // ── Directory system page (Amendment A3 gate) ────────────────────────
  // Free tier deliberately gets NO dedicated directory page (the ~5 inline
  // on the landing one-pager covers Free). Studio/Agency/Network get the
  // canonical `__directory__` system page. Predicate mirrors
  // resolveFreeStarterRosterSeedCount's `planTier !== "free"`. Idempotent
  // + non-fatal: a failure here must never abort the homepage seed (the
  // tenant's live URL is the higher-priority guarantee). Today every
  // provisioning entry point hard-codes plan_tier:"free", so this is a
  // no-op for current signups (correct per A3); it auto-activates the
  // instant a non-free tenant is provisioned or upgraded.
  if (planTier !== "free") {
    const directoryResult = await ensureDirectoryPage({
      admin: params.client,
      tenantId: params.tenantId,
      actorProfileId: params.actorProfileId,
    });
    if (!directoryResult.ok) {
      logServerError(
        "onboardStarterContent.ensureDirectoryPage (non-fatal)",
        new Error(directoryResult.error),
      );
    }
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
    return {
      ok: true,
      homepagePageId: ensured.data.id,
      starterSeeded: seeded.seeded,
      starterRosterSeededCount: seeded.rosterSeededCount,
    };
  }

  return { ok: true, homepagePageId: ensured.data.id, starterSeeded: false };
}
