"use server";

/**
 * Server actions for the in-canvas <SiteHeaderInspector>.
 *
 * These wrap the existing per-table server functions (saveBranding,
 * saveIdentity, saveDesignDraft+publishDesign) with a JSON contract the
 * inspector can call as a normal async function — no FormData handshake,
 * no useActionState, no per-table form components.
 *
 * Save model: debounced autosave (Step 5 decision A). Each public action
 * here returns { ok, currentVersion } so the inspector can keep its
 * per-table version pointers in sync without a re-load round trip.
 *
 * Live preview model: hybrid (Step 5 decision C). For theme tokens, the
 * inspector mutates `<html data-token-*>` optimistically; this action
 * persists the change and `revalidateTag` busts the storefront read so
 * a subsequent navigation reflects the canonical value. For renderer-
 * driven changes (label, logo, nav items), the inspector triggers
 * `router.refresh()` after the action returns ok.
 */

import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSession } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { tagFor } from "@/lib/site-admin/cache-tags";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin/locales";
import {
  loadBrandingForStaff,
  loadIdentityForStaff,
} from "@/lib/site-admin/server/reads";
import { saveBranding } from "@/lib/site-admin/server/branding";
import { saveIdentity } from "@/lib/site-admin/server/identity";
import {
  publishDesign,
  saveDesignDraft,
} from "@/lib/site-admin/server/design";
import {
  deleteNavItem,
  publishNavigationMenu,
  reorderNavItems,
  upsertNavItem,
  type NavItemRow,
} from "@/lib/site-admin/server/navigation";
import {
  brandingFormSchema,
  identityFormSchema,
} from "@/lib/site-admin";
import { saveSectionDraftAction } from "@/lib/site-admin/edit-mode/section-actions";
import {
  mirrorShellLandmarkSectionProps,
  readShellLandmarkOwnedProps,
} from "@/lib/site-admin/edit-mode/shell-landmark-props-persist";
import { republishSiteShellSnapshot } from "@/lib/site-admin/edit-mode/site-shell-publish";
import {
  HEADER_REGIONS_PLAN_DENIED_REASON,
  isHeaderRegionsEditAllowedForPlan,
} from "@/lib/site-admin/edit-mode/shell-plan-guard";
import { loadBuilderWorkspacePlan } from "@/lib/site-admin/builder-capabilities";
import { siteHeaderSchemaV1 } from "@/lib/site-admin/sections/site_header/schema";
import type { Locale } from "@/i18n/config";
import type {
  HeaderRegions,
  SiteHeaderConfig,
  SiteHeaderNavItemInput,
} from "./types";
import { pickShellPageForLocale } from "./shell-page-pick";

/**
 * WF-6 — read a stored `regions` blob back through the SECTION schema.
 *
 * Anything that does not parse (absent, legacy shape, hand-edited JSON) comes
 * back as `null`, which the inspector reads as "still on the preset layout".
 * Casting instead would hand the editor a half-shape whose reorder maths would
 * then write the corruption back out.
 */
function parseStoredRegions(value: unknown): HeaderRegions | null {
  if (!value || typeof value !== "object") return null;
  const parsed = siteHeaderSchemaV1
    .pick({ regions: true })
    .safeParse({ regions: value });
  return parsed.success ? (parsed.data.regions ?? null) : null;
}

// ── Result envelope ────────────────────────────────────────────────────
type ActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; code?: string; currentVersion?: number };

// ── site_header SECTION-PROPS bridge ────────────────────────────────────
//
// The inspector edits identity / branding / nav. The snapshot header's
// VARIANT + DENSITY live in the `site_header` section's `props_jsonb`
// (what the renderer actually reads). These two actions are the bridge:
// resolve the tenant's site_header section, then load / save its props
// through the EXISTING canonical section save (`saveSectionDraftAction`
// — Zod + CAS + audit + revision) and re-bake the shell snapshot via the
// EXISTING `republishSiteShellSnapshot`. No second save path invented.

interface HeaderSectionFacts {
  sectionId: string;
  sectionTypeKey: string;
  schemaVersion: number;
  name: string;
  version: number;
  locale: string;
  props: Record<string, unknown>;
  /**
   * The shell `cms_pages` row. `props` above may have come from the landmark
   * node ON this row rather than from `cms_sections.props_jsonb`, and the save
   * mirrors back to it. See `shell-landmark-props-persist.ts`.
   */
  shellPageId: string;
}

