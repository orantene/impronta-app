import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Account setup",
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="site-theme-platform flex min-h-full flex-1 flex-col"
      data-platform-surface="marketing"
      style={{ background: "var(--plt-bg)" }}
    >
      <OnboardingTopBar />
      <main className="flex-1">{children}</main>
      <OnboardingFooter />
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
          aria-label="Tulala — home"
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

function OnboardingFooter() {
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
          © {new Date().getFullYear()} Tulala. The talent business platform.
        </p>
        <div className="flex items-center gap-5 text-[0.75rem]">
          <Link
            href="/legal/terms"
            className="transition-colors hover:text-[var(--plt-ink)]"
            style={{ color: "var(--plt-muted)" }}
          >
            Terms
          </Link>
          <Link
            href="/legal/privacy"
            className="transition-colors hover:text-[var(--plt-ink)]"
            style={{ color: "var(--plt-muted)" }}
          >
            Privacy
          </Link>
          <Link
            href="/contact"
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
