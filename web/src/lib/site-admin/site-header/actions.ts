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

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { tagFor } from "@/lib/site-admin/cache-tags";
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
  brandingFormSchema,
  identityFormSchema,
} from "@/lib/site-admin";
import type { SiteHeaderConfig } from "./types";

// ── Result envelope ────────────────────────────────────────────────────
type ActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; code?: string; currentVersion?: number };

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
  const auth = await requireStaff();
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

  return {
    ok: true,
    config: {
      identity: {
        publicName: identity?.public_name ?? "",
        tagline: identity?.tagline ?? null,
        primaryCtaLabel: identity?.primary_cta_label ?? null,
        primaryCtaHref: identity?.primary_cta_href ?? null,
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
        // Step 5b first-cut: navigation tab not yet wired. Returns an
        // empty list; the published tree still drives the live render.
        items: [],
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
}

/**
 * Patch the header-relevant identity fields (label, tagline, primary CTA).
 * Reads the current row, applies the partial, runs the existing
 * saveIdentity flow (CAS + cache bust + audit log).
 */
export async function saveHeaderIdentityAction(
  input: IdentityPatchInput,
): Promise<ActionResult<{ version: number }>> {
  const auth = await requireStaff();
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
    contactEmail: current?.contact_email ?? null,
    contactPhone: current?.contact_phone ?? null,
    whatsapp: current?.whatsapp ?? null,
    addressCity: current?.address_city ?? null,
    addressCountry: current?.address_country ?? null,
    serviceArea: current?.service_area ?? null,
    socialInstagram: current?.social_instagram ?? null,
    socialTiktok: current?.social_tiktok ?? null,
    socialFacebook: current?.social_facebook ?? null,
    socialLinkedin: current?.social_linkedin ?? null,
    socialYoutube: current?.social_youtube ?? null,
    socialX: current?.social_x ?? null,
    defaultLocale: current?.default_locale ?? "en",
    supportedLocales: current?.supported_locales ?? ["en"],
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
}

export async function saveHeaderBrandingAction(
  input: BrandingPatchInput,
): Promise<ActionResult<{ version: number }>> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "No tenant in scope." };

  const current = await loadBrandingForStaff(auth.supabase, scope.tenantId);

  const merged = {
    primaryColor: current?.primary_color ?? null,
    secondaryColor: current?.secondary_color ?? null,
    accentColor: current?.accent_color ?? null,
    neutralColor: current?.neutral_color ?? null,
    logoMediaAssetId:
      input.logoMediaAssetId !== undefined
        ? input.logoMediaAssetId
        : (current?.logo_media_asset_id ?? null),
    logoDarkMediaAssetId: current?.logo_dark_media_asset_id ?? null,
    faviconMediaAssetId: current?.favicon_media_asset_id ?? null,
    ogImageMediaAssetId: current?.og_image_media_asset_id ?? null,
    fontPreset: current?.font_preset ?? null,
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
 */
export async function saveHeaderTokenAction(
  input: TokenPatchInput,
): Promise<ActionResult<{ version: number; theme: Record<string, string> }>> {
  const auth = await requireStaff();
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
