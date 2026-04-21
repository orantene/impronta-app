import Link from "next/link";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

type FooterColumn = {
  label: string;
  items: { label: string; href: string }[];
};

const COLUMNS: FooterColumn[] = [
  {
    label: "Product",
    items: [
      { label: "How it works", href: "/how-it-works" },
      { label: "The network", href: "/network" },
      { label: "Pricing", href: "/pricing" },
      { label: "FAQ", href: "/faq" },
      { label: "Start free", href: "/get-started" },
    ],
  },
  {
    label: "Who it's for",
    items: [
      { label: "Independent operators", href: "/operators" },
      { label: "Agencies & representation", href: "/agencies" },
      { label: "Staffing & casting", href: "/organizations" },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Branded roster site", href: "/agencies#site" },
      { label: "People profiles", href: "/how-it-works#profiles" },
      { label: "Inquiry engine", href: "/agencies#pipeline" },
      { label: "Shared hub", href: "/network" },
      { label: "API & embeds", href: "/integrations" },
    ],
  },
  {
    label: "Legal",
    items: [
      { label: "Privacy", href: "/legal/privacy" },
      { label: "Terms", href: "/legal/terms" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer
      className="relative"
      style={{
        borderTop: "1px solid var(--plt-hairline)",
        background: "var(--plt-bg-deep)",
        color: "var(--plt-ink)",
      }}
    >
      <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-12 md:grid-cols-[1.25fr_repeat(4,_1fr)] md:gap-10">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <FooterMark />
              <span className="plt-display text-[1.25rem] font-semibold leading-none tracking-[-0.03em]">
                {PLATFORM_BRAND.name}
              </span>
            </div>
            <p
              className="mt-5 text-[0.9375rem] leading-[1.6]"
              style={{ color: "var(--plt-muted)" }}
            >
              {PLATFORM_BRAND.description}
            </p>
            <div className="mt-8 flex items-center gap-2.5">
              <SocialLink href="https://instagram.com" label="Instagram">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect
                    x="3"
                    y="3"
                    width="18"
                    height="18"
                    rx="5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
                  <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" />
                </svg>
              </SocialLink>
              <SocialLink href="https://x.com" label="X">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M4 4L20 20M20 4L4 20"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </SocialLink>
              <SocialLink href="https://linkedin.com" label="LinkedIn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect
                    x="3"
                    y="3"
                    width="18"
                    height="18"
                    rx="3"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M7 10V17M7 7.5V7.5M11 17V13C11 11.3 12.3 10 14 10C15.7 10 17 11.3 17 13V17"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </SocialLink>
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.label}>
              <h4
                className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.22em]"
                style={{ color: "var(--plt-muted-soft)" }}
              >
                {col.label}
              </h4>
              <ul className="mt-5 space-y-3">
                {col.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="inline-block text-[0.9375rem] transition-colors hover:text-[var(--plt-forest)]"
                      style={{ color: "var(--plt-ink-soft)" }}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="mt-16 flex flex-col items-start justify-between gap-4 border-t pt-6 text-[0.8125rem] sm:flex-row sm:items-center"
          style={{ borderColor: "var(--plt-hairline)", color: "var(--plt-muted)" }}
        >
          <span>
            &copy; {new Date().getFullYear()} {PLATFORM_BRAND.legalName}. {PLATFORM_BRAND.positioning}
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--plt-forest-bright)" }}
              aria-hidden
            />
            {PLATFORM_BRAND.stage}
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
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

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border transition-[transform,color,border-color] hover:-translate-y-[1px] hover:border-[var(--plt-forest)] hover:text-[var(--plt-forest)]"
      style={{
        borderColor: "var(--plt-hairline-strong)",
        color: "var(--plt-ink-soft)",
      }}
    >
      {children}
    </a>
  );
}
