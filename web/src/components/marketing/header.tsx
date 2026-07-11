"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { getMarketingCopy, type MarketingCopy } from "@/lib/marketing/copy";
import { MarketingCta } from "./cta-link";
import { LOGIN_MODAL_EVENT } from "./login-modal";
import { MarketingLanguageToggle } from "./marketing-language-toggle";
import { DesktopSupport, SUPPORT_EMAIL } from "./marketing-support-menu";
import {
  ArrowTiny,
  ChevronDownGlyph,
  ChevronGlyph,
  CloseGlyph,
  MenuGlyph,
} from "./marketing-header-glyphs";
import {
  DesktopAccount,
  AccountAvatar,
  type MarketingAccount,
} from "./marketing-account-menu";

type NavLeaf = { label: string; href: string; description?: string };
type NavNode =
  | { kind: "link"; label: string; href: string }
  | { kind: "menu"; label: string; blurb: string; items: NavLeaf[] };

/**
 * Product-forward navigation. Three menus carry the whole story:
 *   Platform  → what Tulala is (flagship: one-click builder + booking messenger)
 *   Solutions → who it's for (talent / business / hubs / the hybrid)
 *   Discover  → the single browse surface (talent, agencies & hubs, network)
 * plus Pricing and Stories. Labels/descriptions come from the copy module
 * (per locale); hrefs live here and stay stable across languages.
 */
const NAV_HREFS = {
  platform: ["/#builder", "/#messenger", "/network", "/integrations", "/how-it-works"],
  solutions: ["/operators", "/agencies", "/organizations", "/#stories"],
  discover: ["/directory", "/discover-agencies", "/network"],
};

