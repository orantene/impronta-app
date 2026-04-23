"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { MuseMobileNav } from "./MuseMobileNav";

/**
 * Editorial sticky header.
 *
 * Future systemization (Theme → Header Variant):
 *   - `editorial-sticky` (this one): transparent over hero, solid on scroll.
 *   - `espresso-column`: always-solid dark variant for storefronts that skip
 *     hero imagery on secondary pages.
 *   - configurable: logo alignment, nav style, CTA on/off, burger threshold.
 *
 * Props omitted here because the prototype reads from hardcoded nav data.
 * When promoted to the tenant theme system these become:
 *   - header.variant: 'editorial-sticky' | 'espresso-column' | ...
 *   - header.logo: { label, kicker }
 *   - header.nav: { label, href }[]
 *   - header.cta: { label, href } | null
 *   - header.scroll_threshold: number
 */

const NAV: { label: string; href: string }[] = [
  { label: "Home", href: "/prototypes/muse-bridal" },
  { label: "Services", href: "/prototypes/muse-bridal/services" },
  { label: "Collective", href: "/prototypes/muse-bridal/collective" },
  { label: "Destinations", href: "/prototypes/muse-bridal#destinations" },
  { label: "About", href: "/prototypes/muse-bridal/about" },
  { label: "Contact", href: "/prototypes/muse-bridal/contact" },
];

const CTA = {
  label: "Book Your Team",
  href: "/prototypes/muse-bridal/contact",
};

export function MuseHeader() {
  const pathname = usePathname() ?? "";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  // Any home or landing route keeps hero transparency. Interior pages go
  // straight to the solid variant so text remains legible over ivory.
  const isHome = pathname === "/prototypes/muse-bridal";
  const forceSolid = !isHome;

  useEffect(() => {
    if (forceSolid) {
      setScrolled(true);
      return;
    }
    const onScroll = () => setScrolled(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [forceSolid]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const solid = scrolled || forceSolid;

  return (
    <>
      <header
        className={`muse-header ${solid ? "muse-header--solid" : "muse-header--over"}`}
      >
        <div className="muse-shell">
          <div className="muse-header__row">
            <Link href="/prototypes/muse-bridal" className="muse-header__logo">
              <span>Muse</span>
              <small>Bridal Collective</small>
            </Link>

            <nav className="muse-header__nav" aria-label="Primary">
              {NAV.map((link) => {
                const active =
                  link.href === pathname ||
                  (link.href !== "/prototypes/muse-bridal" &&
                    pathname.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    data-active={active || undefined}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <Link
              href={CTA.href}
              className={`muse-btn muse-btn--sm ${solid ? "muse-btn--primary" : "muse-btn--outline-light"} muse-header__cta`}
            >
              {CTA.label}
            </Link>

            <button
              type="button"
              className="muse-header__burger"
              aria-label="Open menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <MuseMobileNav
        open={open}
        onClose={() => setOpen(false)}
        items={NAV}
        cta={CTA}
      />
    </>
  );
}
