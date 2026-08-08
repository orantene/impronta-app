/**
 * Auth Shell v2 chrome — brand panel, top bar, footer.
 *
 * Binding spec: `web/docs/auth-shell-domain-architecture-2026-08-07.md` §4
 * (D2 — ONE host-branded auth shell, deliberately minimal, NOT the marketing
 * shell). Minimal was already the ruling; the failure was that the minimal
 * shell looked ABANDONED: a naked wordmark, an unstyled centered form, and a
 * skeletal footer.
 *
 * Layout contract:
 *   ≥1024px  two columns — left brand panel (sticky, full viewport height),
 *            right column = slim top bar + form card + footer.
 *   <1024px  single column — compact brand header (lockup + tagline +, on the
 *            platform branch, the marketing hero's proof chips), form, footer.
 *
 * Host-awareness is resolved by the layout and passed in as a plain `brand`
 * object, so this module does no I/O and cannot fail a render.
 *
 * Exactly ONE exit affordance exists: "Back to {site}" in the top bar, pointing
 * at `/` on the CURRENT host (never cross-host — D1 keeps auth host-local, and
 * a cross-host link is how the branded-host dead ends kept happening).
 */

import Link from "next/link";

import { TulalaLogo } from "@/components/brand/tulala-logo";
import { getSiteUrl } from "@/lib/auth-flow";

export type AuthShellBrand = {
  /** Display name: tenant `public_name` on a whitelabel host, else "Tulala". */
  label: string;
  /** True only on a whitelabel agency/hub host. */
  isTenant: boolean;
  /** Tenant brand logo (same resolver as the storefront header). */
  logoUrl: string | null;
  /** Sub-wordmark line: tenant tagline, or Tulala's category descriptor. */
  tagline: string | null;
  /** One-line value statement for the brand panel. */
  panelHeading: string;
  /** Supporting sentence under the panel heading. */
  panelLead: string;
  /**
   * Proof chips mirroring the marketing hero. Platform branch only — we do not
   * invent claims on a tenant's behalf.
   */
  proofChips: readonly string[];
  /** Localized "Back to {site}" label, already interpolated. */
  backLabel: string;
};

/* ───────────────────────────── brand lockup ───────────────────────────── */

/**
 * The brand mark. Tenant hosts get the agency's real uploaded logo (falling
 * back to a letterspaced wordmark when branding is still empty); platform
 * hosts get the Tulala lockup.
 */
function BrandMark({
  brand,
  height,
  onDark,
}: {
  brand: AuthShellBrand;
  height: number;
  onDark?: boolean;
}) {
  if (brand.isTenant && brand.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- same plain <img>
      // render as the storefront header for this exact asset; the auth chrome
      // must not introduce a second loader for it.
      <img
        src={brand.logoUrl}
        alt={brand.label}
        style={{ height: `${height}px` }}
        className="w-auto"
        loading="eager"
        decoding="sync"
      />
    );
  }
  if (brand.isTenant) {
    return (
      <span
        className="plt-display font-medium uppercase tracking-[0.22em]"
        style={{
          fontSize: `${Math.max(0.8, height / 24)}rem`,
          color: onDark ? "var(--plt-on-inverse)" : "var(--plt-ink)",
        }}
      >
        {brand.label}
      </span>
    );
  }
  return (
    <span
      style={{ color: onDark ? "var(--plt-on-inverse)" : "var(--plt-ink-strong)" }}
    >
      <TulalaLogo wordmarkHeight={height} />
    </span>
  );
}

/* ───────────────────────────── brand panel ───────────────────────────── */