/** The tenant's primary content locale, or "en" when identity is unset. */
async function resolveTenantDefaultLocale(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string> {
  const { data } = await supabase
    .from("agency_business_identity")
    .select("default_locale")
    .eq("tenant_id", tenantId)
    .maybeSingle<{ default_locale: string | null }>();
  return data?.default_locale ?? "en";
}

async function resolveHeaderSection(
  supabase: SupabaseClient,
  tenantId: string,
  preferredLocale?: string | null,
): Promise<HeaderSectionFacts | null> {
  // 2026-08-16 — this used `.maybeSingle()`, which is an ERROR (not a pick)
  // the moment a tenant has a shell page per locale. Every section-level
  // header control silently rendered its empty state on bilingual tenants,
  // impronta included. See `shell-page-pick.ts` for the rule and its test.
  const { data: shells } = await supabase
    .from("cms_pages")
    .select("id, locale")
    .eq("tenant_id", tenantId)
    .eq("system_template_key", "site_shell")
    .neq("status", "archived")
    .returns<Array<{ id: string; locale: string | null }>>();
  const shell = pickShellPageForLocale(
    shells ?? [],
    preferredLocale ?? (await resolveTenantDefaultLocale(supabase, tenantId)),
  );
  if (!shell) return null;

  let { data: ptr } = await supabase
    .from("cms_page_sections")
    .select("section_id")
    .eq("tenant_id", tenantId)
    .eq("page_id", shell.id)
    .eq("slot_key", "header")
    .eq("is_draft", true)
    .maybeSingle<{ section_id: string }>();
  if (!ptr) {
    ({ data: ptr } = await supabase
      .from("cms_page_sections")
      .select("section_id")
      .eq("tenant_id", tenantId)
      .eq("page_id", shell.id)
      .eq("slot_key", "header")
      .eq("is_draft", false)
      .maybeSingle<{ section_id: string }>());
  }
  if (!ptr) return null;

  const { data: sec } = await supabase
    .from("cms_sections")
    .select("id, section_type_key, schema_version, name, version, props_jsonb")
    .eq("tenant_id", tenantId)
    .eq("id", ptr.section_id)
    .maybeSingle<{
      id: string;
      section_type_key: string;
      schema_version: number;
      name: string;
      version: number;
      props_jsonb: Record<string, unknown> | null;
    }>();
  if (!sec) return null;

  // NODE-FIRST, matching the renderer. `resolveShellLandmarkSectionProps` makes
  // a landmark's inline `props.sectionProps` beat the slot row on both render
  // paths, so once the landmark owns its config the ROW is no longer what the
  // site shows. Reading the row here would display a stale header to the
  // operator and then save it back over the node on the next autosave.
  // Slot-owned landmarks (every shell alive today) return null and fall through
  // to `props_jsonb`, the exact expression this replaced.
  const owned = await readShellLandmarkOwnedProps(supabase, {
    tenantId,
    shellPageId: shell.id,
    side: "header",
  });

  return {
    sectionId: sec.id,
    sectionTypeKey: sec.section_type_key,
    schemaVersion: sec.schema_version,
    name: sec.name,
    version: sec.version,
    locale: shell.locale ?? "en",
    props: owned ?? sec.props_jsonb ?? {},
    shellPageId: shell.id,
  };
}

export interface HeaderSectionDensity {
  logoScale?: string | null;
  navDensity?: string | null;
  verticalPadding?: string | null;
  mobileMenuStyle?: string | null;
}

/** Load the snapshot header's section-level props (variant + density). */
export async function loadHeaderSectionAction(): Promise<
  ActionResult<{
    section: {
      sectionId: string;
      version: number;
      variant: string;
      brandDisplay: string;
      density: HeaderSectionDensity | null;
    };
  }>
> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "No tenant in scope." };

  const f = await resolveHeaderSection(auth.supabase, scope.tenantId);
  if (!f) {
    return { ok: false, error: "Site header section not found.", code: "NOT_FOUND" };
  }
  const p = f.props as {
    variant?: unknown;
    brandDisplay?: unknown;
    density?: unknown;
  };
  return {
    ok: true,
    section: {
      sectionId: f.sectionId,
      version: f.version,
      variant: typeof p.variant === "string" ? p.variant : "standard",
      brandDisplay:
        typeof p.brandDisplay === "string" ? p.brandDisplay : "image-and-text",
      density:
        p.density && typeof p.density === "object"
          ? (p.density as HeaderSectionDensity)
          : null,
    },
  };
}

