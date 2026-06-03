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
