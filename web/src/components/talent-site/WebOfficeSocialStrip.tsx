import { WEB_OFFICE_NAV_LABEL, webOfficeLocale, type WebOfficeLink } from "@/lib/talent-site/web-office-social";

/** Footer strip of her Instagram, TikTok and WhatsApp links (Web Office). Opens in a new tab. */
export function WebOfficeSocialStrip({ links, locale }: { links: WebOfficeLink[]; locale: string }) {
  if (links.length === 0) return null;
  return (
    <nav
      data-web-office-social=""
      aria-label={WEB_OFFICE_NAV_LABEL[webOfficeLocale(locale)]}
      style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px 20px", padding: "16px", fontSize: 14 }}
    >
      {links.map((link) => (
        <a
          key={link.platform}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.ariaLabel}
          data-web-office-social-link={link.platform}
          style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}
