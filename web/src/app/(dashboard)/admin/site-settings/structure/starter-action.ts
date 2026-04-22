"use server";

/**
 * Guided starter composition — one-click "go from empty to beautiful".
 *
 * Fresh tenants land on /admin/site-settings/structure with no sections.
 * The empty-state card gives them a preset tile + button; clicking it
 * runs this action which:
 *
 *   1. Applies the chosen theme preset (agency_branding draft tokens).
 *   2. Creates one draft section per recipe entry with library defaults
 *      (same payloads library-gallery quick-create would produce).
 *   3. Saves the homepage draft composition pointing at those new
 *      sections.
 *
 * The admin lands back on the composer with a working, editable draft.
 * Publishing is still a separate explicit step so they can review
 * before committing to the live site.
 *
 * Failure behaviour
 * Best-effort: if a section fails to create we skip it in the
 * composition. A second run would re-create (and unique-name-collision
 * retry). Preset application or composition save failures abort the
 * action with a descriptive error.
 */

import { sectionUpsertSchema } from "@/lib/site-admin/forms/sections";
import {
  getSectionType,
  SECTION_REGISTRY,
  type SectionTypeKey,
} from "@/lib/site-admin/sections/registry";
import { getLibraryDefault } from "@/lib/site-admin/sections/shared/default-content";
import { upsertSection } from "@/lib/site-admin/server/sections";
import {
  ensureHomepageRow,
  saveHomepageDraftComposition,
  loadHomepageForStaff,
} from "@/lib/site-admin/server/homepage";
import { applyThemePreset } from "@/lib/site-admin/server/design";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { randomBytes } from "node:crypto";

export type StarterActionState =
  | { ok: true; createdSections: number; skipped: number; presetSlug: string }
  | { ok: false; error: string; code?: string }
  | undefined;

// ── Recipes ───────────────────────────────────────────────────────────────

interface RecipeEntry {
  slotKey: string;
  sectionTypeKey: SectionTypeKey;
  /** Content overrides on top of getLibraryDefault. */
  propsOverride?: Record<string, unknown>;
}

interface Recipe {
  slug: string;
  label: string;
  presetSlug: string;
  entries: RecipeEntry[];
}

const RECIPES: Record<string, Recipe> = {
  "editorial-bridal": {
    slug: "editorial-bridal",
    label: "Editorial Bridal starter",
    presetSlug: "editorial-bridal",
    entries: [
      { slotKey: "hero", sectionTypeKey: "hero" },
      { slotKey: "trust_band", sectionTypeKey: "trust_strip" },
      { slotKey: "services", sectionTypeKey: "category_grid" },
      { slotKey: "featured", sectionTypeKey: "featured_talent" },
      { slotKey: "process", sectionTypeKey: "process_steps" },
      { slotKey: "destinations", sectionTypeKey: "destinations_mosaic" },
      { slotKey: "gallery", sectionTypeKey: "gallery_strip" },
      { slotKey: "testimonials", sectionTypeKey: "testimonials_trio" },
      { slotKey: "final_cta", sectionTypeKey: "cta_banner" },
    ],
  },
  classic: {
    slug: "classic",
    label: "Classic starter",
    presetSlug: "classic",
    entries: [
      { slotKey: "hero", sectionTypeKey: "hero" },
      { slotKey: "services", sectionTypeKey: "category_grid" },
      { slotKey: "featured", sectionTypeKey: "featured_talent" },
      { slotKey: "final_cta", sectionTypeKey: "cta_banner" },
    ],
  },
  "studio-minimal": {
    slug: "studio-minimal",
    label: "Studio Minimal starter",
    presetSlug: "studio-minimal",
    entries: [
      { slotKey: "hero", sectionTypeKey: "hero" },
      { slotKey: "services", sectionTypeKey: "category_grid" },
      { slotKey: "gallery", sectionTypeKey: "gallery_strip" },
      { slotKey: "final_cta", sectionTypeKey: "cta_banner" },
    ],
  },
};

export function listStarterRecipes(): Array<{ slug: string; label: string }> {
  return Object.values(RECIPES).map((r) => ({ slug: r.slug, label: r.label }));
}

function shortToken(): string {
  return randomBytes(3).toString("hex");
}

// ── Action ────────────────────────────────────────────────────────────────

