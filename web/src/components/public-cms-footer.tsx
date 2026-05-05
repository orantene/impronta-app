import Link from "next/link";
import { headers } from "next/headers";
import type { Locale } from "@/i18n/config";
import { publicLocaleHref } from "@/i18n/client-directory-href";
import { ORIGINAL_PATHNAME_HEADER } from "@/i18n/request-locale";
import { stripLocaleFromPathname } from "@/i18n/pathnames";
import { getPublicCmsNavigationLinks } from "@/lib/cms/public-navigation";

/**
 * CMS-driven footer links (`cms_navigation_items`, zone `footer`). Renders nothing when empty.
 */
export async function PublicCmsFooterNav({ locale }: { locale: Locale }) {
  const h = await headers();
  const originalPath = h.get(ORIGINAL_PATHNAME_HEADER) ?? "/";
  const { pathnameWithoutLocale } = stripLocaleFromPathname(originalPath);
  const links = await getPublicCmsNavigationLinks(locale, "footer");
  if (!links.length) return null;

  return (
    <nav
      className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground"
      aria-label="Footer links"
    >
      {links.map((l) => (
        <Link
          key={`${l.href}:${l.label}`}
          href={publicLocaleHref(pathnameWithoutLocale, l.href, locale)}
          className="transition-colors hover:text-foreground"
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
