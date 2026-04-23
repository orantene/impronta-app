"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Full-screen editorial mobile overlay.
 *
 * Future systemization (Theme → Mobile Nav Variant):
 *   - `full-screen-fade` (this one): stacked serif links, sticky bottom CTA.
 *   - `drawer-right`: compact slide-in for dense info-arch storefronts.
 *   - `sheet-bottom`: mobile-first casual brands (not bridal).
 *
 * All links and the sticky CTA come from the Header's data source so one
 * change flows everywhere. The transition choreography (stagger delays) is
 * pure CSS, keyed off `data-open`.
 */

type MobileNavItem = { label: string; href: string };

export function MuseMobileNav({
  open,
  onClose,
  items,
  cta,
}: {
  open: boolean;
  onClose: () => void;
  items: MobileNavItem[];
  cta: MobileNavItem;
}) {
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("muse-nav-locked");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("muse-nav-locked");
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div
      className="muse-mobile-nav"
      data-open={open || undefined}
      aria-hidden={!open}
    >
      <div className="muse-mobile-nav__top">
        <Link
          href="/prototypes/muse-bridal"
          className="muse-header__logo"
          onClick={onClose}
        >
          <span>Muse</span>
          <small>Bridal Collective</small>
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="muse-mobile-nav__close"
          aria-label="Close menu"
        >
          Close
        </button>
      </div>

      <nav className="muse-mobile-nav__links" aria-label="Mobile primary">
        {items.map((item) => (
          <Link key={item.href} href={item.href} onClick={onClose}>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="muse-mobile-nav__sticky">
        <Link
          href={cta.href}
          onClick={onClose}
          className="muse-btn muse-btn--primary"
          style={{ width: "100%" }}
        >
          {cta.label}
        </Link>
      </div>
    </div>
  );
}