function buildNav(copy: MarketingCopy): NavNode[] {
  const menu = (m: MarketingCopy["nav"]["platform"], hrefs: string[]): NavNode => ({
    kind: "menu",
    label: m.label,
    blurb: m.blurb,
    items: m.items.map((it, i) => ({
      label: it.label,
      description: it.description,
      href: hrefs[i],
    })),
  });
  return [
    menu(copy.nav.platform, NAV_HREFS.platform),
    menu(copy.nav.solutions, NAV_HREFS.solutions),
    menu(copy.nav.discover, NAV_HREFS.discover),
    { kind: "link", label: copy.nav.pricing, href: "/pricing" },
    { kind: "link", label: copy.nav.stories, href: "/#stories" },
  ];
}


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
  const NAV = buildNav(copy);
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
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-6 px-5 sm:h-[72px] sm:px-8">
        <Link
          href="/"
          className="group relative -mx-1 flex items-center rounded-md px-1 py-1"
          aria-label={`${PLATFORM_BRAND.name} — home`}
          style={{ color: "var(--plt-ink)" }}
        >
          <TulalaWordmark />
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

        <div className="hidden items-center gap-2 lg:flex">
          <MarketingLanguageToggle
            activeLocale={locale}
            pathnameWithoutLocale={pathnameWithoutLocale}
            className="mr-1"
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
                className="rounded-md px-3 py-2 text-[0.875rem] font-medium leading-none tracking-[-0.005em] transition-colors hover:text-[var(--plt-ink)]"
                style={{ color: "var(--plt-muted)" }}
              >
                {copy.nav.signIn}
              </button>
              <span className="relative inline-flex">
                <MarketingCta
                  href="/get-started"
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
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors lg:hidden"
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

      {menuOpen ? (
        <div
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto lg:hidden"
          style={{
            background: "var(--plt-bg)",
            borderTop: "1px solid var(--plt-hairline)",
          }}
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-5 py-5 sm:px-8">
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
            <div
              className="mt-3 flex flex-col gap-2 border-t pt-4"
              style={{ borderColor: "var(--plt-hairline)" }}
            >
              <div className="flex justify-center pb-1">
                <MarketingLanguageToggle
                  activeLocale={locale}
                  pathnameWithoutLocale={pathnameWithoutLocale}
                />
              </div>
              {account ? (
                <>
                  <a
                    href={account.accountHref}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3"
                    style={{ background: "var(--plt-bg-raised)" }}
                  >
                    <AccountAvatar size="lg" />
                    <div className="min-w-0">
                      <p
                        className="truncate text-[0.9375rem] font-semibold"
                        style={{ color: "var(--plt-ink)" }}
                      >
                        {account.displayName}
                      </p>
                      <p
                        className="truncate text-[0.8125rem]"
                        style={{ color: "var(--plt-muted)" }}
                      >
                        {account.email}
                      </p>
                    </div>
                  </a>

                  {account.workspaces.length > 0 ? (
                    <>
                      {account.isTalent ? (
                        <p className="px-4 pt-3 pb-1 text-[0.6875rem] font-medium uppercase tracking-wide" style={{ color: "var(--plt-muted)" }}>
                          {copy.nav.workspaces}
                        </p>
                      ) : null}
                      {account.workspaces.map((w) => (
                        <a
                          key={`${w.slug}:${w.role}`}
                          href={w.href}
                          className="flex items-center justify-between gap-3 rounded-2xl px-4 py-4 text-[1rem] font-medium"
                          style={{ color: "var(--plt-ink)" }}
                        >
                          <span className="min-w-0 flex-1 truncate">{w.name}</span>
                          <span className="shrink-0 text-[0.75rem] font-medium uppercase tracking-wide" style={{ color: "var(--plt-muted)" }}>
                            {w.role}
                          </span>
                          <ChevronGlyph />
                        </a>
                      ))}
                    </>
                  ) : null}

                  {account.isTalent ? (
                    <>
                      {account.workspaces.length > 0 ? (
                        <p className="px-4 pt-3 pb-1 text-[0.6875rem] font-medium uppercase tracking-wide" style={{ color: "var(--plt-muted)" }}>
                          {copy.nav.myPages}
                        </p>
                      ) : null}
                      {account.globalHidden ? (
                        <p className="px-4 py-2 text-[0.8125rem]" style={{ color: "var(--plt-muted)" }}>
                          {copy.nav.hiddenEverywhere}
                        </p>
                      ) : null}
                      {account.talentPages.map((p) => (
                        <div
                          key={p.key}
                          className="flex items-center justify-between gap-3 rounded-2xl px-4 py-4 text-[1rem] font-medium"
                        >
                          <a
                            href={p.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex min-w-0 flex-1 items-center gap-3"
                            style={{ color: "var(--plt-ink)" }}
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {p.kind === "self_page" ? copy.nav.yourTulalaPage : p.name}
                            </span>
                          </a>
                          {p.planBadge ? (
                            <span className="shrink-0 text-[0.75rem] font-semibold uppercase tracking-wide" style={{ color: "var(--plt-forest)" }}>
                              {p.planBadge}
                            </span>
                          ) : p.kind === "self_page" && account.talentUpgradeHref ? (
                            <a
                              href={account.talentUpgradeHref}
                              className="shrink-0 rounded-lg px-2.5 py-1 text-[0.8125rem] font-semibold"
                              style={{ background: "var(--plt-forest)", color: "var(--plt-forest-on)" }}
                            >
                              Upgrade
                            </a>
                          ) : null}
                          <span className="shrink-0 text-[0.75rem] font-medium" style={{ color: p.status === "live" ? "#3f9b6b" : "var(--plt-muted)" }}>
                            {p.status === "live"
                              ? copy.nav.statusLive
                              : p.status === "hidden"
                                ? copy.nav.statusHidden
                                : p.status === "pending"
                                  ? copy.nav.statusPending
                                  : copy.nav.statusWindingDown}
                          </span>
                        </div>
                      ))}
                      {account.talentLinks ? (
                        <>
                          {[
                            { href: account.talentLinks.dashboard, label: copy.nav.talentDashboard },
                            { href: account.talentLinks.editProfile, label: copy.nav.editProfile },
                            { href: account.talentLinks.bookings, label: copy.nav.bookings },
                            { href: account.talentLinks.messages, label: copy.nav.messages },
                          ].map((l) => (
                            <a
                              key={l.href}
                              href={l.href}
                              className="flex items-center justify-between rounded-2xl px-4 py-4 text-[1rem] font-medium"
                              style={{ color: "var(--plt-ink)" }}
                            >
                              {l.label}
                              <ChevronGlyph />
                            </a>
                          ))}
                        </>
                      ) : null}
                    </>
                  ) : null}

                  {account.isClient ? (
                    <>
                      {(account.clientTenants.length > 0
                        ? account.clientTenants.map((t) => ({ href: t.href, label: t.name }))
                        : [{ href: account.dashboardHref, label: copy.nav.dashboard }]
                      ).map((row) => (
                        <a
                          key={row.href}
                          href={row.href}
                          className="flex items-center justify-between rounded-2xl px-4 py-4 text-[1rem] font-medium"
                          style={{ color: "var(--plt-ink)" }}
                        >
                          <span className="min-w-0 flex-1 truncate">{row.label}</span>
                          <ChevronGlyph />
                        </a>
                      ))}
                      {account.clientLinks
                        ? [
                            { href: account.clientLinks.messages, label: copy.nav.messages },
                            { href: account.clientLinks.saved, label: copy.nav.savedTalent },
                            { href: account.clientLinks.account, label: copy.nav.accountSettings },
                          ].map((l) => (
                            <a
                              key={l.href}
                              href={l.href}
                              className="flex items-center justify-between rounded-2xl px-4 py-4 text-[1rem] font-medium"
                              style={{ color: "var(--plt-ink)" }}
                            >
                              {l.label}
                              <ChevronGlyph />
                            </a>
                          ))
                        : null}
                    </>
                  ) : account.workspaces.length === 0 && !account.isTalent ? (
                    <a
                      href={account.dashboardHref}
                      className="flex items-center justify-between rounded-2xl px-4 py-4 text-[1rem] font-medium"
                      style={{ color: "var(--plt-ink)" }}
                    >
                      {copy.nav.dashboard}
                      <ChevronGlyph />
                    </a>
                  ) : null}

                  <Link
                    href="/get-started"
                    className="flex items-center justify-between rounded-2xl px-4 py-4 text-[1rem] font-medium"
                    style={{ color: "var(--plt-ink-soft)" }}
                  >
                    {account.isTalent && account.workspaces.length === 0 ? copy.nav.openWorkspace : copy.nav.newWorkspace}
                    <ChevronGlyph />
                  </Link>
                  {signOutAction ? (
                    <form action={signOutAction}>
                      <button
                        type="submit"
                        className="flex w-full items-center justify-between rounded-2xl px-4 py-4 text-left text-[1rem] font-medium"
                        style={{ color: "var(--plt-ink-soft)" }}
                      >
                        {copy.nav.signOut}
                        <ChevronGlyph />
                      </button>
                    </form>
                  ) : null}
                </>
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
                      href="/get-started"
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

              <div className="my-2 h-px" style={{ background: "var(--plt-hairline)" }} aria-hidden />
              <p className="px-4 pb-1 text-[0.6875rem] font-medium uppercase tracking-wide" style={{ color: "var(--plt-muted)" }}>
                {copy.nav.support}
              </p>
              <Link
                href="/help"
                className="flex items-center justify-between rounded-2xl px-4 py-4 text-[1rem] font-medium"
                style={{ color: "var(--plt-ink)" }}
              >
                {copy.nav.helpCenter}
                <ChevronGlyph />
              </Link>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="flex items-center justify-between rounded-2xl px-4 py-4 text-[1rem] font-medium"
                style={{ color: "var(--plt-ink)" }}
              >
                {copy.nav.contactSupport}
                <ChevronGlyph />
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function isActive(pathname: string, href: string) {
  const base = href.split("#")[0];
  if (!base || base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(base);
}

/* ───────────────────────── Desktop nav ───────────────────────── */

function DesktopLink({ node, active }: { node: { label: string; href: string }; active: boolean }) {
  return (
    <Link
      href={node.href}
      className={cn(
        "relative rounded-md px-3 py-2 text-[0.875rem] font-medium leading-none tracking-[-0.005em] transition-colors",
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
          "inline-flex items-center gap-1 rounded-md px-3 py-2 text-[0.875rem] font-medium leading-none tracking-[-0.005em] transition-colors",
          open ? "text-[var(--plt-ink)]" : "text-[var(--plt-muted)] hover:text-[var(--plt-ink)]",
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
 * Tulala wordmark — all-lowercase bold sans (Geist), with a full-stop as the
 * punctuation mark that carries the brand. The period is intentionally in
 * `--tl-forest` so the brand accent lives on the mark itself.
 */
function TulalaWordmark() {
  return (
    <span
      aria-hidden
      className="plt-display inline-flex items-baseline leading-none"
      style={{
        fontWeight: 700,
        letterSpacing: "-0.045em",
        fontSize: "1.5rem",
        color: "var(--plt-accent)",
      }}
    >
      tulala
      <span style={{ color: "var(--plt-forest)", fontSize: "14px" }}>.</span>
      <span style={{ fontWeight: 500, fontSize: "20px", color: "var(--plt-ink-soft)" }}>digital</span>
    </span>
  );
}
