import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { getPublicCmsNavigationLinks } from "@/lib/cms/public-navigation";

/**
 * CMS-driven footer links (`cms_navigation_items`, zone `footer`). Renders nothing when empty.
 */
export async function PublicCmsFooterNav({ locale }: { locale: Locale }) {
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
          href={l.href}
          className="transition-colors hover:text-foreground"
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