function CheckGlyph() {
  return (
    <svg
      aria-hidden
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className="shrink-0"
    >
      <path
        d="M1.5 6.5 4.25 9.25 10.5 3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Left brand panel (≥1024px only).
 *
 * Platform branch: the forest gradient the marketing hero uses as its dark
 * counterweight. Tenant branch: a neutral ink gradient — no new DB read for
 * storefront imagery, because an image read that fails must never take the
 * login page with it, and a tenant-tinted gradient would need an accent column
 * that is not in any public projection today. The agency's real logo plus its
 * own tagline is what makes this panel theirs.
 */
export function AuthBrandPanel({ brand }: { brand: AuthShellBrand }) {
  const background = brand.isTenant
    ? "linear-gradient(158deg, var(--plt-bg-inverse) 0%, var(--plt-bg-inverse-soft) 62%, var(--plt-bg-inverse) 100%)"
    : "linear-gradient(158deg, var(--plt-forest-deep) 0%, var(--plt-forest) 58%, var(--plt-forest-bright) 100%)";

  return (
    <aside
      className="relative hidden overflow-hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:px-12 lg:py-12 xl:px-16"
      style={{ background }}
    >
      {/* Soft accent bloom so the flat gradient reads as composed, not empty. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 88% 8%, color-mix(in srgb, var(--plt-accent) 16%, transparent) 0%, transparent 62%)",
        }}
      />

      <div className="relative">
        <Link
          href="/"
          aria-label={brand.label}
          className="inline-flex items-center leading-none"
        >
          <BrandMark brand={brand} height={26} onDark />
        </Link>
        {brand.tagline ? (
          <p
            className="plt-mono mt-3 text-[0.6875rem] font-medium uppercase tracking-[0.2em]"
            style={{ color: "var(--plt-on-inverse-soft)" }}
          >
            {brand.tagline}
          </p>
        ) : null}
      </div>

      <div className="relative max-w-[26rem]">
        <h2
          className="plt-display text-[2.125rem] font-semibold leading-[1.12] tracking-[-0.025em] xl:text-[2.5rem]"
          style={{ color: "var(--plt-on-inverse)" }}
        >
          {brand.panelHeading}
        </h2>
        <p
          className="mt-4 text-[0.9375rem] leading-[1.6]"
          style={{ color: "var(--plt-on-inverse-muted)" }}
        >
          {brand.panelLead}
        </p>

        {brand.proofChips.length > 0 ? (
          <ul className="mt-7 space-y-2.5">
            {brand.proofChips.map((chip) => (
              <li
                key={chip}
                className="flex items-center gap-2.5 text-[0.875rem]"
                style={{ color: "var(--plt-on-inverse-muted)" }}
              >
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full"
                  style={{
                    background:
                      "color-mix(in srgb, var(--plt-on-inverse) 12%, transparent)",
                    color: "var(--plt-accent-soft)",
                  }}
                >
                  <CheckGlyph />
                </span>
                {chip}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="relative">
        <p
          className="text-[0.75rem]"
          style={{ color: "var(--plt-on-inverse-soft)" }}
        >
          {`© ${new Date().getFullYear()} ${brand.label}.`}
        </p>
      </div>
    </aside>
  );
}

/* ───────────────────────────── top bar ───────────────────────────── */

function BackGlyph() {
  return (
    <svg
      aria-hidden
      width="14"
      height="10"
      viewBox="0 0 14 10"
      fill="none"
      className="transition-transform duration-200 group-hover:-translate-x-0.5"
    >
      <path
        d="M13 5H1M1 5l4-4M1 5l4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Slim top bar over the form column.
 *
 * <1024px it IS the brand header (lockup + tagline + proof chips) because the
 * brand panel is hidden. ≥1024px the lockup lives in the panel, so the bar
 * carries only the single "Back to {site}" affordance — the lockup is not
 * repeated.
 */
export function AuthTopBar({ brand }: { brand: AuthShellBrand }) {
  return (
    <header
      // Sticky only from lg up, where the bar is a single slim row. On mobile
      // the bar carries the lockup + tagline + chips (~147px) and pinning that
      // would permanently eat ~18% of a 375×812 viewport.
      className="z-30 backdrop-blur-xl lg:sticky lg:top-0"
      style={{
        background: "color-mix(in srgb, var(--plt-bg) 88%, transparent)",
        borderBottom: "1px solid var(--plt-hairline)",
      }}
    >
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:justify-end lg:py-4">
        <div className="lg:hidden">
          <Link
            href="/"
            aria-label={brand.label}
            className="inline-flex items-center leading-none"
          >
            <BrandMark brand={brand} height={22} />
          </Link>
          {brand.tagline ? (
            <p
              className="plt-mono mt-1.5 text-[0.5625rem] font-medium uppercase tracking-[0.18em]"
              style={{ color: "var(--plt-muted)" }}
            >
              {brand.tagline}
            </p>
          ) : null}
        </div>

        <Link
          href="/"
          className="group inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-[0.8125rem] font-medium transition-colors"
          style={{
            border: "1px solid var(--plt-hairline-strong)",
            color: "var(--plt-ink-soft)",
          }}
        >
          <BackGlyph />
          <span className="max-w-[11rem] truncate">{brand.backLabel}</span>
        </Link>
      </div>

      {brand.proofChips.length > 0 ? (
        <div
          className="lg:hidden"
          style={{ borderTop: "1px solid var(--plt-hairline)" }}
        >
          <ul className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-2.5 sm:px-8">
            {brand.proofChips.map((chip) => (
              <li
                key={chip}
                className="inline-flex items-center gap-1.5 text-[0.6875rem] font-medium"
                style={{ color: "var(--plt-muted)" }}
              >
                <span style={{ color: "var(--plt-forest)" }}>
                  <CheckGlyph />
                </span>
                {chip}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </header>
  );
}

/* ───────────────────────────── footer ───────────────────────────── */

/**
 * Footer, equal weight on BOTH branches: brand line + tagline + legal links +
 * the language toggle (moved out of the form column, where it used to dangle
 * under the card).
 */
export function AuthFooter({
  brand,
  brandLine,
  legal,
  languageToggle,
}: {
  brand: AuthShellBrand;
  /** Localized copyright + positioning line, resolved by the layout. */
  brandLine: string;
  /** Localized legal-link labels, resolved by the layout. */
  legal: { terms: string; privacy: string; contact: string };
  languageToggle: React.ReactNode;
}) {
  return (
    <footer
      className="py-7"
      style={{
        borderTop: "1px solid var(--plt-hairline)",
        background: "var(--plt-bg)",
      }}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 sm:px-8">
        <div className="flex flex-col gap-1">
          <p
            className="text-[0.75rem] leading-[1.5]"
            style={{ color: "var(--plt-muted)" }}
          >
            {brandLine}
          </p>
          {brand.tagline ? (
            <p
              className="text-[0.75rem] leading-[1.5]"
              style={{ color: "var(--plt-muted-soft)" }}
            >
              {brand.tagline}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-5 text-[0.75rem]">
            <FooterLink href={`${getSiteUrl()}/legal/terms`}>
              {legal.terms}
            </FooterLink>
            <FooterLink href={`${getSiteUrl()}/legal/privacy`}>
              {legal.privacy}
            </FooterLink>
            {/* /about, not /contact: the marketing host has no /contact page
                (not in MARKETING_PAGE_PREFIXES, and the CMS clean-URL rewrite
                that would rescue it is agency-hosts-only), so a /contact link
                404'd on every surface. /about is the contact surface. */}
            <FooterLink href={`${getSiteUrl()}/about`}>{legal.contact}</FooterLink>
          </div>
          {languageToggle}
        </div>
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="transition-colors hover:text-[var(--plt-ink)]"
      style={{ color: "var(--plt-muted)" }}
    >
      {children}
    </Link>
  );
}
