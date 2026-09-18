/**
 * retheme-after-logo.server.ts — recolour a composed site from the palette the
 * OWNER CHOSE (owner logo rule 2026-09-16): never called on a logo upload by
 * itself. The upload path offers `candidatePalettesFromHexes` (≤ 3 swatches,
 * demotions shown); this runs only with the picked palette. Refuses when the
 * shell was edited since the compose, so an owner's edit is never overwritten.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Locale } from "@/i18n/config";
import { logServerError } from "@/lib/server/safe-error";
import { loadIdentityForStaff } from "@/lib/site-admin/server/reads";

import type { SiteComposeStamp } from "./compose-site-from-brief.server";
import { instantiateSite } from "./instantiate-site";
import { loadLookBySlug } from "./site-looks.server";
import { themePatchFromPalette } from "./theme-from-palette";
import { tagFor } from "@/lib/site-admin/cache-tags";
import { updateTag } from "next/cache";
import { validateThemePatch } from "@/lib/site-admin/tokens/registry";
import type { SiteIdentity } from "./types";
import { writeFreeformSiteShell } from "./write-site-shell.server";

export type RethemeOutcome = "rethemed" | "no_stamp" | "no_logo" | "shell_edited" | "failed";

export async function rethemeSiteAfterLogo(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    actorProfileId?: string | null;
    logoUrl?: string | null;
    /** Hexes extracted from the logo by the caller (onboarding Phase 4); recoloured onto the stamped Look, demoted never refused. */
    palette?: string[] | null;
  },
): Promise<{ outcome: RethemeOutcome; note?: string; paletteDemoted?: string[] }> {
  try {
    const { data: agency, error } = await admin.from("agencies").select("settings, display_name, supported_locales").eq("id", input.tenantId).maybeSingle<{ settings: Record<string, unknown> | null; display_name: string | null; supported_locales: string[] | null }>();
    if (error) return { outcome: "failed", note: error.message };
    const stamp = agency?.settings?.site_compose as SiteComposeStamp | undefined;
    if (!stamp?.lookId) return { outcome: "no_stamp" };

    let logoUrl = input.logoUrl ?? null;
    if (!logoUrl) {
      const { data: b, error: bErr } = await admin.from("agency_branding").select("logo_media_asset_id").eq("tenant_id", input.tenantId).maybeSingle<{ logo_media_asset_id: string | null }>();
      if (bErr) return { outcome: "failed", note: bErr.message };
      if (b?.logo_media_asset_id) {
        const { data: a, error: aErr } = await admin.from("media_assets").select("storage_path, bucket_id").eq("id", b.logo_media_asset_id).maybeSingle<{ storage_path: string | null; bucket_id: string | null }>();
        if (aErr) return { outcome: "failed", note: aErr.message };
        if (a?.storage_path) logoUrl = admin.storage.from(a.bucket_id ?? "media-public").getPublicUrl(a.storage_path).data.publicUrl;
      }
    }
    if (!logoUrl && !(input.palette && input.palette.length > 0)) return { outcome: "no_logo" };

    const look = await loadLookBySlug(admin, stamp.lookId);
    if (!look) return { outcome: "failed", note: `look ${stamp.lookId} not found` };

    // Palette from the logo: same mapper as the compose, written to the theme
    // draft (and live when the shell is published). Pages are untouched; the
    // theme is tokens, so every page recolours without a rewrite.
    let paletteDemoted: string[] | undefined;
    if (input.palette && input.palette.length > 0) {
      const mapped = themePatchFromPalette(look.themePatch, input.palette);
      const gate = validateThemePatch({ ...mapped.patch });
      paletteDemoted = mapped.demoted;
      const { error: themeErr } = await admin.from("agency_branding").upsert({ tenant_id: input.tenantId, theme_json_draft: gate.normalized } as never, { onConflict: "tenant_id" });
      if (themeErr) return { outcome: "failed", note: `theme: ${themeErr.message}` };
    }
    const identityRow = await loadIdentityForStaff(admin, input.tenantId);
    const locale: "es" | "en" = (identityRow?.default_locale ?? agency?.supported_locales?.[0]) === "en" ? "en" : "es";

    // Edit history wins: a shell touched after the compose is a person's.
    const { data: shellRow, error: shellErr } = await admin
      .from("cms_pages")
      .select("id, status, updated_at")
      .eq("tenant_id", input.tenantId)
      .eq("locale", locale)
      .eq("system_template_key", "site_shell")
      .neq("status", "archived")
      .maybeSingle<{ id: string; status: string; updated_at: string }>();
    if (shellErr) return { outcome: "failed", note: shellErr.message };
    if (shellRow && new Date(shellRow.updated_at).getTime() > new Date(stamp.at).getTime() + 60_000) return { outcome: "shell_edited" };

    const identity: SiteIdentity = {
      businessName: identityRow?.public_name?.trim() || agency?.display_name?.trim() || "",
      tagline: identityRow?.tagline ?? null,
      city: identityRow?.address_city ?? null,
      whatsapp: identityRow?.whatsapp ?? null,
      instagram: identityRow?.social_instagram ?? null,
      facebook: identityRow?.social_facebook ?? null,
      logoUrl,
    };
    const site = instantiateSite({ look, locale, identity, images: () => null, components: new Map() });
    const res = await writeFreeformSiteShell(admin, {
      tenantId: input.tenantId,
      locale: locale as Locale,
      actorProfileId: input.actorProfileId ?? null,
      businessName: identity.businessName,
      header: site.shell.header,
      footer: site.shell.footer,
      publish: shellRow?.status === "published",
      overwrite: true,
    });
    if (!res.ok) return { outcome: "failed", note: res.error };
    if (res.published) {
      const { error: liveErr } = await admin.from("agency_branding").select("theme_json_draft").eq("tenant_id", input.tenantId).maybeSingle<{ theme_json_draft: Record<string, string> | null }>().then(async (r) => {
        if (r.error || !r.data?.theme_json_draft || !input.palette?.length) return { error: r.error };
        return admin.from("agency_branding").update({ theme_json: r.data.theme_json_draft } as never).eq("tenant_id", input.tenantId);
      });
      if (liveErr) return { outcome: "failed", note: `theme publish: ${liveErr.message}` };
    }
    try {
      updateTag(tagFor(input.tenantId, "branding"));
    } catch {
      /* outside a request scope */
    }
    return { outcome: "rethemed", paletteDemoted };
  } catch (err) {
    logServerError("retheme-after-logo", err);
    return { outcome: "failed", note: err instanceof Error ? err.message : "unknown" };
  }
}