/** Patch ONLY variant/density on the site_header section, through the
 * canonical section save, then re-bake the shell snapshot so the
 * rendered header reflects it immediately. */
export async function saveHeaderSectionAction(input: {
  expectedVersion: number;
  variant?: string;
  brandDisplay?: string;
  density?: HeaderSectionDensity | null;
  /**
   * WF-6 — the freeform zone layout. `null` clears it (back to the variant's
   * preset layout); omitted leaves whatever is stored untouched, so the Layout
   * tab's variant/density saves cannot wipe a composed layout.
   */
  regions?: HeaderRegions | null;
}): Promise<ActionResult<{ version: number }>> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "No tenant in scope." };

  // WF-6 — PLAN GATE, enforced here and not only in the drawer. The UI lock is
  // an affordance; this is the rule. Any `regions` write (including clearing
  // it) from a Free workspace is refused before anything is persisted.
  if (input.regions !== undefined) {
    const planTier = await loadBuilderWorkspacePlan(
      auth.supabase,
      scope.tenantId,
      { logTag: "save-header-regions" },
    );
    if (!isHeaderRegionsEditAllowedForPlan(planTier)) {
      return {
        ok: false,
        error: HEADER_REGIONS_PLAN_DENIED_REASON,
        code: "PLAN_LOCKED",
      };
    }
  }

  const f = await resolveHeaderSection(auth.supabase, scope.tenantId);
  if (!f) {
    return { ok: false, error: "Site header section not found.", code: "NOT_FOUND" };
  }

  const cur = f.props as Record<string, unknown>;
  const nextProps: Record<string, unknown> = { ...cur };
  if (input.variant !== undefined) nextProps.variant = input.variant;
  if (input.brandDisplay !== undefined) {
    nextProps.brandDisplay = input.brandDisplay;
  }
  if (input.density !== undefined) {
    if (input.density === null) {
      delete nextProps.density;
    } else {
      const d: Record<string, unknown> = {
        ...((cur.density as Record<string, unknown> | undefined) ?? {}),
      };
      (
        ["logoScale", "navDensity", "verticalPadding", "mobileMenuStyle"] as const
      ).forEach((k) => {
        const v = input.density?.[k];
        if (v !== undefined) {
          if (v === null || v === "") delete d[k];
          else d[k] = v;
        }
      });
      if (Object.keys(d).length === 0) delete nextProps.density;
      else nextProps.density = d;
    }
  }
  if (input.regions !== undefined) {
    if (input.regions === null) delete nextProps.regions;
    else nextProps.regions = input.regions;
  }

  const res = await saveSectionDraftAction({
    id: f.sectionId,
    sectionTypeKey: f.sectionTypeKey,
    schemaVersion: f.schemaVersion,
    name: f.name,
    props: nextProps,
    expectedVersion: input.expectedVersion,
  });
  if (!res.ok) {
    return {
      ok: false,
      error: res.error,
      code: res.code,
      currentVersion: res.currentVersion,
    };
  }

  // MIRROR onto the landmark node when it owns its config inline. Without this
  // the row above is written, the operator is told "saved", and the live site
  // keeps rendering the old header forever — `resolveShellLandmarkSectionProps`
  // makes the node win. A no-op (and no `cms_pages` write at all) on every
  // slot-owned shell, which is all of them until Phase 8B seeds inline props.
  //
  // Ordered BEFORE the republish on purpose: the republish bakes
  // `cms_pages.blocks` into the snapshot the renderer reads.
  const mirror = await mirrorShellLandmarkSectionProps(auth.supabase, {
    tenantId: scope.tenantId,
    shellPageId: f.shellPageId,
    side: "header",
    nextProps,
  });
  if (!mirror.ok) return { ok: false, error: mirror.error };

  // Re-bake the published shell snapshot so the storefront/edit canvas
  // reflects the new variant/density (the renderer reads the snapshot,
  // not the draft section row).
  const rep = await republishSiteShellSnapshot(auth.supabase, {
    tenantId: scope.tenantId,
    locale: f.locale as Locale,
    actorProfileId: null,
  });
  if (!rep.ok) {
    return { ok: false, error: rep.error };
  }
  revalidateTag(tagFor(scope.tenantId, "pages-all"), "default");
  revalidateTag(tagFor(scope.tenantId, "storefront"), "default");

  return { ok: true, version: res.version };
}

