import type { Metadata } from "next";
import Link from "next/link";
import { getSiteUrl } from "@/lib/auth-flow";
import { getRequestLocale } from "@/i18n/request-locale";
import { getMarketingCopy } from "@/lib/marketing/copy";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Account setup",
};

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The rest of this surface is English-only today, but the legal line was
  // the one string a Spanish visitor still hit from /es signup flows.
  const locale = await getRequestLocale();
  return (
    <div
      className="site-theme-platform flex min-h-full flex-1 flex-col"
      data-platform-surface="marketing"
      style={{ background: "var(--plt-bg)" }}
    >
      <OnboardingTopBar />
      <main className="flex-1">{children}</main>
      <OnboardingFooter legalLine={getMarketingCopy(locale).footer.legalLine} />
    </div>
  );
}

function OnboardingTopBar() {
  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-xl"
      style={{
        background:
          "color-mix(in srgb, var(--plt-bg) 88%, transparent)",
        borderBottom: "1px solid var(--plt-hairline)",
      }}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:h-[72px] sm:px-8">
        <Link
          href="/"
          aria-label="Tulala home"
          className="inline-flex items-baseline leading-none"
          style={{ color: "var(--plt-ink)" }}
        >
          <span
            className="plt-display"
            style={{
              fontWeight: 700,
              letterSpacing: "-0.045em",
              fontSize: "1.375rem",
            }}
          >
            tulala
          </span>
          <span style={{ color: "var(--plt-forest)", fontSize: "1.375rem", fontWeight: 700 }}>.</span>
        </Link>
        <Link
          href="/login"
          className="text-[0.8125rem] font-medium leading-none tracking-[-0.005em] transition-colors hover:text-[var(--plt-ink)]"
          style={{ color: "var(--plt-muted)" }}
        >
          Sign in
        </Link>
      </div>
    </header>
  );
}

function OnboardingFooter({ legalLine }: { legalLine: string }) {
  return (
    <footer
      className="mt-12 py-8"
      style={{
        borderTop: "1px solid var(--plt-hairline)",
        background: "var(--plt-bg)",
      }}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-5 sm:flex-row sm:px-8">
        <p
          className="text-[0.75rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          {/* Same copyright line as the marketing footer's bottom rail; the
              category message lives in the logo lockup only. */}
          © {new Date().getFullYear()} {PLATFORM_BRAND.legalName}. {legalLine}
        </p>
        <div className="flex items-center gap-5 text-[0.75rem]">
          <Link
            href={`${getSiteUrl()}/legal/terms`}
            className="transition-colors hover:text-[var(--plt-ink)]"
            style={{ color: "var(--plt-muted)" }}
          >
            Terms
          </Link>
          <Link
            href={`${getSiteUrl()}/legal/privacy`}
            className="transition-colors hover:text-[var(--plt-ink)]"
            style={{ color: "var(--plt-muted)" }}
          >
            Privacy
          </Link>
          {/* /about, not /contact: the marketing host has no /contact page
              (it is not in MARKETING_PAGE_PREFIXES, and the CMS clean-URL
              rewrite that would rescue it is agency-hosts-only), so this
              footer link 404'd on every surface. /about is the contact
              surface. */}
          <Link
            href={`${getSiteUrl()}/about`}
            className="transition-colors hover:text-[var(--plt-ink)]"
            style={{ color: "var(--plt-muted)" }}
          >
            Contact
          </Link>
        </div>
      </div>
    </footer>
  );
}
