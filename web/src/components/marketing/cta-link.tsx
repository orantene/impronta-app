"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { stripLocaleFromPathname, withLocaleHref } from "@/i18n/pathnames";
import { trackProductEvent } from "@/lib/analytics/track-client";

type Variant = "primary" | "secondary" | "ghost" | "inline" | "inverse";
type Size = "sm" | "md" | "lg";

const BASE_CLASSES =
  "group relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium leading-none tracking-[-0.005em] transition-[background,color,transform,box-shadow,border-color] duration-200 focus-visible:outline-none";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-[var(--plt-forest)] text-[var(--plt-forest-on)] shadow-[var(--plt-shadow-forest)] hover:bg-[var(--plt-forest-deep)] hover:-translate-y-[1px] hover:shadow-[0_20px_40px_-18px_rgba(31,74,58,0.55)] active:translate-y-0",
  secondary:
    "border border-[var(--plt-hairline-strong)] bg-[var(--plt-bg-raised)] text-[var(--plt-ink)] hover:border-[var(--plt-ink)] hover:bg-[var(--plt-bg-elevated)]",
  ghost:
    "text-[var(--plt-ink-soft)] hover:text-[var(--plt-forest)]",
  inverse:
    "bg-[var(--plt-on-inverse)] text-[var(--plt-ink)] hover:bg-[var(--plt-bg-elevated)] hover:-translate-y-[1px]",
  inline:
    "text-[var(--plt-forest)] hover:text-[var(--plt-forest-bright)] !px-0 !py-0 !h-auto !rounded-none",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-9 px-4 text-[0.8125rem]",
  md: "h-11 px-5 text-[0.875rem]",
  lg: "h-14 px-7 text-[0.9375rem]",
};

export interface MarketingCtaProps {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
  eventSource?: string;
  eventIntent?: string;
  external?: boolean;
  withArrow?: boolean;
  onClick?: () => void;
}

export function MarketingCta({
  href,
  children,
  variant = "primary",
  size = "lg",
  className,
  eventSource,
  eventIntent,
  external = false,
  withArrow = true,
  onClick,
}: MarketingCtaProps) {
  // Every marketing path is served at BOTH `/path` and `/es/path` (see the
  // sitemap flatMap), so an un-prefixed href silently drops a Spanish reader
  // back onto the English page mid-journey. Localise here rather than at each
  // call site: callers that already pass `withLocaleHref(...)` are unaffected
  // because `withLocalePath` strips any existing locale prefix before adding
  // one, so applying it twice is idempotent.
  //
  // `external` hrefs are left alone, and `withLocaleHref` itself returns
  // anything that is not an internal absolute path (mailto:, tel:, #anchor,
  // //host) untouched.
  const pathname = usePathname();
  const { locale } = stripLocaleFromPathname(pathname ?? "/");
  const resolvedHref = external ? href : withLocaleHref(href, locale);

  const handleClick = () => {
    if (eventSource) {
      trackProductEvent("marketing_cta_clicked", {
        source_page: eventSource,
        intent: eventIntent ?? "generic",
        href,
      });
    }
    onClick?.();
  };

  const classes = cn(BASE_CLASSES, SIZE_CLASSES[size], VARIANT_CLASSES[variant], className);

  const content = (
    <>
      <span>{children}</span>
      {withArrow && variant !== "inline" ? <ArrowGlyph /> : null}
      {withArrow && variant === "inline" ? <ArrowGlyphInline /> : null}
    </>
  );

  if (external) {
    return (
      <a
        href={resolvedHref}
        target="_blank"
        rel="noreferrer noopener"
        className={classes}
        onClick={handleClick}
      >
        {content}
      </a>
    );
  }

  return (
    <Link href={resolvedHref} className={classes} onClick={handleClick}>
      {content}
    </Link>
  );
}

function ArrowGlyph() {
  return (
    <svg
      aria-hidden
      width="14"
      height="10"
      viewBox="0 0 14 10"
      fill="none"
      className="transition-transform duration-200 group-hover:translate-x-0.5"
    >
      <path
        d="M1 5H13M13 5L9 1M13 5L9 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowGlyphInline() {
  return (
    <svg
      aria-hidden
      width="10"
      height="8"
      viewBox="0 0 14 10"
      fill="none"
      className="transition-transform duration-200 group-hover:translate-x-0.5"
    >
      <path
        d="M1 5H13M13 5L9 1M13 5L9 9"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
