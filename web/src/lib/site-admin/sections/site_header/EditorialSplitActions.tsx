"use client";

/**
 * <EditorialSplitActions> — the prototype-faithful right-side cluster +
 * slide-out drawer for the `editorial-split` site_header variant.
 *
 * Why this exists: the shared <HeaderAuthArea> (Language/Discovery/Account
 * widgets) is correct for every other variant, but the v11 Impronta
 * prototype's `editorial-split` header has a very specific right zone — a
 * tight `.acct` row of [EN·ES] + [Saved] + [Inquiry] + [☰ Menu], and the
 * hamburger opens a right-anchored slide-out drawer (nav + CTAs + access
 * links). CSS-restyling the shared widgets could never produce the burger
 * drawer; that's a behavior, not a skin. So this is a dedicated, fully
 * reusable surface that ANY tenant on `editorial-split` gets.
 *
 * No fake data, no stripped functionality: every destination is a REAL
 * route resolved server-side and passed in as a serializable prop —
 *   • locale toggle  → server-computed canonical locale hrefs
 *   • Saved          → the real directory (where saved talent live)
 *   • Inquiry        → the operator's real primary-CTA destination
 *   • Access link    → the real auth entry (resolveAccountHref)
 * The icons are lifted VERBATIM from the prototype so it is pixel-faithful.
 * All visual styling lives in the `editorial-split` block of
 * token-presets.css (token-driven, gold/Cinzel fallback) — this file owns
 * only structure + open/close behavior.
 */

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface EditorialSplitNavItem {
  label: string;
  href: string;
  external?: boolean;
}

export interface EditorialSplitActionsProps {
  /** Canonical, server-computed locale hrefs (no client locale guessing). */
  localeHrefs: { en: string; es: string };
  activeLocale: string;
  navItems: EditorialSplitNavItem[];
  /** Operator's real primary CTA (drawer "Start an Inquiry" + Inquiry icon). */
  primaryCta: { label: string; href: string; external?: boolean } | null;
  /** Real directory route — Saved icon + "Explore Talent". */
  directoryHref: string;
  /** Real auth entry (server resolveAccountHref) — never invented. */
  accountHref: string;
  accountLabel: string;
  /** Real saved-talent count for the bookmark badge (0 = hidden). */
  savedCount: number;
  copy: {
    menu: string;
    close: string;
    saved: string;
    inquiry: string;
    startInquiry: string;
    exploreTalent: string;
    language: string;
  };
}

export function EditorialSplitActions({
  localeHrefs,
  activeLocale,
  navItems,
  primaryCta,
  directoryHref,
  accountHref,
  accountLabel,
  savedCount,
  copy,
}: EditorialSplitActionsProps) {
  const [open, setOpen] = useState(false);
  // Portal-mount gate: the drawer must render at <body> level, NOT inside
  // <header> — the header's backdrop-filter creates a containing block
  // that would trap a position:fixed child inside the short bar (this is
  // why the menu didn't fill the screen like the prototype). Portal only
  // after mount so SSR/first paint stay consistent.
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on route change (prototype's `data-x` links navigate away).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Esc to close + body scroll lock while the drawer is open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const inquiryHref = primaryCta?.href ?? directoryHref;
  const isEs = activeLocale === "es";

  const drawer = (
    <div
      className="site-header__drawer"
      data-open={open ? "true" : "false"}
      role="dialog"
      aria-modal="true"
      aria-label={copy.menu}
      aria-hidden={open ? undefined : "true"}
    >
      <button
        type="button"
        className="site-header__drawer-scrim"
        aria-label={copy.close}
        tabIndex={open ? 0 : -1}
        onClick={close}
      />
      <div className="site-header__drawer-panel">
        <button
          type="button"
          className="site-header__drawer-x"
          aria-label={copy.close}
          tabIndex={open ? 0 : -1}
          onClick={close}
        >
          ×
        </button>
        {navItems.length > 0 ? (
          <nav className="site-header__drawer-nav" aria-label={copy.menu}>
            {navItems.map((item, i) => (
              <Link
                key={`${item.href}:${i}`}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                tabIndex={open ? 0 : -1}
                onClick={close}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
        <div className="site-header__drawer-actions">
          {primaryCta ? (
            <Link
              href={primaryCta.href}
              target={primaryCta.external ? "_blank" : undefined}
              rel={primaryCta.external ? "noopener noreferrer" : undefined}
              className="site-header__drawer-btn site-header__drawer-btn--gold"
              tabIndex={open ? 0 : -1}
              onClick={close}
            >
              {primaryCta.label || copy.startInquiry}
            </Link>
          ) : null}
          <Link
            href={directoryHref}
            className="site-header__drawer-btn site-header__drawer-btn--line"
            tabIndex={open ? 0 : -1}
            onClick={close}
          >
            {copy.exploreTalent}
          </Link>
        </div>
        <div className="site-header__drawer-links">
          <Link href={accountHref} tabIndex={open ? 0 : -1} onClick={close}>
            {accountLabel}
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <>
    <div className="site-header__es-acct">
      {/* EN · ES — real canonical locale switch (server-computed hrefs) */}
      <span
        className="site-header__es-loc"
        role="group"
        aria-label={copy.language}
      >
        <a
          href={localeHrefs.en}
          className="site-header__es-loc-btn"
          data-on={!isEs ? "true" : undefined}
          aria-current={!isEs ? "true" : undefined}
        >
          EN
        </a>
        <span aria-hidden="true" className="site-header__es-loc-sep">
          ·
        </span>
        <a
          href={localeHrefs.es}
          className="site-header__es-loc-btn"
          data-on={isEs ? "true" : undefined}
          aria-current={isEs ? "true" : undefined}
        >
          ES
        </a>
      </span>

      {/* Saved — bookmark glyph (prototype `.ai-saved`), real directory */}
      <Link
        href={directoryHref}
        className="site-header__es-ic"
        data-tip={copy.saved}
        aria-label={copy.saved}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        {savedCount > 0 ? (
          <span className="site-header__es-bdg">{savedCount}</span>
        ) : null}
      </Link>

      {/* Inquiry — paper-plane glyph (prototype `.ai-inq`), real CTA dest */}
      <Link
        href={inquiryHref}
        className="site-header__es-ic"
        data-tip={copy.inquiry}
        aria-label={copy.inquiry}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M22 2 11 13" />
          <path d="M22 2 15 22l-4-9-9-4z" />
        </svg>
      </Link>

      {/* ☰ Menu — opens the prototype slide-out drawer */}
      <button
        type="button"
        className="site-header__es-ic"
        data-tip={copy.menu}
        aria-label={copy.menu}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M3 6h18" />
          <path d="M3 12h18" />
          <path d="M3 18h18" />
        </svg>
      </button>
    </div>
    {mounted ? createPortal(drawer, document.body) : null}
    </>
  );
}
