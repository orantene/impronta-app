import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { MarketingContainer, MarketingEyebrow } from "./container";
import { MarketingCta } from "./cta-link";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-10 sm:pt-16 md:pt-20">
      <HeroBackdrop />
      <MarketingContainer size="wide" className="relative">
        <div className="grid items-center gap-12 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:gap-14 lg:gap-20">
          <div className="relative">
            <MarketingEyebrow className="mkt-rise">
              {PLATFORM_BRAND.tagline}
            </MarketingEyebrow>

            <h1
              className="plt-display mkt-rise mkt-rise-delay-1 mt-5 text-[2.5rem] font-semibold sm:text-[3.25rem] lg:text-[4.25rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              <span className="block">Run your roster</span>
              <span className="block">
                <span style={{ color: "var(--plt-forest)" }}>like a real business.</span>
              </span>
            </h1>

            <p
              className="mkt-rise mkt-rise-delay-2 mt-6 max-w-[34rem] text-[1.0625rem] leading-[1.6] sm:text-[1.125rem]"
              style={{ color: "var(--plt-muted)" }}
            >
              {PLATFORM_BRAND.name} is the operating system for people-based rosters —
              built for independent operators, representation agencies, and organizations
              that coordinate people at scale. Claim a free subdomain, add your roster,
              share one polished link. Stop sending profiles on WhatsApp; start running a
              real directory.
            </p>

            <div className="mkt-rise mkt-rise-delay-3 mt-8 flex flex-wrap items-center gap-3">
              <MarketingCta
                href="/get-started"
                variant="primary"
                size="lg"
                eventSource="home-hero"
                eventIntent="get-started"
              >
                Start free
              </MarketingCta>
              <MarketingCta
                href="/how-it-works"
                variant="secondary"
                size="lg"
                eventSource="home-hero"
                eventIntent="learn"
              >
                See how it works
              </MarketingCta>
            </div>

            <ul
              className="mkt-rise mkt-rise-delay-4 mt-9 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.8125rem]"
              style={{ color: "var(--plt-muted)" }}
            >
              <li className="inline-flex items-center gap-2">
                <TrustTick /> Free plan · your subdomain
              </li>
              <li className="inline-flex items-center gap-2">
                <TrustTick /> No credit card
              </li>
              <li className="inline-flex items-center gap-2">
                <TrustTick /> Upgrade to your own domain any time
              </li>
            </ul>
          </div>

          <div className="relative mkt-rise mkt-rise-delay-3">
            <HeroVisual />
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}

function HeroBackdrop() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute -left-32 top-[-12%] h-[42rem] w-[42rem] rounded-full opacity-[0.5] blur-[120px]"
          style={{
            background:
              "radial-gradient(closest-side, rgba(31,74,58,0.18), rgba(245,242,234,0))",
          }}
        />
        <div
          className="absolute right-[-14%] top-[22%] h-[34rem] w-[34rem] rounded-full opacity-[0.45] blur-[140px]"
          style={{
            background:
              "radial-gradient(closest-side, rgba(46,107,82,0.18), rgba(245,242,234,0))",
          }}
        />
      </div>
      <div aria-hidden className="plt-grain absolute inset-0 -z-10" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px"
        style={{ background: "var(--plt-hairline)" }}
      />
    </>
  );
}

function TrustTick() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="6.25" stroke="var(--plt-forest)" strokeWidth="1.2" />
      <path
        d="M4.5 7.25L6.2 9L9.5 5.5"
        stroke="var(--plt-forest)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Atelier hero visual — a polished roster profile card (Rostra platform
 * surface) layered above a faded "old way" (WhatsApp-style chat). Shows what
 * the platform outputs without leaning on any single tenant's aesthetic.
 */
