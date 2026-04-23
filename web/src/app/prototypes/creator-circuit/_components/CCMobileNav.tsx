"use client";

import Link from "next/link";
import { useEffect } from "react";

import { BASE, CTA_PRIMARY, CTA_SECONDARY } from "../_data/nav";
import { IconArrowUpRight, IconClose } from "./icons";

const FOR_BRANDS = [
  { label: "Discover creators", href: `${BASE}/creators`, meta: "Directory" },
  { label: "For Brands", href: `${BASE}/for-brands`, meta: "Value prop" },
  { label: "Start a Campaign", href: `${BASE}/contact`, meta: "Brief" },
];

const FOR_CREATORS = [
  { label: "Join the Circuit", href: `${BASE}/for-creators`, meta: "Apply" },
  { label: "Why creators join", href: `${BASE}/for-creators#why`, meta: "Overview" },
  { label: "About", href: `${BASE}/about`, meta: "Story" },
];

export function CCMobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("cc-nav-locked");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("cc-nav-locked");
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div className="cc-mobile-nav" data-open={open || undefined} aria-hidden={!open}>
      <button
        type="button"
        className="cc-mobile-nav__scrim"
        aria-label="Close menu"
        onClick={onClose}
      />
      <aside className="cc-mobile-nav__panel">
        <div className="cc-mobile-nav__top">
          <Link href={BASE} className="cc-header__logo" onClick={onClose}>
            <span className="cc-header__logo-mark" aria-hidden />
            <span>Creator Circuit</span>
          </Link>
          <button
            type="button"
            className="cc-mobile-nav__close"
            onClick={onClose}
            aria-label="Close menu"
          >
            <IconClose size={18} />
          </button>
        </div>

        <div className="cc-mobile-nav__body">
          <div className="cc-mobile-nav__section-label">For Brands</div>
          {FOR_BRANDS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="cc-mobile-nav__link"
              onClick={onClose}
            >
              <span>{link.label}</span>
              <span className="cc-mobile-nav__link-meta">
                {link.meta} <IconArrowUpRight size={12} />
              </span>
            </Link>
          ))}

          <div className="cc-mobile-nav__section-label">For Creators</div>
          {FOR_CREATORS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="cc-mobile-nav__link"
              onClick={onClose}
            >
              <span>{link.label}</span>
              <span className="cc-mobile-nav__link-meta">
                {link.meta} <IconArrowUpRight size={12} />
              </span>
            </Link>
          ))}
        </div>

        <div className="cc-mobile-nav__sticky">
          <Link
            href={CTA_SECONDARY.href}
            onClick={onClose}
            className="cc-btn cc-btn--ghost"
            style={{ width: "100%" }}
          >
            {CTA_SECONDARY.label}
          </Link>
          <Link
            href={CTA_PRIMARY.href}
            onClick={onClose}
            className="cc-btn cc-btn--violet"
            style={{ width: "100%" }}
          >
            {CTA_PRIMARY.label}
          </Link>
        </div>
      </aside>
    </div>
  );
}
