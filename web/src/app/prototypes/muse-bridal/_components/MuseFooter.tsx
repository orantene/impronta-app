import Link from "next/link";

/**
 * Espresso-column footer with ivory contrast.
 *
 * Future systemization (Theme → Footer Variant):
 *   - `espresso-column` (this one)
 *   - `ivory-minimal`: light-mode editorial footer for bright-brand agencies.
 *   - `serif-editorial`: large serif sign-off for single-page brands.
 *
 * Content structure is the same shape across variants (brand block + 3
 * link columns + legal bar), so switching variants is a pure style swap.
 */

const COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Collective",
    links: [
      { label: "Featured professionals", href: "/prototypes/muse-bridal/collective" },
      { label: "Services", href: "/prototypes/muse-bridal/services" },
      { label: "Destinations", href: "/prototypes/muse-bridal#destinations" },
      { label: "Editorial gallery", href: "/prototypes/muse-bridal#gallery" },
    ],
  },
  {
    title: "Studio",
    links: [
      { label: "About Muse", href: "/prototypes/muse-bridal/about" },
      { label: "Our philosophy", href: "/prototypes/muse-bridal/about#philosophy" },
      { label: "Join the collective", href: "/prototypes/muse-bridal/contact?intent=apply" },
      { label: "Press", href: "/prototypes/muse-bridal/about#press" },
    ],
  },
  {
    title: "Plan",
    links: [
      { label: "Book your team", href: "/prototypes/muse-bridal/contact" },
      { label: "Concierge support", href: "/prototypes/muse-bridal/contact?intent=concierge" },
      { label: "Frequently asked", href: "/prototypes/muse-bridal/about#faq" },
      { label: "Gift a Muse day", href: "/prototypes/muse-bridal/contact?intent=gift" },
    ],
  },
];

export function MuseFooter() {
  return (
    <footer className="muse-footer">
      <div className="muse-shell">
        <div className="muse-footer__grid">
          <div>
            <div className="muse-footer__brand">
              Muse
              <br />
              Bridal Collective
            </div>
            <p style={{ color: "rgba(246,241,234,0.78)", marginTop: 20, maxWidth: 360 }}>
              A curated house of beauty, florals, photography and live music
              for weddings and destination celebrations — quietly extraordinary,
              always tailored.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
              <Link
                href="/prototypes/muse-bridal/contact"
                className="muse-btn muse-btn--light muse-btn--sm"
              >
                Start Your Inquiry
              </Link>
              <Link
                href="mailto:hello@musebridalcollective.com"
                className="muse-btn muse-btn--outline-light muse-btn--sm"
              >
                hello@musebridal
              </Link>
            </div>
          </div>

          {COLS.map((col) => (
            <div key={col.title} className="muse-footer__col">
              <h4>{col.title}</h4>
              <ul>
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="muse-footer__legal">
          <span>
            © {new Date().getFullYear()} Muse Bridal Collective · Tulum ·
            Los Cabos · Ciudad de México
          </span>
          <span style={{ display: "inline-flex", gap: 20 }}>
            <Link href="/prototypes/muse-bridal/about#privacy">Privacy</Link>
            <Link href="/prototypes/muse-bridal/about#terms">Terms</Link>
            <Link href="https://instagram.com">Instagram</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
