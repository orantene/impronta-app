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
  /**
   * The tenant's own brand accent as a plain validated CSS hex (never a
   * `var()`), whitelabel hosts only; `null` when the agency has not set one.
   *
   * A LITERAL hex on purpose. `var(--x, var(--x))`-shaped indirection through a
   * token that may be undeclared resolves to the EMPTY string and silently
   * kills the whole gradient (incident: CSS var cycle collapse, 2026-08-07), so
   * the accent is resolved to a real value server-side or left `null`.
   */
  accent: string | null;
  /** One-line value statement for the brand panel. */
  panelHeading: string;
  /** Supporting sentence under the panel heading. */
  panelLead: string;
  /**
   * Bullet lines for the DESKTOP brand panel (≥1024px) only.
   *
   * Separate from {@link proofChips} because the two slots have different
   * rules. On the tenant branch these are statements about the ACCOUNT (who
   * signs in here, what the product does) — never claims made on the agency's
   * behalf — and they exist to give the panel real mass. Keeping them out of
   * `proofChips` also keeps them off the mobile top bar, where the tenant
   * branch deliberately stays a compact lockup.
   */
  panelPoints: readonly string[];
  /**
   * Proof chips mirroring the marketing hero, rendered in the panel AND the
   * mobile top bar. Platform branch only — we do not invent claims on a
   * tenant's behalf.
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
 * counterweight, plus the hero's three proof chips. Unchanged.
 *
 * Tenant branch (B5, 2026-08-07) — this panel used to be a flat near-black
 * gradient with a small lockup at the top and one short heading floating in the
 * middle, leaving the upper half of a 1440×860 viewport visibly empty. Owner bar
 * is "kill dead space". The fix has three parts, in this order of preference:
 *
 *   1. NOT storefront imagery. Route considered and rejected: the only
 *      TENANT-level image columns with a public read path are
 *      `agency_branding.og_image_media_asset_id` and
 *      `agency_business_identity.seo_default_share_image_media_asset_id`
 *      (reader: `loadPublicShareImageUrl`). Both are NULL for every tenant in
 *      the database today, including the only whitelabel-tier tenant, so an
 *      image background would render nothing for anyone while adding a second
 *      failure mode to the login page. `agency_talent_overlays.cover_media_asset_id`
 *      is PER-TALENT, not per-tenant. If a tenant-level hero image ever gets a
 *      public projection, this is the seam to wire it into: read it in the
 *      layout, pass it on `brand`, and layer it UNDER the gradient below.
 *   2. The agency's own ACCENT tints the gradient and the bloom, so the panel
 *      is recognisably theirs rather than generic dark. Resolved server-side to
 *      a literal hex (see `AuthShellBrand.accent`); `null` falls straight back
 *      to the previous neutral gradient.
 *   3. Real mass in the band that was empty: three account-level lines
 *      (`panelPoints`) under the heading, which bring the tenant content block
 *      to the same height as the platform branch's heading+chips block (231px
 *      measured at 1440×860, identical to platform), a second accent bloom
 *      behind the upper band so it has luminance structure instead of flat
 *      near-black, and a hairline over the brand line.
 *
 *      Rejected here: an oversized brand-initial monogram watermark. Built and
 *      QA'd at 1440×860 — a serif capital "I" at 300px reads as a solid slab
 *      cropped by the panel edge, i.e. as a rendering artifact, not as brand
 *      texture. It also cannot be made to work for arbitrary tenant names. A
 *      large watermark of the tenant's real LOGO is the version worth trying if
 *      this is revisited, but the live whitelabel tenant has no uploaded logo
 *      (text wordmark fallback), so today it would render nothing.
 *
 * Everything here is decoration with a `null`-safe fallback: no read failure,
 * missing accent, or missing tagline can break the layout or the sign-in form.
 */