function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[540px]">
      {/* "Old way" chat card — quietly in the background */}
      <div
        className="relative ml-auto hidden w-[70%] rotate-[-4deg] rounded-[22px] p-5 shadow-[var(--plt-shadow-md)] sm:block"
        style={{
          background: "var(--plt-bg-deep)",
          border: "1px solid var(--plt-hairline-strong)",
        }}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "var(--plt-muted-soft)" }}
            />
            <span
              className="plt-mono text-[0.625rem] font-medium uppercase tracking-[0.22em]"
              style={{ color: "var(--plt-muted)" }}
            >
              The old way
            </span>
          </span>
          <span
            className="plt-mono text-[0.625rem] uppercase tracking-[0.18em]"
            style={{ color: "var(--plt-muted-soft)" }}
          >
            whatsapp · 11:42
          </span>
        </div>
        <ChatBubble align="left" text="hey send me the models again pls" />
        <ChatBubble align="right" text="ok 1 sec" />
        <ChatBubble align="right" text="IMG_2841.jpg" image />
        <ChatBubble align="right" text="IMG_2842.jpg" image />
        <ChatBubble align="left" text="rates + availability again?" />
      </div>

      {/* Platform link card — hero canvas */}
      <div
        className="relative w-full rounded-[28px] p-6 sm:-mt-10 sm:w-[94%] sm:rotate-[1.5deg]"
        style={{
          background: "var(--plt-bg-elevated)",
          border: "1px solid var(--plt-hairline)",
          boxShadow: "var(--plt-shadow-lg)",
        }}
      >
        <div className="mb-4 flex items-center justify-between gap-3 text-[0.6875rem]">
          <span
            className="plt-mono inline-flex items-center gap-2 truncate"
            style={{ color: "var(--plt-muted)" }}
          >
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: "var(--plt-forest-bright)" }}
            />
            <span className="truncate">{PLATFORM_BRAND.domain}/sofia-m</span>
          </span>
          <span
            className="plt-mono shrink-0 rounded-full border px-2 py-0.5 uppercase tracking-[0.18em]"
            style={{
              borderColor: "var(--plt-hairline-strong)",
              color: "var(--plt-muted)",
            }}
          >
            Shared
          </span>
        </div>

        <div className="flex items-start gap-4">
          <div
            className="h-20 w-20 shrink-0 rounded-2xl"
            style={{
              background:
                "linear-gradient(135deg, #1a2720 0%, #2f4c3d 55%, #5a8673 100%)",
            }}
          />
          <div className="flex-1 min-w-0">
            <div
              className="plt-display text-[1.375rem] font-semibold tracking-[-0.025em]"
              style={{ color: "var(--plt-ink)" }}
            >
              Sofía M.
            </div>
            <div
              className="mt-1 text-[0.8125rem] leading-snug"
              style={{ color: "var(--plt-muted)" }}
            >
              Editorial model · Mexico City · SAG-AFTRA
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip>Editorial</Chip>
              <Chip>Runway</Chip>
              <Chip>Brand campaign</Chip>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <PortfolioTile tone="a" />
          <PortfolioTile tone="b" />
          <PortfolioTile tone="c" />
        </div>

        <div
          className="mt-5 flex items-center justify-between rounded-2xl border px-4 py-3.5 text-[0.8125rem]"
          style={{
            borderColor: "var(--plt-hairline)",
            background: "var(--plt-bg)",
            color: "var(--plt-ink-soft)",
          }}
        >
          <span className="font-medium">Request Sofía</span>
          <span className="inline-flex items-center gap-1.5 text-[0.75rem]">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--plt-forest-bright)" }}
            />
            Available · Nov 2–14
          </span>
        </div>
      </div>

      {/* Floating badge */}
      <div
        className="mkt-drift absolute -right-2 top-[58%] hidden rotate-[6deg] rounded-full px-3.5 py-2 text-[0.75rem] font-medium shadow-[0_12px_28px_-14px_rgba(15,23,20,0.55)] sm:inline-flex"
        style={{
          background: "var(--plt-ink)",
          color: "var(--plt-on-inverse)",
        }}
      >
        Same roster. 10× better.
      </div>
    </div>
  );
}

function ChatBubble({
  align,
  text,
  image = false,
}: {
  align: "left" | "right";
  text: string;
  image?: boolean;
}) {
  return (
    <div className={`my-1.5 flex ${align === "right" ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] rounded-2xl px-3 py-2 text-[0.8125rem] leading-[1.35]"
        style={{
          background: align === "right" ? "#DAD6CB" : "var(--plt-bg-raised)",
          color: "var(--plt-ink)",
          border:
            align === "right"
              ? "1px solid rgba(15,23,20,0.08)"
              : "1px solid rgba(15,23,20,0.06)",
          borderTopRightRadius: align === "right" ? "0.5rem" : "1rem",
          borderTopLeftRadius: align === "right" ? "1rem" : "0.5rem",
        }}
      >
        {image ? (
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-4 w-4 rounded"
              style={{
                background: "linear-gradient(135deg, #7a827d, #c2c8c1)",
              }}
            />
            <span className="plt-mono text-[0.75rem]" style={{ color: "var(--plt-muted)" }}>
              {text}
            </span>
          </span>
        ) : (
          text
        )}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium"
      style={{
        borderColor: "var(--plt-hairline-strong)",
        background: "var(--plt-bg)",
        color: "var(--plt-ink-soft)",
      }}
    >
      {children}
    </span>
  );
}

function PortfolioTile({ tone }: { tone: "a" | "b" | "c" }) {
  const TONES: Record<typeof tone, string> = {
    a: "linear-gradient(135deg, #1c2924 0%, #2f4c3d 60%, #6a9580 100%)",
    b: "linear-gradient(160deg, #304540 0%, #52776a 55%, #9fbcaf 100%)",
    c: "linear-gradient(180deg, #1a2721 0%, #3a564b 60%, #7d9c8d 100%)",
  };
  return (
    <div
      className="aspect-[3/4] rounded-xl"
      style={{
        background: TONES[tone],
        border: "1px solid rgba(15,23,20,0.06)",
      }}
    />
  );
}
