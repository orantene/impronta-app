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
import type {
  SiteHeaderConfig,
  SiteHeaderNavItemInput,
} from "./types";

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
  primaryColor?: string | null;
  accentColor?: string | null;
  fontPreset?: string | null;
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
  const auth = await requireStaff();
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
