"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { withLocaleHref } from "@/i18n/pathnames";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { TulalaLogo } from "@/components/brand/tulala-logo";
import { getMarketingCopy } from "@/lib/marketing/copy";
import { buildNav, isActive, type NavNode } from "./marketing-header-nav";
import { MarketingCta } from "./cta-link";
import { LOGIN_MODAL_EVENT } from "./login-modal";
import { MarketingLanguageMenu } from "./marketing-language-menu";
import { DesktopSupport } from "./marketing-support-menu";
import {
  ArrowTiny,
  ChevronDownGlyph,
  ChevronGlyph,
  CloseGlyph,
  MenuGlyph,
  SearchGlyph,
  SignInGlyph,
} from "./marketing-header-glyphs";
import {
  DesktopAccount,
  type MarketingAccount,
} from "./marketing-account-menu";

export function MarketingHeader({
  locale,
  pathnameWithoutLocale,
  account,
  signOutAction,
}: {
  locale: string;
  pathnameWithoutLocale: string;
  /** When present, the top-right shows the account menu instead of the
   *  logged-out CTAs (Join as talent / Sign in / Start free). */
  account?: MarketingAccount;
  signOutAction?: () => void | Promise<void>;
}) {
  const copy = getMarketingCopy(locale);
  /** Every internal href in this header goes through here — see `buildNav`. */
  const L = (href: string) => withLocaleHref(href, locale);
  const NAV = buildNav(copy, locale);
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Which desktop dropdown is open (by label), or null. */
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  /** Which mobile accordion section is expanded (by label), or null. */
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onScroll = () => {
      const y =
        typeof window.scrollY === "number"
          ? window.scrollY
          : document.documentElement.scrollTop;
      setScrolled(y > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Reset all open state on route change.
  useEffect(() => {
    setMenuOpen(false);
    setOpenMenu(null);
    setMobileExpanded(null);
  }, [pathname]);

  // Lock body scroll while the mobile menu is open.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  // Desktop dropdown: close on Escape or click/focus outside the nav.
  useEffect(() => {
    if (openMenu === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    const onPointer = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [openMenu]);

  const condensed = scrolled || menuOpen || openMenu !== null;

  return (
    <header
      ref={navRef}
      className={cn(
        "fixed inset-x-0 top-0 z-40 backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-300",
      )}
      style={{
        background: condensed
          ? "color-mix(in srgb, var(--plt-bg) 92%, transparent)"
          : "color-mix(in srgb, var(--plt-bg) 72%, transparent)",
        borderBottom: `1px solid ${
          condensed ? "var(--plt-hairline-strong)" : "var(--plt-hairline)"
        }`,
        boxShadow: condensed
          ? "0 6px 18px -12px rgba(15,23,20,0.18)"
          : "0 1px 0 rgba(15,23,20,0.02)",
      }}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:h-[72px] sm:gap-6 sm:px-8">
        <Link
          href={L("/")}
          className="group relative -mx-1 flex items-center rounded-md px-1 py-1"
          aria-label={`${PLATFORM_BRAND.name} home`}
          style={{ color: "var(--plt-ink)" }}
        >
          <TulalaHeaderLogo descriptor={copy.brand.descriptor} />
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex">
          {NAV.map((node) =>
            node.kind === "link" ? (
              <DesktopLink
                key={node.label}
                node={node}
                active={isActive(pathname, node.href)}
              />
            ) : (
              <DesktopMenu
                key={node.label}
                node={node}
                open={openMenu === node.label}
                onOpen={() => setOpenMenu(node.label)}
                onClose={() => setOpenMenu(null)}
                onToggle={() =>
                  setOpenMenu((cur) => (cur === node.label ? null : node.label))
                }
              />
            ),
          )}
        </nav>

        {/* Utility cluster — visible at EVERY width. On mobile these three
            icons (language / support / account) carry what the old hamburger
            menu buried: the bar stops feeling empty and the menu can go back
            to being pure navigation. */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <MarketingLanguageMenu
            activeLocale={locale}
            pathnameWithoutLocale={pathnameWithoutLocale}
            label={copy.nav.language}
          />
          <DesktopSupport copy={copy.nav} />
          {account ? (
            <DesktopAccount
              account={account}
              copy={copy.nav}
              signOutAction={signOutAction}
            />
          ) : (
            <>
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent(LOGIN_MODAL_EVENT))
                }
                /* Colours as classes, not inline `style` — inline wins over
                   stylesheet rules and would nullify the `hover:` variants.
                   Desktop-only: on mobile Sign in lives in the menu footer. */
                className="hidden h-9 items-center gap-1.5 rounded-[10px] border border-[var(--plt-hairline-strong)] bg-[var(--plt-bg-raised)] px-3.5 text-[0.875rem] font-medium leading-none tracking-[-0.005em] text-[var(--plt-ink-soft)] transition-[background-color,border-color,color] hover:border-[var(--plt-ink-soft)] hover:bg-[var(--plt-bg-deep)] hover:text-[var(--plt-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--plt-forest)] lg:inline-flex"
              >
                <SignInGlyph />
                {copy.nav.signIn}
              </button>
              <span className="relative hidden lg:inline-flex">
                <MarketingCta
                  href={L("/get-started")}
                  variant="primary"
                  size="md"
                  eventSource="header"
                  eventIntent="get-started"
                >
                  {copy.nav.startFree}
                </MarketingCta>
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-2 -top-2 inline-flex items-center rounded-full px-1.5 py-[3px] text-[0.5625rem] font-bold uppercase leading-none tracking-[0.04em]"
                  style={{
                    background: "var(--plt-accent)",
                    color: "#fff",
                    boxShadow:
                      "0 2px 6px -1px rgba(255,131,50,0.55), 0 0 0 2px var(--plt-bg)",
                  }}
                >
                  {copy.nav.freeBadge}
                </span>
              </span>
            </>
          )}

          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border transition-colors lg:hidden"
            style={{
              borderColor: "var(--plt-hairline-strong)",
              color: "var(--plt-ink)",
              background: condensed ? "var(--plt-bg-raised)" : "transparent",
            }}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <CloseGlyph /> : <MenuGlyph />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto lg:hidden"
          style={{
            background: "var(--plt-bg)",
            borderTop: "1px solid var(--plt-hairline)",
          }}
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-4 py-4 pb-6 sm:px-8">
            {/* Real search, not decoration: the directory supports free-text
                `?q=`. A GET form keeps it zero-JS — submitting navigates to
                the (locale-aware) directory with the query applied. */}
            <form action={L("/directory")} method="get" role="search" className="pb-2">
              <div
                className="flex items-center gap-2.5 rounded-2xl border px-4 py-3"
                style={{
                  borderColor: "var(--plt-hairline-strong)",
                  background: "var(--plt-bg-raised)",
                }}
              >
                <SearchGlyph />
                <input
                  type="search"
                  name="q"
                  enterKeyHint="search"
                  aria-label={copy.nav.searchTalent}
                  placeholder={copy.nav.searchTalent}
                  className="w-full bg-transparent text-[1rem] outline-none placeholder:text-[var(--plt-muted)]"
                  style={{ color: "var(--plt-ink)" }}
                />
              </div>
            </form>

            {NAV.map((node) =>
              node.kind === "link" ? (
                <Link
                  key={node.label}
                  href={node.href}
                  className="flex items-center justify-between rounded-2xl px-4 py-4 text-[1rem] font-medium transition-colors hover:bg-[var(--plt-bg-deep)]"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {node.label}
                  <ChevronGlyph />
                </Link>
              ) : (
                <MobileSection
                  key={node.label}
                  node={node}
                  expanded={mobileExpanded === node.label}
                  onToggle={() =>
                    setMobileExpanded((cur) =>
                      cur === node.label ? null : node.label,
                    )
                  }
                />
              ),
            )}
            {/* The old menu also carried the language pill, a support
                section and the signed-in account's full workspace/page
                list — three screens of chrome before the CTA. All of that
                now lives behind the header's own globe / ? / avatar
                controls; the menu keeps navigation plus one clear action. */}
            <div
              className="mt-3 flex flex-col gap-2 border-t pt-4"
              style={{ borderColor: "var(--plt-hairline)" }}
            >
              {account ? (
                <a
                  href={account.dashboardHref}
                  className="flex items-center justify-between rounded-2xl px-4 py-4 text-[1rem] font-medium transition-colors hover:bg-[var(--plt-bg-deep)]"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {copy.nav.dashboard}
                  <ChevronGlyph />
                </a>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      window.dispatchEvent(new CustomEvent(LOGIN_MODAL_EVENT));
                    }}
                    className="flex w-full items-center justify-between rounded-2xl px-4 py-4 text-left text-[1rem] font-medium"
                    style={{ color: "var(--plt-ink-soft)" }}
                  >
                    {copy.nav.signIn}
                    <ChevronGlyph />
                  </button>
                  <span className="relative block w-full">
                    <MarketingCta
                      href={L("/get-started")}
                      variant="primary"
                      size="lg"
                      eventSource="mobile-header"
                      eventIntent="get-started"
                      className="w-full"
                    >
                      {copy.nav.startFree}
                    </MarketingCta>
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -right-1.5 -top-1.5 inline-flex items-center rounded-full px-1.5 py-[3px] text-[0.5625rem] font-bold uppercase leading-none tracking-[0.04em]"
                      style={{
                        background: "var(--plt-accent)",
                        color: "#fff",
                        boxShadow:
                          "0 2px 6px -1px rgba(255,131,50,0.55), 0 0 0 2px var(--plt-bg)",
                      }}
                    >
                      {copy.nav.freeBadge}
                    </span>
                  </span>
                  <p
                    className="mt-2 text-center text-[0.75rem]"
                    style={{ color: "var(--plt-muted)" }}
                  >
                    {PLATFORM_BRAND.stage} · founder-led
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

/* ───────────────────────── Desktop nav ───────────────────────── */

function DesktopLink({ node, active }: { node: { label: string; href: string }; active: boolean }) {
  return (
    <Link
      href={node.href}
      className={cn(
        // A colour-only hover left these reading as static labels. The pill
        // fill gives the pointer a visible hit-target the moment it lands.
        "relative rounded-md px-3 py-2 text-[0.875rem] font-medium leading-none tracking-[-0.005em] transition-colors hover:bg-[var(--plt-bg-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--plt-forest)]",
        active ? "text-[var(--plt-ink)]" : "text-[var(--plt-muted)] hover:text-[var(--plt-ink)]",
      )}
    >
      {node.label}
      {active ? (
        <span
          aria-hidden
          className="absolute inset-x-3 -bottom-0.5 h-px"
          style={{ background: "var(--plt-forest)" }}
        />
      ) : null}
    </Link>
  );
}

function DesktopMenu({
  node,
  open,
  onOpen,
  onClose,
  onToggle,
}: {
  node: Extract<NavNode, { kind: "menu" }>;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="relative" onMouseEnter={onOpen} onMouseLeave={onClose}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={onToggle}
        onFocus={onOpen}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-3 py-2 text-[0.875rem] font-medium leading-none tracking-[-0.005em] transition-colors hover:bg-[var(--plt-bg-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--plt-forest)]",
          open ? "bg-[var(--plt-bg-raised)] text-[var(--plt-ink)]" : "text-[var(--plt-muted)] hover:text-[var(--plt-ink)]",
        )}
      >
        {node.label}
        <ChevronDownGlyph open={open} />
      </button>

      {open ? (
        <div
          className="absolute left-0 top-full w-[22rem] pt-2 mkt-rise"
          role="menu"
          aria-label={node.label}
        >
          <div
            className="overflow-hidden rounded-[20px] p-2"
            style={{
              background: "var(--plt-bg-elevated)",
              border: "1px solid var(--plt-hairline-strong)",
              boxShadow: "0 28px 64px -28px rgba(15,23,20,0.4), 0 2px 6px -2px rgba(15,23,20,0.08)",
            }}
          >
            <p
              className="px-3 pb-2 pt-2 text-[0.8125rem] leading-[1.45]"
              style={{ color: "var(--plt-muted)" }}
            >
              {node.blurb}
            </p>
            <div className="my-1 h-px" style={{ background: "var(--plt-hairline)" }} aria-hidden />
            <ul className="flex flex-col gap-0.5">
              {node.items.map((item) => (
                <li key={item.href} role="none">
                  <Link
                    href={item.href}
                    role="menuitem"
                    onClick={onClose}
                    className="group flex flex-col gap-0.5 rounded-2xl px-3 py-2.5 transition-colors hover:bg-[var(--plt-bg-raised)]"
                  >
                    <span
                      className="inline-flex items-center gap-1.5 text-[0.875rem] font-medium leading-none"
                      style={{ color: "var(--plt-ink)" }}
                    >
                      {item.label}
                      <ArrowTiny />
                    </span>
                    {item.description ? (
                      <span
                        className="text-[0.8125rem] leading-[1.4]"
                        style={{ color: "var(--plt-muted)" }}
                      >
                        {item.description}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ───────────────────────── Mobile nav ───────────────────────── */

function MobileSection({
  node,
  expanded,
  onToggle,
}: {
  node: Extract<NavNode, { kind: "menu" }>;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="rounded-2xl"
      style={{ background: expanded ? "var(--plt-bg-raised)" : "transparent" }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between rounded-2xl px-4 py-4 text-[1rem] font-medium transition-colors"
        style={{ color: "var(--plt-ink)" }}
      >
        {node.label}
        <ChevronDownGlyph open={expanded} />
      </button>
      {expanded ? (
        <ul className="flex flex-col gap-0.5 px-2 pb-2">
          {node.items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex flex-col gap-0.5 rounded-xl px-3 py-3 transition-colors hover:bg-[var(--plt-bg-deep)]"
              >
                <span
                  className="text-[0.9375rem] font-medium leading-none"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {item.label}
                </span>
                {item.description ? (
                  <span
                    className="text-[0.8125rem] leading-[1.4]"
                    style={{ color: "var(--plt-muted)" }}
                  >
                    {item.description}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Header lockup: the canonical mark + monoline wordmark from
 * `@/components/brand/tulala-logo`. Letter strokes ride `currentColor`
 * (ink-strong here); the full-stop carries the brand orange.
 *
 * `descriptor` renders the category-message lockup line to the right of
 * the wordmark, desktop-only (xl+, one step past the `lg:` breakpoint the
 * nav itself switches on at, so the label never competes with nav for
 * space; QA at 1024-1280px and drop to a wider breakpoint if it still
 * crowds). ~60% opacity, one weight lighter than the wordmark, letter-
 * spaced small-caps-style, never a second dark bold element in the bar.
 */
function TulalaHeaderLogo({ descriptor }: { descriptor: string }) {
  return (
    <span
      className="inline-flex flex-col items-start leading-none"
      style={{ color: "var(--plt-ink-strong)" }}
    >
      <TulalaLogo wordmarkHeight={25} />
      {/* Stacked under the wordmark rather than beside it: the lockup reads as
          one brand unit instead of two competing elements separated by a rule,
          and it stops the descriptor from fighting the nav for horizontal room.
          Letter-spacing is tuned so the line optically matches the wordmark's
          width. Still desktop-only (xl+) and still ~60% opacity, so it never
          becomes a second dark bold element in the bar. */}
      <span
        aria-hidden
        className="mt-1 hidden whitespace-nowrap text-[0.5625rem] font-medium uppercase tracking-[0.2em] xl:block"
        style={{ color: "var(--plt-ink-strong)", opacity: 0.55 }}
      >
        {descriptor}
      </span>
    </span>
  );
}