export function AuthBrandPanel({ brand }: { brand: AuthShellBrand }) {
  // Accent only applies to the tenant branch — the platform gradient is the
  // marketing hero's and must stay byte-identical.
  const accent = brand.isTenant ? brand.accent : null;
  const tenantGradient = accent
    ? `linear-gradient(158deg, color-mix(in srgb, ${accent} 9%, var(--plt-bg-inverse)) 0%, color-mix(in srgb, ${accent} 3%, var(--plt-bg-inverse-soft)) 58%, var(--plt-bg-inverse) 100%)`
    : "linear-gradient(158deg, var(--plt-bg-inverse) 0%, var(--plt-bg-inverse-soft) 62%, var(--plt-bg-inverse) 100%)";
  const background = brand.isTenant
    ? tenantGradient
    : "linear-gradient(158deg, var(--plt-forest-deep) 0%, var(--plt-forest) 58%, var(--plt-forest-bright) 100%)";
  const bloomColor = accent ?? "var(--plt-accent)";
  const chipAccent = accent ?? "var(--plt-accent-soft)";

  return (
    <aside
      className="relative hidden overflow-hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:px-12 lg:py-12 xl:px-16"
      style={{ background }}
    >
      {/* Soft accent bloom so the flat gradient reads as composed, not empty.
          Two layers on the tenant branch: the shared top-right bloom, plus a
          wider one centred on the band between the lockup and the heading —
          that band is what read as "empty" at 1440×860, and light is what
          fills it without inventing content. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(120% 80% at 88% 8%, color-mix(in srgb, ${bloomColor} 16%, transparent) 0%, transparent 62%)`,
        }}
      />
      {brand.isTenant ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(85% 55% at 18% 30%, color-mix(in srgb, ${bloomColor} 13%, transparent) 0%, transparent 72%)`,
          }}
        />
      ) : null}

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

        {brand.panelPoints.length > 0 ? (
          <ul className="mt-7 space-y-2.5">
            {brand.panelPoints.map((point) => (
              <li
                key={point}
                className="flex items-center gap-2.5 text-[0.875rem]"
                style={{ color: "var(--plt-on-inverse-muted)" }}
              >
                <span
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background:
                      "color-mix(in srgb, var(--plt-on-inverse) 12%, transparent)",
                    color: chipAccent,
                  }}
                >
                  <CheckGlyph />
                </span>
                {point}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="relative">
        <span
          aria-hidden
          className="mb-4 block h-px w-14"
          style={{
            background: `color-mix(in srgb, ${bloomColor} 55%, transparent)`,
          }}
        />
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
  contactHref,
  languageToggle,
}: {
  brand: AuthShellBrand;
  /** Localized copyright + positioning line, resolved by the layout. */
  brandLine: string;
  /** Localized legal-link labels, resolved by the layout. */
  legal: { terms: string; privacy: string; contact: string };
  /**
   * Where "Contact" goes. Resolved by the layout — see the B7 ruling there for
   * why Contact is host-aware while Terms and Privacy are not.
   */
  contactHref: string;
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
            {/* B7 RULING — Terms and Privacy point at tulala.digital on EVERY
                host, whitelabel included, and that is deliberate. DO NOT
                "fix" this to a tenant URL: the account being created or
                signed into is a Tulala platform account and the agreement
                that binds the user is Tulala's, so these two links must name
                the party they actually bind. A brand seam in a footer is a far
                smaller problem than misrepresenting whose terms apply.
                Contact is the one that IS host-aware — see the ruling comment
                in `layout.tsx`. */}
            <FooterLink href={`${getSiteUrl()}/legal/terms`}>
              {legal.terms}
            </FooterLink>
            <FooterLink href={`${getSiteUrl()}/legal/privacy`}>
              {legal.privacy}
            </FooterLink>
            <FooterLink href={contactHref}>{legal.contact}</FooterLink>
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
  const className = "transition-colors hover:text-[var(--plt-ink)]";
  const style = { color: "var(--plt-muted)" };
  // `mailto:` is not a route. next/link would try to treat it as one, so the
  // tenant-contact-email fallback renders a plain anchor.
  if (href.startsWith("mailto:")) {
    return (
      <a href={href} className={className} style={style}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} style={style}>
      {children}
    </Link>
  );
}