// ── Read ───────────────────────────────────────────────────────────────

/**
 * Load the current header config for the active tenant. Reads identity +
 * branding via the staff client (always fresh) so the inspector never
 * shows a stale snapshot.
 *
 * Navigation is intentionally returned EMPTY here for the first cut —
 * the Navigation tab is a stub in this session; a follow-up commit
 * fills in cms_navigation_items reads.
 */
export async function loadHeaderConfigAction(): Promise<
  ActionResult<{ config: SiteHeaderConfig }>
> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return { ok: false, error: "No tenant in scope. Pick a workspace." };
  }

  const [identity, branding] = await Promise.all([
    loadIdentityForStaff(auth.supabase, scope.tenantId),
    loadBrandingForStaff(auth.supabase, scope.tenantId),
  ]);

  if (!branding) {
    return {
      ok: false,
      error: "Branding row missing for this tenant.",
      code: "NOT_FOUND",
    };
  }

  // Default locale = identity's default. Multi-locale switching is a
  // future control inside the Navigation tab; for now we open at the
  // tenant's primary so the operator sees their main menu.
  const defaultLocale = identity?.default_locale ?? "en";

  // Draft items for the active locale's header zone.
  const { data: navItems, error: navErr } = await auth.supabase
    .from("cms_navigation_items")
    .select(
      "id, label, href, visible, sort_order, version, parent_id, zone, locale",
    )
    .eq("tenant_id", scope.tenantId)
    .eq("zone", "header")
    .eq("locale", defaultLocale)
    .is("parent_id", null) // top-level only — submenu support lands later
    .order("sort_order", { ascending: true });
  if (navErr) {
    return {
      ok: false,
      error: `Navigation load failed: ${navErr.message}`,
    };
  }

  // Phase 6B — also resolve the site_header SECTION props (variant +
  // density) so the Layout tab can edit what the renderer actually reads.
  const headerSection = await resolveHeaderSection(
    auth.supabase,
    scope.tenantId,
    defaultLocale,
  );
  const sectionProps = (headerSection?.props ?? {}) as {
    variant?: unknown;
    brandDisplay?: unknown;
    density?: unknown;
    regions?: unknown;
  };
  const sectionCfg: SiteHeaderConfig["section"] = headerSection
    ? {
        sectionId: headerSection.sectionId,
        version: headerSection.version,
        variant:
          typeof sectionProps.variant === "string"
            ? sectionProps.variant
            : "standard",
        brandDisplay:
          typeof sectionProps.brandDisplay === "string"
            ? sectionProps.brandDisplay
            : "image-and-text",
        density:
          sectionProps.density && typeof sectionProps.density === "object"
            ? (sectionProps.density as HeaderSectionDensity)
            : null,
        // WF-6 — parse through the SECTION schema rather than casting, so a
        // hand-edited or partially-migrated props blob can never hand the
        // inspector a shape its reorder maths would then corrupt.
        regions: parseStoredRegions(sectionProps.regions),
      }
    : null;

  // WF-6 — the same predicate the save action enforces, resolved once here so
  // the drawer can render the locked state without a second round trip.
  const planTier = await loadBuilderWorkspacePlan(auth.supabase, scope.tenantId, {
    logTag: "site-header-inspector",
  });

  return {
    ok: true,
    config: {
      section: sectionCfg,
      canEditRegions: isHeaderRegionsEditAllowedForPlan(planTier),
      identity: {
        publicName: identity?.public_name ?? "",
        tagline: identity?.tagline ?? null,
        primaryCtaLabel: identity?.primary_cta_label ?? null,
        primaryCtaHref: identity?.primary_cta_href ?? null,
        // Phase 6B — surface current social/contact so the Brand tab
        // shows the operator what's already set (canonical store).
        contactEmail: identity?.contact_email ?? null,
        contactPhone: identity?.contact_phone ?? null,
        whatsapp: identity?.whatsapp ?? null,
        socialInstagram: identity?.social_instagram ?? null,
        socialTiktok: identity?.social_tiktok ?? null,
        socialFacebook: identity?.social_facebook ?? null,
        socialYoutube: identity?.social_youtube ?? null,
        socialLinkedin: identity?.social_linkedin ?? null,
        socialX: identity?.social_x ?? null,
        version: identity?.version ?? 0,
      },
      branding: {
        logoMediaAssetId: branding.logo_media_asset_id ?? null,
        brandMarkSvg: branding.brand_mark_svg ?? null,
        primaryColor: branding.primary_color ?? null,
        accentColor: branding.accent_color ?? null,
        fontPreset: branding.font_preset ?? null,
        themeJson: (branding.theme_json ?? {}) as Record<string, string>,
        version: branding.version ?? 0,
      },
      navigation: {
        locale: defaultLocale,
        items: (navItems ?? []).map((row) => ({
          id: row.id as string,
          label: row.label as string,
          href: row.href as string,
          visible: Boolean(row.visible),
          sortOrder: row.sort_order as number,
          version: row.version as number,
        })),
      },
    },
  };
}

