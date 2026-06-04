import "server-only";

import { revalidateTag } from "next/cache";

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tagFor } from "@/lib/site-admin";

type IdentitySnapshot = Record<string, unknown> & {
  tenant_id: string;
  social_youtube: string | null;
  version: number;
};

/**
 * The config_json key that gates whether a verified/connected workspace YouTube
 * channel is mirrored into `agency_business_identity.social_youtube` (and thus
 * rendered on the public site header/footer).
 *
 * Privacy-first default: when the key is absent or not strictly `true`, the
 * channel is NOT published. Connecting/verifying a channel and publishing it on
 * the public site are deliberately decoupled — a tenant can verify ownership
 * (workspace trust) without exposing the channel publicly. The OAuth connect
 * flow and the manual-URL save both seed this OFF; the workspace toggles it on
 * explicitly from the integration drawer.
 */
export const YOUTUBE_SHOW_ON_PUBLIC_SITE_KEY = "show_on_public_site" as const;

/**
 * Pure publish-decision helper (no IO) so the sync behaviour is unit-testable.
 * Returns the URL that should land in `social_youtube` for the given integration
 * config, or `null` when nothing should be published.
 *
 * Publishes ONLY when:
 *   - a non-empty `profile_url` is configured, AND
 *   - `show_on_public_site === true` (strict; absent/false → do not publish).
 */
export function resolveYouTubePublishUrl(
  config: Record<string, unknown> | null | undefined,
): string | null {
  if (!config) return null;
  if (config[YOUTUBE_SHOW_ON_PUBLIC_SITE_KEY] !== true) return null;
  const raw = config.profile_url;
  const url = typeof raw === "string" ? raw.trim() : "";
  return url || null;
}

const IDENTITY_SELECT = `
  tenant_id,
  public_name,
  legal_name,
  tagline,
  footer_tagline,
  contact_email,
  contact_phone,
  whatsapp,
  address_city,
  address_country,
  service_area,
  social_instagram,
  social_tiktok,
  social_facebook,
  social_linkedin,
  social_youtube,
  social_x,
  default_locale,
  supported_locales,
  show_language_switcher,
  seo_default_title,
  seo_default_description,
  seo_default_share_image_media_asset_id,
  primary_cta_label,
  primary_cta_href,
  version,
  updated_by,
  created_at,
  updated_at
`;

function revalidateIdentity(tenantId: string) {
  revalidateTag(tagFor(tenantId, "identity"), "default");
  revalidateTag(tagFor(tenantId, "storefront"), "default");
}

async function loadIdentity(tenantId: string): Promise<IdentitySnapshot | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("agency_business_identity")
    .select(IDENTITY_SELECT)
    .eq("tenant_id", tenantId)
    .maybeSingle<IdentitySnapshot>();
  if (error || !data) {
    if (error) logServerError("workspaceSocialSync.loadIdentity", error);
    return null;
  }
  return data;
}

async function updateYouTubeIdentity(input: {
  tenantId: string;
  actorUserId: string | null;
  nextValue: string | null;
}): Promise<boolean> {
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const current = await loadIdentity(input.tenantId);
  if (!current) return false;
  if ((current.social_youtube ?? null) === input.nextValue) return true;

  const nextVersion = current.version + 1;
  const { data: updated, error } = await admin
    .from("agency_business_identity")
    .update({
      social_youtube: input.nextValue,
      version: nextVersion,
      updated_by: input.actorUserId,
    })
    .eq("tenant_id", input.tenantId)
    .eq("version", current.version)
    .select(IDENTITY_SELECT)
    .maybeSingle<IdentitySnapshot>();
  if (error || !updated) {
    logServerError("workspaceSocialSync.updateYouTubeIdentity", error ?? {
      message: "Version conflict or missing identity row.",
    });
    return false;
  }

  const { error: revisionError } = await admin
    .from("agency_business_identity_revisions")
    .insert({
      tenant_id: input.tenantId,
      version: nextVersion,
      snapshot: updated,
      created_by: input.actorUserId,
    });
  if (revisionError) {
    logServerError("workspaceSocialSync.identityRevision", revisionError);
  }
  revalidateIdentity(input.tenantId);
  return true;
}

export async function syncWorkspaceYouTubeIdentity(input: {
  tenantId: string;
  profileUrl: string;
  actorUserId: string | null;
}): Promise<boolean> {
  const profileUrl = input.profileUrl.trim();
  if (!profileUrl) return false;
  return updateYouTubeIdentity({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    nextValue: profileUrl,
  });
}

export async function clearWorkspaceYouTubeIdentity(input: {
  tenantId: string;
  expectedProfileUrl?: string | null;
  actorUserId: string | null;
}): Promise<boolean> {
  const current = await loadIdentity(input.tenantId);
  if (!current) return false;
  const currentValue = current.social_youtube ?? null;
  const expected = input.expectedProfileUrl?.trim() || null;
  if (!currentValue) return true;
  if (expected && currentValue !== expected) return true;
  return updateYouTubeIdentity({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    nextValue: null,
  });
}

/**
 * Single reconciliation entry point that respects the "Show on public site"
 * toggle. Given the integration's current config + the profile URL it had
 * BEFORE this save (so we never clobber a hand-edited identity value), it:
 *   - publishes the channel URL into `social_youtube` when the toggle is ON, or
 *   - clears `social_youtube` (only when it still matches the integration-owned
 *     value) when the toggle is OFF / the URL is empty.
 *
 * This is the one path the OAuth callback, the manual-URL save, and disconnect
 * should call so the publish behaviour is identical and toggle-aware everywhere.
 */
export async function applyWorkspaceYouTubePublishState(input: {
  tenantId: string;
  config: Record<string, unknown> | null | undefined;
  previousProfileUrl?: string | null;
  actorUserId: string | null;
}): Promise<boolean> {
  const publishUrl = resolveYouTubePublishUrl(input.config);
  if (publishUrl) {
    return syncWorkspaceYouTubeIdentity({
      tenantId: input.tenantId,
      profileUrl: publishUrl,
      actorUserId: input.actorUserId,
    });
  }
  // Toggle OFF or no URL → clear, but only if the live identity value is still
  // the one this integration last published (guard against clobbering a value a
  // tenant typed directly into Business identity). We accept either the new
  // profile_url or the prior one as a "matches us" signal.
  const currentProfileUrl =
    typeof input.config?.profile_url === "string"
      ? (input.config.profile_url as string).trim() || null
      : null;
  const expected = currentProfileUrl ?? input.previousProfileUrl ?? null;
  return clearWorkspaceYouTubeIdentity({
    tenantId: input.tenantId,
    expectedProfileUrl: expected,
    actorUserId: input.actorUserId,
  });
}
