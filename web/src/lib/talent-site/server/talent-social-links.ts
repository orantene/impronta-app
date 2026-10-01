import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { talentContactHrefs } from "@/lib/talent-site/contact-channels";

type SocialRecord = { platform: string; href: string; label?: string };

const HOST_PLATFORMS: ReadonlyArray<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/i, "instagram"],
  [/(^|\.)tiktok\.com$/i, "tiktok"],
  [/(^|\.)facebook\.com$/i, "facebook"],
  [/(^|\.)(youtube\.com|youtu\.be)$/i, "youtube"],
  [/(^|\.)linkedin\.com$/i, "linkedin"],
  [/(^|\.)(x\.com|twitter\.com)$/i, "x"],
];

/** Platform for a published profile link, from its explicit key or its host. */
export function socialPlatformOf(link: { platform?: unknown; href: string }): string | null {
  const explicit = typeof link.platform === "string" ? link.platform.trim().toLowerCase() : "";
  if (explicit && HOST_PLATFORMS.some(([, p]) => p === explicit)) return explicit;
  try {
    const host = new URL(link.href).hostname;
    return HOST_PLATFORMS.find(([re]) => re.test(host))?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * A talent's public social + WhatsApp links as `workspace_social_links`
 * records, for a bound `social_links` node on her own site (the footer fine
 * print). Only links she published; WhatsApp follows the contact-channel rule
 * (a shell or wa.me link she set; never her phone). Empty on any failure.
 */
export async function loadTalentSocialLinks(talentProfileId: string): Promise<SocialRecord[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("talent_profiles")
    .select("social_links")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error || !data) return [];
  const row = data as { social_links: unknown };
  const out: SocialRecord[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(row.social_links) ? row.social_links : []) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as { platform?: unknown; href?: unknown };
    const href = typeof rec.href === "string" ? rec.href.trim() : "";
    if (!/^https:\/\//i.test(href)) continue;
    const platform = socialPlatformOf({ platform: rec.platform, href });
    if (!platform || seen.has(platform)) continue;
    seen.add(platform);
    out.push({ platform, href });
  }
  // Her profile phone is private: WhatsApp shows only from a link she set.
  const { whatsappHref } = talentContactHrefs({ socialLinks: row.social_links });
  if (whatsappHref) out.push({ platform: "whatsapp", href: whatsappHref });
  return out;
}