// ── Identity patch ─────────────────────────────────────────────────────

interface IdentityPatchInput {
  expectedVersion: number;
  publicName?: string;
  tagline?: string | null;
  primaryCtaLabel?: string | null;
  primaryCtaHref?: string | null;
  // Phase 6B — operator-editable social/contact (canonical identity
  // store, shared with the footer). Omitted key = preserve current.
  contactEmail?: string | null;
  contactPhone?: string | null;
  whatsapp?: string | null;
  socialInstagram?: string | null;
  socialTiktok?: string | null;
  socialFacebook?: string | null;
  socialYoutube?: string | null;
  socialLinkedin?: string | null;
  socialX?: string | null;
}

/**
 * Patch the header-relevant identity fields (label, tagline, primary CTA).
 * Reads the current row, applies the partial, runs the existing
 * saveIdentity flow (CAS + cache bust + audit log).
 */
export async function saveHeaderIdentityAction(
  input: IdentityPatchInput,
): Promise<ActionResult<{ version: number }>> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "No tenant in scope." };

  const current = await loadIdentityForStaff(auth.supabase, scope.tenantId);

  const merged = {
    publicName:
      input.publicName ?? current?.public_name ?? "",
    legalName: current?.legal_name ?? null,
    tagline:
      input.tagline !== undefined ? input.tagline : (current?.tagline ?? null),
    footerTagline: current?.footer_tagline ?? null,
    contactEmail:
      input.contactEmail !== undefined
        ? input.contactEmail
        : (current?.contact_email ?? null),
    contactPhone:
      input.contactPhone !== undefined
        ? input.contactPhone
        : (current?.contact_phone ?? null),
    whatsapp:
      input.whatsapp !== undefined
        ? input.whatsapp
        : (current?.whatsapp ?? null),
    addressCity: current?.address_city ?? null,
    addressCountry: current?.address_country ?? null,
    serviceArea: current?.service_area ?? null,
    socialInstagram:
      input.socialInstagram !== undefined
        ? input.socialInstagram
        : (current?.social_instagram ?? null),
    socialTiktok:
      input.socialTiktok !== undefined
        ? input.socialTiktok
        : (current?.social_tiktok ?? null),
    socialFacebook:
      input.socialFacebook !== undefined
        ? input.socialFacebook
        : (current?.social_facebook ?? null),
    socialLinkedin:
      input.socialLinkedin !== undefined
        ? input.socialLinkedin
        : (current?.social_linkedin ?? null),
    socialYoutube:
      input.socialYoutube !== undefined
        ? input.socialYoutube
        : (current?.social_youtube ?? null),
    socialX:
      input.socialX !== undefined
        ? input.socialX
        : (current?.social_x ?? null),
    // A tenant that has never opened Identity has no row yet. Seed the pair
    // from the PLATFORM default rather than a literal "en": the literal made
    // every merge-save on such a tenant silently rewrite its locale set to
    // English, and it hardcodes a language choice the platform can change.
    // Keeping default + supported consistent also guarantees the saved row can
    // never claim a default that is not in its own supported list.
    defaultLocale: current?.default_locale ?? DEFAULT_PLATFORM_LOCALE,
    supportedLocales:
      current?.supported_locales ??
      [current?.default_locale ?? DEFAULT_PLATFORM_LOCALE],
    seoDefaultTitle: current?.seo_default_title ?? null,
    seoDefaultDescription: current?.seo_default_description ?? null,
    seoDefaultShareImageMediaAssetId:
      current?.seo_default_share_image_media_asset_id ?? null,
    primaryCtaLabel:
      input.primaryCtaLabel !== undefined
        ? input.primaryCtaLabel
        : (current?.primary_cta_label ?? null),
    primaryCtaHref:
      input.primaryCtaHref !== undefined
        ? input.primaryCtaHref
        : (current?.primary_cta_href ?? null),
    expectedVersion: input.expectedVersion,
  };

  const parsed = identityFormSchema.safeParse(merged);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid identity payload.",
      code: "VALIDATION",
    };
  }

  const result = await saveIdentity(auth.supabase, {
    tenantId: scope.tenantId,
    values: parsed.data,
    actorProfileId: auth.user.id,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.message ?? "Save failed.",
      code: result.code,
      currentVersion: result.currentVersion,
    };
  }
  return { ok: true, version: result.data.version };
}

