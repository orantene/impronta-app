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
import { createPublicSupabaseClient } from "@/lib/supabase/public";

export type ShellSocialLink = {
  platform: "instagram" | "tiktok" | "facebook" | "youtube" | "linkedin" | "x";
  href: string;
  /** Optional accessible label (matches the section-prop schema shape). */
  label?: string;
};
export type ShellContactLink = {
  type: "phone" | "email" | "whatsapp";
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
      if (ig) socialLinks.push({ platform: "instagram", href: ig });
      const tk = clean(data.social_tiktok);
      if (tk) socialLinks.push({ platform: "tiktok", href: tk });
      const fb = clean(data.social_facebook);
      if (fb) socialLinks.push({ platform: "facebook", href: fb });
      const yt = clean(data.social_youtube);
      if (yt) socialLinks.push({ platform: "youtube", href: yt });
      const li = clean(data.social_linkedin);
      if (li) socialLinks.push({ platform: "linkedin", href: li });
      const x = clean(data.social_x);
      if (x) socialLinks.push({ platform: "x", href: x });

      const contactLinks: ShellContactLink[] = [];
      const wa = clean(data.whatsapp);
      if (wa) contactLinks.push({ type: "whatsapp", value: wa });
      const ph = clean(data.contact_phone);
      if (ph) contactLinks.push({ type: "phone", value: ph });
      const em = clean(data.contact_email);
      if (em) contactLinks.push({ type: "email", value: em });

      return { socialLinks, contactLinks };
    },
    ["site-admin:shell-social-contact", tenantId],
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
  const explicitSocial = params.explicitSocial ?? [];
  const explicitContact = params.explicitContact ?? [];
  if (explicitSocial.length > 0 || explicitContact.length > 0) {
    return { socialLinks: explicitSocial, contactLinks: explicitContact };
  }
  if (!params.tenantId) return EMPTY;
  return loadShellSocialContact(params.tenantId);
}
