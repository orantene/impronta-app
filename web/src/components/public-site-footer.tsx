import { PublicCmsFooterNav } from "@/components/public-cms-footer";
import { PoweredByTulala } from "@/components/powered-by-tulala";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { createTranslator } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";

/**
 * Shared public storefront footer for every tenant page (home, CMS pages,
 * directory, posts). Replaces the per-page inline `<footer>` blocks that
 * collapsed to an empty bordered bar on non-home pages (PublicCmsFooterNav
 * returns null when a tenant has no footer-zone nav rows).
 *
 * Degrades gracefully: brand + tagline + copyright + PoweredByTulala ALWAYS
 * render, with the CMS footer-nav and social rows as optional slots that only
 * appear when there is real data. Socials are validated against their platform
 * domain so a mis-pasted URL (e.g. a TikTok link in the YouTube field) is
 * dropped rather than shown as a broken link.
 */

type SocialSlot = { label: string; url: string | null | undefined; match: string[] };

function resolveSocials(identity: Awaited<ReturnType<typeof loadPublicIdentity>>) {
  const slots: SocialSlot[] = [
    { label: "Instagram", url: identity?.social_instagram, match: ["instagram.com"] },
    { label: "TikTok", url: identity?.social_tiktok, match: ["tiktok.com"] },
    { label: "Facebook", url: identity?.social_facebook, match: ["facebook.com", "fb.com"] },
    { label: "YouTube", url: identity?.social_youtube, match: ["youtube.com", "youtu.be"] },
    { label: "LinkedIn", url: identity?.social_linkedin, match: ["linkedin.com"] },
    { label: "X", url: identity?.social_x, match: ["x.com", "twitter.com"] },
  ];
  return slots
    .map((s) => ({ label: s.label, href: (s.url ?? "").trim(), match: s.match }))
    .filter(
      (s) =>
        /^https?:\/\//i.test(s.href) &&
        s.match.some((m) => s.href.toLowerCase().includes(m)),
    );
}

export async function PublicSiteFooter({
  tenantId,
  locale,
}: {
  tenantId: string;
  locale: Locale;
}) {
  const identity = await loadPublicIdentity(tenantId);
  const t = createTranslator(locale);
  const brandLabel = identity?.public_name?.trim() || PLATFORM_BRAND.name;
  const tagline = identity?.footer_tagline?.trim() || t("public.home.footer.tagline");
  const year = new Date().getFullYear();
  const socials = resolveSocials(identity);
  const copyright = t("public.home.footer.copyright")
    .replace("{year}", String(year))
    .replace("{brand}", brandLabel);

  return (
    <footer className="mt-auto border-t border-border px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 text-center text-sm text-muted-foreground">
        <p className="font-display text-base uppercase tracking-[0.3em] text-foreground">
          {brandLabel}
        </p>
        {tagline ? <p className="max-w-md text-pretty">{tagline}</p> : null}

        {/* CMS-managed footer links (zone="footer"). Renders nothing when empty. */}
        <PublicCmsFooterNav locale={locale} />

        {socials.length > 0 ? (
          <nav
            className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs uppercase tracking-[0.18em]"
            aria-label="Social links"
          >
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-foreground"
              >
                {s.label}
              </a>
            ))}
          </nav>
        ) : null}

        <div className="mt-2 flex flex-col items-center gap-3">
          <p className="text-xs text-muted-foreground/80">{copyright}</p>
          <PoweredByTulala />
        </div>
      </div>
    </footer>
  );
}
