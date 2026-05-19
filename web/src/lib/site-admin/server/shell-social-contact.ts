/**
 * Phase 6B — shared social/contact resolver for the modern site shell.
 *
 * Mirrors `resolveShellBrandLogoUrl`: a narrowly-scoped public read of the
 * tenant's own `agency_business_identity` social/contact columns (anon
 * RLS allows this read — verified), under a distinct short-TTL cache key
 * with the tenant `branding` tag so the canonical identity save busts it
 * instantly and stale out-of-band writes self-heal within the TTL.
 *
 * This is the SINGLE source of truth the header cluster renders from —
 * the same `agency_business_identity` store the operator edits in the
 * inspector's Brand → "Social & contact" area (and the footer's social
 * derives from). No parallel store; nothing is invented (null column =
 * the link simply isn't returned).
 *
 * Shapes returned match `site_header` schema (`socialLinkSchema` /
 * `contactLinkSchema`) so the Component can use them verbatim.
 */
import { unstable_cache } from "next/cache";

import { tagFor } from "@/lib/site-admin/cache-tags";
import {
  normalizeHeaderContactLink,
  normalizeHeaderSocialLink,
  type HeaderContactType,
  type HeaderSocialPlatform,
} from "@/lib/site-admin/site-header/social-contact-normalize";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

export type ShellSocialLink = {
  platform: HeaderSocialPlatform;
  href: string;
  /** Optional accessible label (matches the section-prop schema shape). */
  label?: string;
};
export type ShellContactLink = {
  type: HeaderContactType;
  value: string;
  /** Optional display label (matches the section-prop schema shape). */
  label?: string;
};
export type ShellSocialContact = {
  socialLinks: ShellSocialLink[];
  contactLinks: ShellContactLink[];
};

const SHELL_SOCIAL_TTL_SECONDS = 300;

const EMPTY: ShellSocialContact = { socialLinks: [], contactLinks: [] };

type IdentityRow = {
  social_instagram: string | null;
  social_tiktok: string | null;
  social_facebook: string | null;
  social_youtube: string | null;
  social_linkedin: string | null;
  social_x: string | null;
  whatsapp: string | null;
  contact_phone: string | null;
  contact_email: string | null;
};

function clean(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

function loadShellSocialContact(tenantId: string): Promise<ShellSocialContact> {
  return unstable_cache(
    async (): Promise<ShellSocialContact> => {
      const supabase = createPublicSupabaseClient();
      if (!supabase) return EMPTY;
      const { data, error } = await supabase
        .from("agency_business_identity")
        .select(
          "social_instagram, social_tiktok, social_facebook, social_youtube, social_linkedin, social_x, whatsapp, contact_phone, contact_email",
        )
        .eq("tenant_id", tenantId)
        .maybeSingle<IdentityRow>();
      if (error || !data) return EMPTY;

      const socialLinks: ShellSocialLink[] = [];
      const ig = clean(data.social_instagram);
      if (ig) {
        const link = normalizeHeaderSocialLink("instagram", ig);
        if (link) socialLinks.push(link);
      }
      const tk = clean(data.social_tiktok);
      if (tk) {
        const link = normalizeHeaderSocialLink("tiktok", tk);
        if (link) socialLinks.push(link);
      }
      const fb = clean(data.social_facebook);
      if (fb) {
        const link = normalizeHeaderSocialLink("facebook", fb);
        if (link) socialLinks.push(link);
      }
      const yt = clean(data.social_youtube);
      if (yt) {
        const link = normalizeHeaderSocialLink("youtube", yt);
        if (link) socialLinks.push(link);
      }
      const li = clean(data.social_linkedin);
      if (li) {
        const link = normalizeHeaderSocialLink("linkedin", li);
        if (link) socialLinks.push(link);
      }
      const x = clean(data.social_x);
      if (x) {
        const link = normalizeHeaderSocialLink("x", x);
        if (link) socialLinks.push(link);
      }

      const contactLinks: ShellContactLink[] = [];
      const wa = clean(data.whatsapp);
      if (wa) {
        const link = normalizeHeaderContactLink("whatsapp", wa);
        if (link) contactLinks.push(link);
      }
      const ph = clean(data.contact_phone);
      if (ph) {
        const link = normalizeHeaderContactLink("phone", ph);
        if (link) contactLinks.push(link);
      }
      const em = clean(data.contact_email);
      if (em) {
        const link = normalizeHeaderContactLink("email", em);
        if (link) contactLinks.push(link);
      }

      return { socialLinks, contactLinks };
    },
    ["site-admin:shell-social-contact:v2", tenantId],
    {
      revalidate: SHELL_SOCIAL_TTL_SECONDS,
      // Social/contact lives in agency_business_identity, which the
      // canonical identity save (saveIdentity) busts via the "identity"
      // + "storefront" tags — NOT "branding". Tag accordingly so an
      // operator's drawer edit reflects in the header immediately.
      tags: [tagFor(tenantId, "identity"), tagFor(tenantId, "storefront")],
    },
  )();
}

/**
 * Resolve the tenant's social/contact for the header cluster. Explicit
 * section-prop links (operator override on a specific section) always
 * win; otherwise fall back to the canonical identity store so the
 * inspector's "Social & contact" edits render with zero extra wiring.
 */
export async function resolveShellSocialContact(params: {
  tenantId: string;
  explicitSocial?: ShellSocialLink[] | null;
  explicitContact?: ShellContactLink[] | null;
}): Promise<ShellSocialContact> {
  const explicitSocial = (params.explicitSocial ?? [])
    .map((link) =>
      normalizeHeaderSocialLink(link.platform, link.href, link.label),
    )
    .filter((link): link is ShellSocialLink => link != null);
  const explicitContact = (params.explicitContact ?? [])
    .map((link) =>
      normalizeHeaderContactLink(link.type, link.value, link.label),
    )
    .filter((link): link is ShellContactLink => link != null);
  if (explicitSocial.length > 0 || explicitContact.length > 0) {
    return { socialLinks: explicitSocial, contactLinks: explicitContact };
  }
  if (!params.tenantId) return EMPTY;
  return loadShellSocialContact(params.tenantId);
}