// ── Branding patch (logo, brand mark) ───────────────────────────────────

interface BrandingPatchInput {
  expectedVersion: number;
  logoMediaAssetId?: string | null;
  brandMarkSvg?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  fontPreset?: string | null;
}

export async function saveHeaderBrandingAction(
  input: BrandingPatchInput,
): Promise<ActionResult<{ version: number }>> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "No tenant in scope." };

  const current = await loadBrandingForStaff(auth.supabase, scope.tenantId);

  const merged = {
    primaryColor:
      input.primaryColor !== undefined
        ? input.primaryColor
        : (current?.primary_color ?? null),
    secondaryColor: current?.secondary_color ?? null,
    accentColor:
      input.accentColor !== undefined
        ? input.accentColor
        : (current?.accent_color ?? null),
    neutralColor: current?.neutral_color ?? null,
    logoMediaAssetId:
      input.logoMediaAssetId !== undefined
        ? input.logoMediaAssetId
        : (current?.logo_media_asset_id ?? null),
    logoDarkMediaAssetId: current?.logo_dark_media_asset_id ?? null,
    faviconMediaAssetId: current?.favicon_media_asset_id ?? null,
    ogImageMediaAssetId: current?.og_image_media_asset_id ?? null,
    fontPreset:
      input.fontPreset !== undefined
        ? input.fontPreset
        : (current?.font_preset ?? null),
    headingFont: current?.heading_font ?? null,
    bodyFont: current?.body_font ?? null,
    brandMarkSvg:
      input.brandMarkSvg !== undefined
        ? input.brandMarkSvg
        : (current?.brand_mark_svg ?? null),
    expectedVersion: input.expectedVersion,
  };

  const parsed = brandingFormSchema.safeParse(merged);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid branding payload.",
      code: "VALIDATION",
    };
  }

  const result = await saveBranding(auth.supabase, {
    tenantId: scope.tenantId,
    values: parsed.data,
    actorProfileId: auth.user.id,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.message ?? "Save failed.",
      code: result.code,
      currentVersion: result.currentVersion,
    };
  }
  return { ok: true, version: result.data.version };
}

// ── Theme token patch (shell.* tokens) ─────────────────────────────────

interface TokenPatchInput {
  /** Map of token key → enum value. Validated server-side against the registry. */
  patch: Record<string, string>;
  expectedVersion: number;
}

/**
 * Save + publish a theme-token patch in one round trip.
 *
 * Inspector model is "operator clicks chip → live header reflects within
 * 200ms". Two server hops (saveDesignDraft → publishDesign) match the
 * existing token edit flow's audit trail; we fire them sequentially and
 * return the post-publish version for the next call's CAS.
 *
 * On VERSION_CONFLICT the inspector reloads the config and retries —
 * conflicts are most likely when two operators race or when the same
 * operator is editing in two tabs.
 *
 * ── 2026-08-16: this action destroyed a live theme ─────────────────────────
 * `input.patch` is a PARTIAL patch — the inspector chips call
 * `patchToken(key, value)` with ONE key (BrandTab.tsx:334 et al). The original
 * wiring did two unsafe things with it:
 *
 *   1. `saveDesignDraft` REPLACES `theme_json_draft` with the patch, so a chip
 *      click cut the shared draft column down to that one key.
 *   2. The publish that followed was UNSCOPED, and an unscoped publish treats
 *      the draft as the complete theme — so the one-key draft replaced the
 *      55-token live map. Impronta's live `theme_json` went 58 keys → 4.
 *
 * Both halves are fixed here: the draft save MERGES onto the stored draft, and
 * the publish is SCOPED to the patch's own keys so every other live token is
 * left exactly where it is. `publishDesign`'s shrink guard backstops both.
 */
