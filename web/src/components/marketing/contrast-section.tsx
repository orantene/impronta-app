import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";

const WHATSAPP_PAINS = [
  "Profiles shared one at a time, nothing structured",
  "Rates and availability re-typed, every inquiry",
  "No way to browse — only what you copy-paste",
  "Vanishes into the chat archive by next week",
  "Your brand looks like a contact, not a business",
];

const LINK_WINS = [
  "One professional link with your full roster",
  "Rates, availability, and specs in one place",
  "Clients browse, filter, and compare themselves",
  "Traceable inquiries that become bookings",
  "Editorial presentation that earns premium rates",
];

export function ContrastSection() {
  return (
    <MarketingSection className="relative">
      <MarketingContainer size="wide">
        <div className="mx-auto max-w-2xl text-center">
          <MarketingEyebrow>The shift</MarketingEyebrow>
          <h2
            className="mkt-display mt-5 text-[2rem] font-medium tracking-[-0.02em] sm:text-[2.75rem] md:text-[3rem]"
            style={{ color: "var(--mkt-ink)" }}
          >
            The WhatsApp shuffle is not a workflow.
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1rem] leading-[1.6] sm:text-[1.0625rem]"
            style={{ color: "var(--mkt-muted)" }}
          >
            The work is the same. The presentation is not. Same roster, same clients — one
            feels like sending a screenshot, the other feels like sending a business.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 md:gap-8">
          <ContrastCard tone="before" title="The old way" subtitle="WhatsApp + screenshots">
            <ul className="space-y-3.5">
              {WHATSAPP_PAINS.map((pain) => (
                <li
                  key={pain}
                  className="flex items-start gap-3 text-[0.9375rem] leading-[1.55]"
                  style={{ color: "var(--mkt-ink-soft)" }}
                >
                  <CrossGlyph /> {pain}
                </li>
              ))}
            </ul>
          </ContrastCard>

          <ContrastCard tone="after" title="The new way" subtitle="Your roster link">
            <ul className="space-y-3.5">
              {LINK_WINS.map((win) => (
                <li
                  key={win}
                  className="flex items-start gap-3 text-[0.9375rem] leading-[1.55]"
                  style={{ color: "var(--mkt-ink)" }}
                >
                  <CheckGlyph /> {win}
                </li>
              ))}
            </ul>
          </ContrastCard>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

function ContrastCard({
  tone,
  title,
  subtitle,
  children,
}: {
  tone: "before" | "after";
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const isAfter = tone === "after";
  return (
    <div
      className="relative overflow-hidden rounded-[28px] p-8 sm:p-10"
      style={{
        background: isAfter ? "var(--mkt-surface-raised)" : "var(--mkt-cream-deep)",
        border: `1px solid ${isAfter ? "var(--mkt-hairline-strong)" : "var(--mkt-hairline)"}`,
        boxShadow: isAfter
          ? "0 28px 60px -32px rgba(15,23,20,0.22)"
          : "inset 0 1px 0 rgba(255,255,255,0.4)",
      }}
    >
      {isAfter ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, rgba(46,107,82,0.32), rgba(245,242,234,0))",
          }}
        />
      ) : null}

      <div className="relative flex items-center justify-between">
        <div>
          <span
            className="text-[0.6875rem] font-medium uppercase tracking-[0.28em]"
            style={{ color: isAfter ? "var(--plt-forest)" : "var(--plt-muted-soft)" }}
          >
            {subtitle}
          </span>
          <h3
            className="mkt-display mt-3 text-[1.75rem] font-medium tracking-[-0.02em] sm:text-[2rem]"
            style={{ color: "var(--mkt-ink)" }}
          >
            {title}
          </h3>
        </div>
        {isAfter ? (
          <span
            className="inline-flex h-9 items-center rounded-full px-3.5 text-[0.75rem] font-medium"
            style={{
              background: "var(--mkt-ink)",
              color: "var(--mkt-cream)",
            }}
          >
            {PLATFORM_BRAND.name}
          </span>
        ) : (
          <span
            className="inline-flex h-9 items-center rounded-full border px-3.5 text-[0.75rem] font-medium"
            style={{
              borderColor: "var(--mkt-hairline-strong)",
              color: "var(--mkt-muted)",
              background: "rgba(255,255,255,0.4)",
            }}
          >
            Everyone else
          </span>
        )}
      </div>

      <div className="relative mt-8">{children}</div>
    </div>
  );
}

function CheckGlyph() {
  return (
    <span
      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
      style={{ background: "rgba(31,74,58,0.12)" }}
    >
      <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden>
        <path
          d="M1 4.5L4 7.5L10 1.5"
          stroke="var(--plt-forest)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function CrossGlyph() {
  return (
    <span
      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
      style={{ background: "rgba(15,23,20,0.08)" }}
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
        <path
          d="M1 1L7 7M7 1L1 7"
          stroke="var(--mkt-muted)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