export async function applyStarterComposition(
  _prev: StarterActionState,
  formData: FormData,
): Promise<StarterActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return { ok: false, error: "Select an agency workspace first." };
  }

  const slugRaw = formData.get("recipeSlug");
  const slug = typeof slugRaw === "string" ? slugRaw : "";
  const recipe = RECIPES[slug];
  if (!recipe) {
    return { ok: false, error: `Unknown starter "${slug}".` };
  }

  // Service-role for branding + section inserts; the request itself is
  // requireStaff + tenant-scope guarded.
  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Server is missing service-role credentials." };
  }

  // 1. Apply preset. Load current branding version first for CAS.
  const { data: branding, error: brandingErr } = await admin
    .from("agency_branding")
    .select("version")
    .eq("tenant_id", scope.tenantId)
    .maybeSingle();
  if (brandingErr || !branding) {
    return {
      ok: false,
      error:
        "Branding row missing for this workspace. Open Design once to initialise.",
    };
  }
  const presetResult = await applyThemePreset(admin, {
    tenantId: scope.tenantId,
    presetSlug: recipe.presetSlug,
    expectedVersion: (branding as { version: number }).version,
    actorProfileId: auth.user.id,
  });
  if (!presetResult.ok) {
    return {
      ok: false,
      error: presetResult.message ?? "Could not apply the preset.",
      code: presetResult.code,
    };
  }

  // 2. Ensure homepage row exists; we need its id for the composition.
  const ensure = await ensureHomepageRow(admin, {
    tenantId: scope.tenantId,
    locale: DEFAULT_PLATFORM_LOCALE,
    actorProfileId: auth.user.id,
  });
  if (!ensure.ok) {
    return {
      ok: false,
      error: ensure.message ?? "Could not initialise the homepage.",
      code: ensure.code,
    };
  }

  // 3. Create a section per recipe entry.
  const created: Array<{ slotKey: string; sectionId: string; sortOrder: number }> = [];
  let skipped = 0;
  for (const [idx, entry] of recipe.entries.entries()) {
    const registryEntry = getSectionType(entry.sectionTypeKey);
    if (!registryEntry) {
      skipped += 1;
      continue;
    }
    const defaults = getLibraryDefault(entry.sectionTypeKey);
    const name = `${defaults.name} (${recipe.label}) ${shortToken()}`;
    const values = {
      tenantId: scope.tenantId,
      sectionTypeKey: entry.sectionTypeKey,
      schemaVersion: registryEntry.currentVersion,
      props: { ...defaults.props, ...(entry.propsOverride ?? {}) },
      expectedVersion: 0 as const,
      name,
    };
    const parsed = sectionUpsertSchema.safeParse(values);
    if (!parsed.success) {
      skipped += 1;
      continue;
    }
    const result = await upsertSection(admin, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) {
      skipped += 1;
      continue;
    }
    created.push({
      slotKey: entry.slotKey,
      sectionId: result.data.id,
      sortOrder: idx,
    });
  }

  if (created.length === 0) {
    return {
      ok: false,
      error:
        "Could not create any starter sections — check that every section type is registered on this platform build.",
    };
  }

  // 4. Load homepage row + save composition with the freshly-created sections.
  const state = await loadHomepageForStaff(
    admin,
    scope.tenantId,
    DEFAULT_PLATFORM_LOCALE,
  );
  if (!state) {
    return {
      ok: false,
      error:
        "Homepage row missing after ensureHomepageRow — unexpected. Try again.",
    };
  }
  const slotsMap: Record<string, Array<{ sectionId: string; sortOrder: number }>> = {};
  for (const c of created) {
    (slotsMap[c.slotKey] ?? (slotsMap[c.slotKey] = [])).push({
      sectionId: c.sectionId,
      sortOrder: c.sortOrder,
    });
  }

  const composition = await saveHomepageDraftComposition(admin, {
    tenantId: scope.tenantId,
    values: {
      tenantId: scope.tenantId,
      locale: DEFAULT_PLATFORM_LOCALE,
      expectedVersion: state.page.version,
      metadata: {
        title: state.page.title ?? "Homepage",
        metaDescription: state.page.meta_description ?? undefined,
        introTagline: undefined,
      },
      slots: slotsMap,
    },
    actorProfileId: auth.user.id,
  });
  if (!composition.ok) {
    return {
      ok: false,
      error:
        composition.message ??
        "Starter sections were created but the homepage composition save failed. Reload the composer; the sections are visible in the Sections list.",
      code: composition.code,
    };
  }

  return {
    ok: true,
    createdSections: created.length,
    skipped,
    presetSlug: recipe.presetSlug,
  };
}

// Guard against unused-import stripping for the registry constant.
export const _touchRegistry = SECTION_REGISTRY;
