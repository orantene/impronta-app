/**
 * retheme-after-logo.server.ts — the logo lands AFTER the site composed
 * (onboarding v3.2: account → provisioning → arrival → logo), so the shell
 * was written with the name-mark. This re-instantiates ONLY the shell header
 * and footer from the stamped Look with the logo in place and leaves every
 * page alone. It refuses to touch a shell someone edited after the compose
 * (same rule as pages: edit history wins), so call it freely from the logo
 * upload path.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Locale } from "@/i18n/config";
import { logServerError } from "@/lib/server/safe-error";
import { loadIdentityForStaff } from "@/lib/site-admin/server/reads";

import type { SiteComposeStamp } from "./compose-site-from-brief.server";
import { instantiateSite } from "./instantiate-site";
import { loadLookBySlug } from "./site-looks.server";
import type { SiteIdentity } from "./types";
import { writeFreeformSiteShell } from "./write-site-shell.server";

export type RethemeOutcome = "rethemed" | "no_stamp" | "no_logo" | "shell_edited" | "failed";

export async function rethemeSiteAfterLogo(
  admin: SupabaseClient,
  input: { tenantId: string; actorProfileId?: string | null; logoUrl?: string | null },
): Promise<{ outcome: RethemeOutcome; note?: string }> {
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
    if (!logoUrl) return { outcome: "no_logo" };

    const look = await loadLookBySlug(admin, stamp.lookId);
    if (!look) return { outcome: "failed", note: `look ${stamp.lookId} not found` };
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
    return { outcome: "rethemed" };
  } catch (err) {
    logServerError("retheme-after-logo", err);
    return { outcome: "failed", note: err instanceof Error ? err.message : "unknown" };
  }
}
