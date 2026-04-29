"use client";

/**
 * <PublicHeaderMobileMenu> — first-class mobile navigation surface.
 *
 * What this component owns:
 *   - The hamburger trigger button (visible <md only).
 *   - The dialog/sheet that opens when the trigger is tapped.
 *   - The variant switching (`drawer-right` | `sheet-bottom` |
 *     `full-screen-fade`) read from the `shell.mobile-nav-variant` token.
 *   - Mobile-specific content: nav links + language toggle + utility row.
 *
 * What this component does NOT own:
 *   - Tap-target hygiene of the bar itself (that's the parent
 *     <PublicHeader> grid layout).
 *   - The presence of the desktop `cmsHeaderLinks` nav — those still
 *     render inline on >=md from <PublicHeader>.
 *
 * The variant comes from a token attribute on <html>, set by the design
 * token resolver at SSR. We mirror it into local state on mount so the
 * dialog can pick its layout class. SSR renders the default
 * (`drawer-right`); hydration switches to the actual variant if it
 * differs.
 *
 * Why a brand-new component instead of bolting onto Sheet (the Radix
 * wrapper at components/ui/sheet.tsx): we want token-aware variants and
 * a `.public-header-menu` CSS hook so the design-token system (already
 * the source of truth for shell chrome) can target it directly. Sheet
 * is too generic to grow this concern without leaking storefront
 * styling into a cross-app primitive.
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

import type { PublicNavLink } from "@/lib/cms/public-navigation";
import type { Locale } from "@/i18n/config";

type MobileNavVariant = "drawer-right" | "sheet-bottom" | "full-screen-fade";

const VARIANTS = ["drawer-right", "sheet-bottom", "full-screen-fade"] as const;

interface Props {
  navLinks: PublicNavLink[];
  locale: Locale;
  pathnameWithoutLocale: string;
  /** Brand label used as the menu's accessible title. */
  brandLabel: string;
  /** When set, renders a primary CTA button at the top of the menu body. */
  ctaLabel?: string | null;
  ctaHref?: string | null;
  /** Slot for trailing utility content (saved, account etc.) inside the menu. */
  utilityContent?: ReactNode;
  /** Localized copy for the trigger button's screen-reader label. */
  openMenuLabel?: string;
  closeMenuLabel?: string;
}

export function PublicHeaderMobileMenu({
  navLinks,
  locale,
  pathnameWithoutLocale,
  brandLabel,
  ctaLabel,
  ctaHref,
  utilityContent,
  openMenuLabel = "Open menu",
  closeMenuLabel = "Close menu",
}: Props) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState<MobileNavVariant>("drawer-right");

  // Mirror the token attribute. The token resolver sets it on <html> at
  // SSR; we read it once after mount so the dialog can pick its layout
  // class. If the operator changes the token, the next request re-renders
  // with the new value (token attrs are part of the SSR HTML).
  useEffect(() => {
    const raw = document.documentElement.getAttribute(
      "data-token-shell-mobile-nav-variant",
    );
    if ((VARIANTS as readonly string[]).includes(raw ?? "")) {
      setVariant(raw as MobileNavVariant);
    }
  }, []);

  // Close on route change. Next.js doesn't fire a re-render reliably when
  // we link inside the menu, so we listen for popstate + intercept link
  // clicks via the onOpenChange + key on items.
  useEffect(() => {
    if (!open) return;
    function onPop() {
      setOpen(false);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={openMenuLabel}
          className="public-header__menu-trigger inline-flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:hidden"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          data-public-header-menu-overlay
          className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <Dialog.Content
          // `.public-header-menu` is the CSS hook the design-token
          // system targets. Variant-specific classes set position +
          // animation; the token CSS in token-presets.css can layer on
          // surface tone, typography, etc. without touching this file.
          data-public-header-menu
          data-mobile-nav-variant={variant}
          className={`public-header-menu ${VARIANT_CLASSES[variant]} fixed z-[60] flex flex-col gap-4 bg-background text-foreground shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300`}
        >
          <div className="flex items-center justify-between border-b border-border/60 pb-4">
            <Dialog.Title className="font-display text-base uppercase tracking-[0.18em] text-foreground">
              {brandLabel}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={closeMenuLabel}
                className="inline-flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <X className="size-5" aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          {ctaLabel && ctaHref ? (
            <Link
              href={ctaHref}
              onClick={() => setOpen(false)}
              className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {ctaLabel}
            </Link>
          ) : null}
          {navLinks.length > 0 ? (
            <nav
              aria-label="Site links"
              className="flex flex-col"
            >
              {navLinks.map((l) => (
                <Link
                  key={`${l.href}:${l.label}`}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="border-b border-border/40 py-3 text-base font-medium text-foreground transition-colors hover:text-primary"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          ) : null}

          <div className="mt-auto flex flex-col gap-3 border-t border-border/60 pt-4">
            <LanguageRow
              locale={locale}
              pathnameWithoutLocale={pathnameWithoutLocale}
              onPick={() => setOpen(false)}
            />
            {utilityContent ? (
              <div className="flex items-center justify-start gap-1.5">
                {utilityContent}
              </div>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const VARIANT_CLASSES: Record<MobileNavVariant, string> = {
  // Right drawer — classic mobile pattern. ~88vw on phones, capped at
  // 400px so it doesn't grow unbounded on tablets.
  "drawer-right":
    "inset-y-0 right-0 h-full w-[88vw] max-w-[400px] border-l border-border/70 px-5 py-5 data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
  // Bottom sheet — modern app-style. 80vh max so the user can still see
  // a sliver of context above.
  "sheet-bottom":
    "inset-x-0 bottom-0 max-h-[80vh] rounded-t-[18px] border-t border-border/70 px-5 pb-7 pt-4 data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
  // Full-screen fade — editorial / immersive. Background goes opaque,
  // type can grow.
  "full-screen-fade":
    "inset-0 px-6 py-6 data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
};

function LanguageRow({
  locale,
  pathnameWithoutLocale,
  onPick,
}: {
  locale: Locale;
  pathnameWithoutLocale: string;
  onPick: () => void;
}) {
  const localeOptions: Array<{ code: Locale; label: string }> = [
    { code: "en" as Locale, label: "EN" },
    { code: "es" as Locale, label: "ES" },
  ];
  return (
    <div className="flex items-center gap-3 text-xs">
      <span
        aria-hidden
        className="font-display uppercase tracking-[0.16em] text-muted-foreground"
      >
        Language
      </span>
      <div
        role="group"
        aria-label="Language"
        className="flex items-center gap-1 rounded-md border border-border/60 bg-background/80 px-1 py-0.5 text-xs font-medium"
      >
        {localeOptions.map((opt, i) => {
          const active = opt.code === locale;
          const href =
            opt.code === "en"
              ? pathnameWithoutLocale || "/"
              : `/${opt.code}${pathnameWithoutLocale}`;
          return (
            <span key={opt.code} className="contents">
              {i > 0 ? (
                <span className="text-border" aria-hidden>
                  |
                </span>
              ) : null}
              <Link
                href={href}
                onClick={onPick}
                className={`rounded px-2 py-0.5 transition-colors ${
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </Link>
            </span>
          );
        })}
      </div>
    </div>
  );
}
