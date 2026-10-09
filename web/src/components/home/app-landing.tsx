import Link from "next/link";
import { getSiteUrl } from "@/lib/auth-flow";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { TulalaLogo } from "@/components/brand/tulala-logo";
import { AuthCardLocaleToggle } from "@/components/auth/auth-card-locale-toggle";
import { appLandingCopy } from "./app-landing-copy";

/**
 * Root page for `kind === "app"` — the workspace host (app.tulala.digital) as
 * seen by signed-OUT visitors, including the post-logout landing. Authenticated
 * users are redirected to their dashboard by auth-routing inside updateSession.
 *
 * Rendered INSIDE the platform (Tulala) header/footer wireframe so it is never a
 * dead end: the wordmark, the top nav, and the footer all lead back to the
 * marketing site. Those routes live on the marketing host (not this app host),
 * so they are absolute via `getSiteUrl()`; only Sign in / Create account stay
 * on this host. Uses the `--plt-*` platform tokens (scoped by
 * `data-platform-surface="marketing"`) so the branding matches the public site.
 */
export function AppLanding({ locale = "en" }: { locale?: string }) {
  const copy = appLandingCopy(locale, PLATFORM_BRAND.name);
  const site = getSiteUrl();
  const year = new Date().getFullYear();

  const navLinks = [
    { label: copy.nav.discover, href: `${site}/discover-agencies` },
    { label: copy.nav.talent, href: `${site}/directory` },
    { label: copy.nav.pricing, href: `${site}/pricing` },
  ];

  return (
    <div
      data-platform-surface="marketing"
      className="flex min-h-screen flex-col"
      style={{ background: "var(--plt-bg)", color: "var(--plt-ink)" }}
    >
      {/* Header — the wordmark + nav return to the marketing site (the way out). */}
      <header
        className="sticky top-0 z-40 backdrop-blur-xl"
        style={{
          background: "color-mix(in srgb, var(--plt-bg) 88%, transparent)",
          borderBottom: "1px solid var(--plt-hairline)",
        }}
      >
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-6 px-5 sm:h-[72px] sm:px-8">
          <a
            href={site}
            aria-label={copy.homeAria}
            className="-mx-1 flex items-center rounded-md px-1 py-1"
          >
            <span style={{ color: "var(--plt-ink-strong)" }}>
              <TulalaLogo wordmarkHeight={25} />
            </span>
          </a>

          <nav className="hidden items-center gap-1 sm:flex">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-2 text-[0.875rem] font-medium leading-none tracking-[-0.005em] transition-colors hover:text-[var(--plt-ink)]"
                style={{ color: "var(--plt-muted)" }}
              >
                {l.label}
              </a>
            ))}
          </nav>

          <a
            href={site}
            className="rounded-md px-3 py-2 text-[0.875rem] font-medium leading-none tracking-[-0.005em] transition-colors hover:text-[var(--plt-ink)]"
            style={{ color: "var(--plt-muted)" }}
          >
            {copy.back}
          </a>
        </div>
      </header>

      {/* Sign-in gateway card */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <AuthCardLocaleToggle locale={locale} label={copy.languageGroup} />
          <p
            className="plt-display text-xs font-medium uppercase tracking-[0.4em]"
            style={{ color: "var(--plt-muted)" }}
          >
            {copy.workspace}
          </p>
          <h1
            className="plt-display mt-6 text-3xl font-normal leading-tight tracking-[0.02em] sm:text-4xl"
            style={{ color: "var(--plt-ink)" }}
          >
            {copy.welcome}
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-base" style={{ color: "var(--plt-muted)" }}>
            {copy.lead}
          </p>

          <div className="mt-10 flex flex-col items-center gap-3">
            <Link
              href="/login"
              className="inline-flex h-11 w-full max-w-xs items-center justify-center rounded-[var(--site-radius,10px)] px-8 text-sm font-semibold transition hover:opacity-90"
              style={{ background: "var(--plt-forest)", color: "#FFFFFF" }}
            >
              {copy.signIn}
            </Link>
            <Link
              href="/register"
              className="text-sm underline-offset-4 hover:underline"
              style={{ color: "var(--plt-muted)" }}
            >
              {copy.createAccount}
            </Link>
          </div>

          <p className="mt-8 text-sm" style={{ color: "var(--plt-muted)" }}>
            {copy.publicSite}{" "}
            <a href={site} className="underline underline-offset-4" style={{ color: "var(--plt-ink)" }}>
              {copy.goTo}
            </a>
          </p>
        </div>
      </main>

      {/* Footer — every link returns to the marketing site. */}
      <footer style={{ borderTop: "1px solid var(--plt-hairline)" }}>
        <div
          className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 text-[0.8125rem] sm:flex-row sm:px-8"
          style={{ color: "var(--plt-muted)" }}
        >
          <span>
            © {year} {PLATFORM_BRAND.name}. {PLATFORM_BRAND.tagline}.
          </span>
          <nav className="flex items-center gap-5">
            <a href={`${site}/legal/terms`} className="hover:underline" style={{ color: "var(--plt-muted)" }}>
              {copy.terms}
            </a>
            <a href={`${site}/legal/privacy`} className="hover:underline" style={{ color: "var(--plt-muted)" }}>
              {copy.privacy}
            </a>
            <a href={site} className="hover:underline" style={{ color: "var(--plt-ink)" }}>
              {PLATFORM_BRAND.domain}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