export async function saveHeaderTokenAction(
  input: TokenPatchInput,
): Promise<ActionResult<{ version: number; theme: Record<string, string> }>> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "No tenant in scope." };

  const draft = await saveDesignDraft(auth.supabase, {
    tenantId: scope.tenantId,
    values: {
      tenantId: scope.tenantId,
      patch: input.patch,
      expectedVersion: input.expectedVersion,
    },
    actorProfileId: auth.user.id,
    // PARTIAL patch — never replace the shared draft column with these keys.
    mergeIntoStoredDraft: true,
  });
  if (!draft.ok) {
    return {
      ok: false,
      error: draft.message ?? "Token draft save failed.",
      code: draft.code,
      currentVersion: draft.currentVersion,
    };
  }

  const publish = await publishDesign(auth.supabase, {
    tenantId: scope.tenantId,
    values: {
      tenantId: scope.tenantId,
      expectedVersion: draft.data.version,
    },
    actorProfileId: auth.user.id,
    // SCOPED to this patch's keys. The inspector owns these tokens and nothing
    // else; every other live token must survive the publish untouched.
    scopeKeys: new Set(Object.keys(input.patch)),
  });
  if (!publish.ok) {
    return {
      ok: false,
      error: publish.message ?? "Token publish failed.",
      code: publish.code,
      currentVersion:
        publish.code === "VERSION_CONFLICT"
          ? publish.currentVersion
          : draft.data.version,
    };
  }

  // Belt + suspenders: publishDesign already busts branding + storefront
  // tags via updateTag. Add an explicit revalidate for the navigation
  // tag too — when an operator changes layout tokens, the navigation
  // cached read should NOT bust (no nav data changed) so we deliberately
  // do NOT touch tagFor("navigation"). Identity/branding are handled by
  // the underlying server function. Nothing to do here for now.
  void tagFor; // (kept import for future use)
  void revalidateTag;

  return {
    ok: true,
    version: publish.data.version,
    theme: publish.data.theme,
  };
}

// ── Navigation bulk save + publish ─────────────────────────────────────

interface NavBulkInput {
  /** Locale of the menu being edited. */
  locale: string;
  /** Final desired ordered list. Server diff-applies this against current
   *  drafts: missing rows → delete; new rows (no id) → insert; existing
   *  rows → CAS update; any reorder is captured by sortOrder = i*10. */
  items: SiteHeaderNavItemInput[];
}

interface NavBulkResult {
  /** Items as they exist after save+publish, in sortOrder. Includes
   *  server-assigned ids for newly-inserted rows so the client can
   *  re-key them without re-loading. */
  items: Array<{
    id: string;
    label: string;
    href: string;
    visible: boolean;
    sortOrder: number;
    version: number;
  }>;
}

/**
 * Bulk save + publish the header navigation for one locale.
 *
 * The inspector sends its FINAL desired state (the operator's mental
 * model is "edit the list, the server makes it match"). Server diffs
 * against current drafts:
 *   - rows in DB but not in input → deleted
 *   - input rows without `id`     → inserted (sortOrder = i*10)
 *   - input rows with `id`        → CAS-updated (label/href/visible/sort)
 *
 * After draft mutations the menu is published in the same call so the
 * live storefront reflects within one round trip.
 *
 * Conflict policy: any single CAS conflict aborts the batch and
 * returns VERSION_CONFLICT. The inspector reloads + retries; the
 * operator sees a brief "Saved" → "Refreshing" reconciliation.
 */
