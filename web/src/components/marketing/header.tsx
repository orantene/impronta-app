"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { MarketingCta } from "./cta-link";

type NavItem = { label: string; href: string; description?: string };

const NAV_ITEMS: NavItem[] = [
  { label: "Product", href: "/how-it-works", description: "The roster operating system, end to end" },
  { label: "Operators", href: "/operators", description: "For independents running solo" },
  { label: "Agencies", href: "/agencies", description: "For representation teams" },
  { label: "Network", href: "/network", description: "The shared discovery layer" },
  { label: "Pricing", href: "/pricing", description: "Free to start, simple to scale" },
];

export function MarketingHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const condensed = scrolled || menuOpen;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-[background,border-color,backdrop-filter] duration-300",
        condensed ? "backdrop-blur-xl" : "backdrop-blur-0",
      )}
      style={{
        background: condensed
          ? "color-mix(in srgb, var(--plt-bg) 80%, transparent)"
          : "transparent",
        borderBottom: `1px solid ${condensed ? "var(--plt-hairline)" : "transparent"}`,
      }}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-6 px-5 sm:h-[72px] sm:px-8">
        <Link
          href="/"
          className="group relative -mx-1 flex items-center gap-2.5 rounded-md px-1 py-1"
          aria-label={`${PLATFORM_BRAND.name} — home`}
          style={{ color: "var(--plt-ink)" }}
        >
          <RostraMark />
          <span
            className="plt-display text-[1.15rem] font-semibold leading-none tracking-[-0.03em] sm:text-[1.25rem]"
          >
            {PLATFORM_BRAND.name}
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative rounded-md px-3 py-2 text-[0.875rem] font-medium leading-none tracking-[-0.005em] transition-colors",
                  isActive
                    ? "text-[var(--plt-ink)]"
                    : "text-[var(--plt-muted)] hover:text-[var(--plt-ink)]",
                )}
              >
                {item.label}
                {isActive ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-3 -bottom-0.5 h-px"
                    style={{ background: "var(--plt-forest)" }}
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href="/waitlist?intent=signin"
            className="rounded-md px-3 py-2 text-[0.875rem] font-medium leading-none tracking-[-0.005em] transition-colors hover:text-[var(--plt-ink)]"
            style={{ color: "var(--plt-muted)" }}
          >
            Sign in
          </Link>
          <MarketingCta
            href="/get-started"
            variant="primary"
            size="md"
            eventSource="header"
            eventIntent="get-started"
          >
            Start free
          </MarketingCta>
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
          className="lg:hidden"
          style={{
            background: "var(--plt-bg)",
            borderTop: "1px solid var(--plt-hairline)",
          }}
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-5 py-5 sm:px-8">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center justify-between rounded-2xl px-4 py-4 text-[1rem] font-medium transition-colors hover:bg-[var(--plt-bg-deep)]"
                style={{ color: "var(--plt-ink)" }}
              >
                <span className="flex flex-col">
                  <span>{item.label}</span>
                  {item.description ? (
                    <span
                      className="mt-0.5 text-[0.8125rem] font-normal"
                      style={{ color: "var(--plt-muted)" }}
                    >
                      {item.description}
                    </span>
                  ) : null}
                </span>
                <ChevronGlyph />
              </Link>
            ))}
            <div
              className="mt-3 flex flex-col gap-2 border-t pt-4"
              style={{ borderColor: "var(--plt-hairline)" }}
            >
              <Link
                href="/waitlist?intent=signin"
                className="flex items-center justify-between rounded-2xl px-4 py-4 text-[1rem] font-medium"
                style={{ color: "var(--plt-ink-soft)" }}
              >
                Sign in
                <ChevronGlyph />
              </Link>
              <MarketingCta
                href="/get-started"
                variant="primary"
                size="lg"
                eventSource="mobile-header"
                eventIntent="get-started"
                className="w-full"
              >
                Start free
              </MarketingCta>
              <p
                className="mt-2 text-center text-[0.75rem]"
                style={{ color: "var(--plt-muted)" }}
              >
                {PLATFORM_BRAND.stage} · founder-led
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

/**
 * Rostra wordmark mark — a single geometric glyph. Two intersecting diagonals
 * suggest a "network crossing" / roster connection inside a rounded square.
 * Kept monochrome so it reads on light + dark surfaces.
 */
function RostraMark() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <rect
        x="1.5"
        y="1.5"
        width="25"
        height="25"
        rx="7.5"
        fill="var(--plt-forest)"
      />
      <path
        d="M9 19V10.5C9 9.67 9.67 9 10.5 9H14.5C16.43 9 18 10.57 18 12.5V12.5C18 14.43 16.43 16 14.5 16H11.5"
        stroke="var(--plt-forest-on)"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.5 15.5L19 19.5"
        stroke="var(--plt-forest-on)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MenuGlyph() {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" fill="none" aria-hidden>
      <path d="M1 1H17M1 11H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M1 1L13 13M13 1L1 13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronGlyph() {
  return (
    <svg width="8" height="12" viewBox="0 0 8 12" fill="none" aria-hidden>
      <path
        d="M1 1L7 6L1 11"
        stroke="var(--plt-muted)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
