"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { BASE, CTA_PRIMARY, CTA_SECONDARY, NAV } from "../_data/nav";
import { CCMobileNav } from "./CCMobileNav";

/**
 * Sticky translucent product-style header.
 *
 * Future systemization (Theme → Header Variant):
 *   - `translucent-product` (this): blurred on scroll, pill nav, dual CTA
 *   - `solid-minimal`: for interior pages that skip hero imagery
 */
export function CCHeader() {
  const pathname = usePathname() ?? "";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <header
        className={`cc-header ${scrolled ? "cc-header--translucent" : ""}`}
      >
        <div className="cc-shell">
          <div className="cc-header__row">
            <Link href={BASE} className="cc-header__logo" aria-label="Creator Circuit home">
              <span className="cc-header__logo-mark" aria-hidden />
              <span>Creator Circuit</span>
            </Link>

            <nav className="cc-header__nav" aria-label="Primary">
              {NAV.map((item) => {
                const active =
                  item.href === BASE
                    ? pathname === BASE
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="cc-header__nav-link"
                    data-active={active || undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="cc-header__ctas">
              <Link href={CTA_SECONDARY.href} className="cc-btn cc-btn--sm cc-btn--ghost">
                {CTA_SECONDARY.label}
              </Link>
              <Link href={CTA_PRIMARY.href} className="cc-btn cc-btn--sm cc-btn--violet">
                {CTA_PRIMARY.label}
              </Link>
            </div>

            <Link href={CTA_PRIMARY.href} className="cc-btn cc-btn--violet cc-header__mobile-cta">
              Start
            </Link>

            <button
              type="button"
              className="cc-header__burger"
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

      <CCMobileNav open={open} onClose={() => setOpen(false)} />
    </>
  );
}