export async function saveHeaderNavigationAction(
  input: NavBulkInput,
): Promise<ActionResult<NavBulkResult>> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "No tenant in scope." };

  // Load current drafts (top-level header items) so we can diff.
  const { data: currentRows, error: loadErr } = await auth.supabase
    .from("cms_navigation_items")
    .select(
      "id, label, href, visible, sort_order, version, parent_id, zone, locale, tenant_id, created_at, updated_at",
    )
    .eq("tenant_id", scope.tenantId)
    .eq("zone", "header")
    .eq("locale", input.locale)
    .is("parent_id", null);
  if (loadErr) {
    return { ok: false, error: `Load failed: ${loadErr.message}` };
  }
  const current: NavItemRow[] = (currentRows ?? []) as unknown as NavItemRow[];

  const inputIds = new Set(
    input.items.map((i) => i.id).filter(Boolean) as string[],
  );

  // 1. Deletes — items in DB whose id is no longer in the input.
  for (const row of current) {
    if (!inputIds.has(row.id)) {
      const res = await deleteNavItem(auth.supabase, {
        tenantId: scope.tenantId,
        values: {
          id: row.id,
          zone: "header",
          locale: input.locale as never,
          expectedVersion: row.version,
        },
        actorProfileId: auth.user.id,
      });
      if (!res.ok) {
        return {
          ok: false,
          error: res.message ?? "Delete failed.",
          code: res.code,
        };
      }
    }
  }

  // 2. Upserts in input order. Each row's sortOrder is reassigned to
  //    `i * 10` so the operator sees their visual order materialised in
  //    the database (gaps make future single-item moves cheap).
  const upsertedById = new Map<string, NavItemRow>();
  const upsertedNewIndices: number[] = []; // input indices for new rows

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i]!;
    const sortOrder = (i + 1) * 10;
    if (item.id) {
      // Update existing.
      const dbRow = current.find((r) => r.id === item.id);
      const expectedVersion = item.expectedVersion ?? dbRow?.version ?? 0;
      const res = await upsertNavItem(auth.supabase, {
        tenantId: scope.tenantId,
        values: {
          id: item.id,
          zone: "header",
          locale: input.locale as never,
          parentId: null,
          label: item.label,
          href: item.href,
          sortOrder,
          visible: item.visible,
          expectedVersion,
        },
        actorProfileId: auth.user.id,
      });
      if (!res.ok) {
        return {
          ok: false,
          error: res.message ?? "Update failed.",
          code: res.code,
          currentVersion: res.currentVersion,
        };
      }
      // Track the post-save shape for the response.
      upsertedById.set(res.data.id, {
        ...(dbRow ?? ({} as NavItemRow)),
        id: res.data.id,
        label: item.label,
        href: item.href,
        visible: item.visible,
        sort_order: sortOrder,
        version: res.data.version,
      });
    } else {
      // Insert new.
      const res = await upsertNavItem(auth.supabase, {
        tenantId: scope.tenantId,
        values: {
          zone: "header",
          locale: input.locale as never,
          parentId: null,
          label: item.label,
          href: item.href,
          sortOrder,
          visible: item.visible,
          expectedVersion: 0,
        },
        actorProfileId: auth.user.id,
      });
      if (!res.ok) {
        return {
          ok: false,
          error: res.message ?? "Insert failed.",
          code: res.code,
        };
      }
      upsertedById.set(res.data.id, {
        id: res.data.id,
        tenant_id: scope.tenantId,
        zone: "header",
        locale: input.locale as never,
        parent_id: null,
        label: item.label,
        href: item.href,
        sort_order: sortOrder,
        visible: item.visible,
        version: res.data.version,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      upsertedNewIndices.push(i);
    }
  }

  // 3. Reorder fixup. upsertNavItem already wrote sort_order, but the
  //    public `reorderNavItems` helper guarantees parent_id + sort_order
  //    are set atomically. We've already done the work above; just rely
  //    on it. (Skip the no-op here.)
  void reorderNavItems;

  // 4. Publish. Load the current menu row's version for CAS (0 if no
  //    row yet — first-ever publish for this tenant + zone + locale).
  const { data: menuRow } = await auth.supabase
    .from("cms_navigation_menus")
    .select("version")
    .eq("tenant_id", scope.tenantId)
    .eq("zone", "header")
    .eq("locale", input.locale)
    .maybeSingle<{ version: number }>();
  const publishRes = await publishNavigationMenu(auth.supabase, {
    tenantId: scope.tenantId,
    values: {
      zone: "header",
      locale: input.locale as never,
      expectedMenuVersion: menuRow?.version ?? 0,
    },
    actorProfileId: auth.user.id,
  });
  if (!publishRes.ok) {
    return {
      ok: false,
      error: publishRes.message ?? "Publish failed.",
      code: publishRes.code,
    };
  }

  // 5. Build response in sortOrder.
  const orderedItems = Array.from(upsertedById.values())
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) => ({
      id: row.id,
      label: row.label,
      href: row.href,
      visible: row.visible,
      sortOrder: row.sort_order,
      version: row.version,
    }));

  return { ok: true, items: orderedItems };
}
