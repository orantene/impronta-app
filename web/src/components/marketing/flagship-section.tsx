import { getRequestLocale } from "@/i18n/request-locale";
import { getMarketingCopy } from "@/lib/marketing/copy";
import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";
import { MarketingCta } from "./cta-link";
import { OpenTalentModalButton } from "./open-talent-modal-button";

/**
 * Flagship section — the two innovations the platform leads with:
 *   #builder   → one-click page builder (services site + business workspace)
 *   #messenger → booking messenger (inquiry → offer → booking → payment in chat)
 * Big alternating feature rows with schematic, on-brand product mocks, then a
 * supporting triptych. This is the "no one else has built this" moment.
 */
export async function FlagshipSection() {
  const copy = getMarketingCopy(await getRequestLocale()).flagship;
  return (
    <MarketingSection className="overflow-hidden">
      <MarketingContainer size="wide">
        <div className="mx-auto max-w-2xl text-center">
          <MarketingEyebrow>{copy.eyebrow}</MarketingEyebrow>
          <h2
            className="plt-display mt-5 text-[2rem] font-semibold tracking-[-0.02em] sm:text-[2.75rem] md:text-[3rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            {copy.title}
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1rem] leading-[1.6] sm:text-[1.0625rem]"
            style={{ color: "var(--plt-muted)" }}
          >
            {copy.subtitle}
          </p>
        </div>

        {/* Row 1 — page builder */}
        <div
          id="builder"
          className="mt-16 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16"
          style={{ scrollMarginTop: "6rem" }}
        >
          <FeatureCopy
            eyebrow={copy.builder.eyebrow}
            title={copy.builder.title}
            body={copy.builder.body}
            bullets={copy.builder.bullets}
            cta={<OpenTalentModalButton
              eventSource="home-flagship-builder"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-[0.875rem] font-medium leading-none transition-[transform,box-shadow] hover:-translate-y-[1px]"
              style={{ background: "var(--plt-forest)", color: "var(--plt-forest-on)", boxShadow: "var(--plt-shadow-forest)" }}
            >
              {copy.builder.cta}
            </OpenTalentModalButton>}
          />
          <BuilderVisual mock={copy.builderMock} />
        </div>

        {/* Row 2 — booking messenger */}
        <div
          id="messenger"
          className="mt-20 grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16 md:mt-24"
          style={{ scrollMarginTop: "6rem" }}
        >
          <div className="order-2 lg:order-1">
            <MessengerVisual />
          </div>
          <div className="order-1 lg:order-2">
            <FeatureCopy
              eyebrow={copy.messenger.eyebrow}
              title={copy.messenger.title}
              body={copy.messenger.body}
              bullets={copy.messenger.bullets}
              cta={<MarketingCta href="/how-it-works" variant="secondary" size="md" eventSource="home-flagship-messenger" eventIntent="how-it-works">
                {copy.messenger.cta}
              </MarketingCta>}
            />
          </div>
        </div>

        {/* Supporting triptych */}
        <div className="mt-20 grid gap-4 sm:grid-cols-3 md:mt-24">
          <SupportCard title={copy.support[0].title} body={copy.support[0].body} icon={<CalendarIcon />} />
          <SupportCard title={copy.support[1].title} body={copy.support[1].body} icon={<NetworkIcon />} />
          <SupportCard title={copy.support[2].title} body={copy.support[2].body} icon={<SwitchIcon />} />
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

function FeatureCopy({
  eyebrow,
  title,
  body,
  bullets,
  cta,
}: {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  cta: React.ReactNode;
}) {
  return (
    <div>
      <span
        className="plt-mono text-[0.6875rem] font-semibold uppercase tracking-[0.22em]"
        style={{ color: "var(--plt-forest)" }}
      >
        {eyebrow}
      </span>
      <h3
        className="plt-display mt-3 text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[2.25rem]"
        style={{ color: "var(--plt-ink)" }}
      >
        {title}
      </h3>
      <p className="mt-4 max-w-xl text-[1rem] leading-[1.6]" style={{ color: "var(--plt-muted)" }}>
        {body}
      </p>
      <ul className="mt-6 space-y-2.5">
        {bullets.map((b) => (
          <li
            key={b}
            className="flex items-start gap-2.5 text-[0.9375rem] leading-[1.55]"
            style={{ color: "var(--plt-ink-soft)" }}
          >
            <CheckGlyph />
            {b}
          </li>
        ))}
      </ul>
      <div className="mt-8">{cta}</div>
    </div>
  );
}

function SupportCard({ title, body, icon }: { title: string; body: string; icon: React.ReactNode }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[22px] p-6"
      style={{
        background: "var(--plt-bg-elevated)",
        border: "1px solid var(--plt-hairline)",
        boxShadow: "0 20px 48px -32px rgba(15,23,20,0.18)",
      }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ background: "var(--plt-bg-raised)", border: "1px solid var(--plt-hairline)", color: "var(--plt-forest)" }}
      >
        {icon}
      </div>
      <h4 className="plt-display text-[1.125rem] font-semibold tracking-[-0.01em]" style={{ color: "var(--plt-ink)" }}>
        {title}
      </h4>
      <p className="text-[0.875rem] leading-[1.55]" style={{ color: "var(--plt-muted)" }}>
        {body}
      </p>
    </div>
  );
}

/* ───────────────────────── Mock visuals ───────────────────────── */

function BuilderVisual({
  mock,
}: {
  mock: { prompt: string; services: string; workspace: string };
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[24px] p-5 sm:p-7"
      style={{
        background: "linear-gradient(165deg, var(--plt-bg-raised) 0%, var(--plt-bg-deep) 100%)",
        border: "1px solid var(--plt-hairline-strong)",
        boxShadow: "0 40px 80px -44px rgba(15,23,20,0.4)",
      }}
    >
      {/* Prompt bar */}
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3"
        style={{ background: "var(--plt-bg-elevated)", border: "1px solid var(--plt-hairline-strong)" }}
      >
        <SparkleIcon />
        <span className="text-[0.875rem]" style={{ color: "var(--plt-ink-soft)" }}>
          &ldquo;{mock.prompt}&rdquo;
        </span>
        <span
          className="plt-mono ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.6875rem] font-semibold"
          style={{ background: "var(--plt-forest)", color: "var(--plt-forest-on)" }}
        >
          Generate
        </span>
      </div>

      <div className="plt-mono mt-3 flex items-center justify-center gap-1.5 text-[0.625rem] uppercase tracking-[0.2em]" style={{ color: "var(--plt-muted)" }}>
        <span>1 click</span>
        <DownGlyph />
      </div>

      {/* Two generated outputs */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <OutputCard label={mock.services} tag="Public">
          <div className="space-y-1.5">
            <div className="h-2 w-3/4 rounded-full" style={{ background: "var(--plt-hairline-strong)" }} />
            <div className="aspect-[5/3] rounded-md" style={{ background: "var(--plt-forest)", opacity: 0.18 }} />
            <div className="h-1.5 w-full rounded-full" style={{ background: "var(--plt-hairline)" }} />
            <div className="h-1.5 w-2/3 rounded-full" style={{ background: "var(--plt-hairline)" }} />
          </div>
        </OutputCard>
        <OutputCard label={mock.workspace} tag="Private">
          <div className="space-y-1.5">
            <div className="flex gap-1">
              <div className="h-6 w-1/3 rounded-md" style={{ background: "var(--plt-hairline)" }} />
              <div className="h-6 flex-1 rounded-md" style={{ background: "var(--plt-forest)", opacity: 0.16 }} />
            </div>
            <div className="h-1.5 w-full rounded-full" style={{ background: "var(--plt-hairline)" }} />
            <div className="h-1.5 w-5/6 rounded-full" style={{ background: "var(--plt-hairline)" }} />
            <div className="h-1.5 w-3/4 rounded-full" style={{ background: "var(--plt-hairline)" }} />
          </div>
        </OutputCard>
      </div>
    </div>
  );
}

function OutputCard({ label, tag, children }: { label: string; tag: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-3.5"
      style={{ background: "var(--plt-bg-elevated)", border: "1px solid var(--plt-hairline-strong)" }}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[0.75rem] font-medium" style={{ color: "var(--plt-ink)" }}>
          <CheckDot /> {label}
        </span>
        <span className="plt-mono text-[0.5625rem] uppercase tracking-[0.16em]" style={{ color: "var(--plt-muted)" }}>
          {tag}
        </span>
      </div>
      {children}
    </div>
  );
}

function MessengerVisual() {
  return (
    <div
      className="relative overflow-hidden rounded-[24px] p-5 sm:p-6"
      style={{
        background: "var(--plt-bg-raised)",
        border: "1px solid var(--plt-hairline-strong)",
        boxShadow: "0 40px 80px -44px rgba(15,23,20,0.4)",
      }}
    >
      {/* Thread header */}
      <div className="flex items-center justify-between pb-3" style={{ borderBottom: "1px solid var(--plt-hairline)" }}>
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[0.75rem] font-semibold" style={{ background: "var(--plt-forest)", color: "var(--plt-forest-on)" }}>
            C
          </span>
          <div>
            <div className="text-[0.8125rem] font-medium" style={{ color: "var(--plt-ink)" }}>Cosmo Studio</div>
            <div className="plt-mono text-[0.625rem] uppercase tracking-[0.14em]" style={{ color: "var(--plt-forest)" }}>Wedding · June 14</div>
          </div>
        </div>
        <StatusChip label="Booked" />
      </div>

      {/* Messages */}
      <div className="mt-4 space-y-3">
        <Bubble side="in">Hi! Are you free June 14 for a wedding in Tulum?</Bubble>

        {/* Offer card */}
        <div className="ml-auto w-[86%]">
          <div
            className="rounded-2xl rounded-br-md p-3.5"
            style={{ background: "var(--plt-bg-elevated)", border: "1px solid var(--plt-hairline-strong)" }}
          >
            <div className="flex items-center justify-between">
              <span className="plt-mono text-[0.625rem] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--plt-forest)" }}>
                Offer · v2
              </span>
              <span className="text-[0.6875rem]" style={{ color: "var(--plt-muted)" }}>Wedding package</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="plt-display text-[1.25rem] font-semibold" style={{ color: "var(--plt-ink)" }}>$2,400</span>
              <span className="text-[0.75rem]" style={{ color: "var(--plt-muted)" }}>Deposit $600</span>
            </div>
            <div className="mt-3 flex gap-2">
              <span className="flex-1 rounded-full py-2 text-center text-[0.75rem] font-medium" style={{ background: "var(--plt-forest)", color: "var(--plt-forest-on)" }}>
                Pay deposit
              </span>
              <span className="rounded-full px-3 py-2 text-center text-[0.75rem] font-medium" style={{ background: "var(--plt-bg-raised)", color: "var(--plt-ink-soft)", border: "1px solid var(--plt-hairline-strong)" }}>
                Approve
              </span>
            </div>
          </div>
        </div>

        <Bubble side="in">Done, deposit sent. See you in June! 🎉</Bubble>
      </div>

      {/* Pipeline status track */}
      <div className="mt-5 flex items-center gap-1.5 rounded-full px-3 py-2.5" style={{ background: "var(--plt-bg-elevated)", border: "1px solid var(--plt-hairline)" }}>
        <Track label="Inquiry" done />
        <TrackLine />
        <Track label="Offer" done />
        <TrackLine />
        <Track label="Deposit" done />
        <TrackLine />
        <Track label="Booked" current />
      </div>
    </div>
  );
}

function Bubble({ side, children }: { side: "in" | "out"; children: React.ReactNode }) {
  const isIn = side === "in";
  return (
    <div className={isIn ? "mr-auto w-[80%]" : "ml-auto w-[80%]"}>
      <div
        className={`rounded-2xl px-3.5 py-2.5 text-[0.8125rem] leading-[1.45] ${isIn ? "rounded-bl-md" : "rounded-br-md"}`}
        style={{
          background: isIn ? "var(--plt-bg-elevated)" : "var(--plt-forest)",
          color: isIn ? "var(--plt-ink-soft)" : "var(--plt-forest-on)",
          border: isIn ? "1px solid var(--plt-hairline)" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function StatusChip({ label }: { label: string }) {
  return (
    <span
      className="plt-mono inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.12em]"
      style={{ background: "rgba(52,193,110,0.16)", color: "#1F7B3E" }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#1F7B3E" }} />
      {label}
    </span>
  );
}

function Track({ label, done, current }: { label: string; done?: boolean; current?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full"
        style={{
          background: current ? "var(--plt-forest)" : done ? "rgba(46,107,82,0.16)" : "var(--plt-hairline)",
        }}
      >
        {done && !current ? (
          <svg width="7" height="6" viewBox="0 0 11 9" fill="none" aria-hidden>
            <path d="M1 4.5L4 7.5L10 1.5" stroke="var(--plt-forest)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : current ? (
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--plt-forest-on)" }} />
        ) : null}
      </span>
      <span
        className="text-[0.6875rem] font-medium"
        style={{ color: current ? "var(--plt-forest)" : "var(--plt-muted)" }}
      >
        {label}
      </span>
    </span>
  );
}

function TrackLine() {
  return <span className="h-px flex-1" style={{ background: "var(--plt-hairline-strong)" }} aria-hidden />;
}

/* ───────────────────────── Glyphs ───────────────────────── */

function CheckGlyph() {
  return (
    <span
      className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
      style={{ background: "rgba(31,74,58,0.12)" }}
      aria-hidden
    >
      <svg width="9" height="7" viewBox="0 0 11 9" fill="none">
        <path d="M1 4.5L4 7.5L10 1.5" stroke="var(--plt-forest)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function CheckDot() {
  return (
    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full" style={{ background: "var(--plt-forest)" }} aria-hidden>
      <svg width="7" height="6" viewBox="0 0 11 9" fill="none">
        <path d="M1 4.5L4 7.5L10 1.5" stroke="var(--plt-forest-on)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "var(--plt-forest)" }}>
      <path d="M12 3L13.6 8.4L19 10L13.6 11.6L12 17L10.4 11.6L5 10L10.4 8.4L12 3Z" fill="currentColor" />
      <path d="M18 15L18.7 17.3L21 18L18.7 18.7L18 21L17.3 18.7L15 18L17.3 17.3L18 15Z" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

function DownGlyph() {
  return (
    <svg width="9" height="6" viewBox="0 0 10 7" fill="none" aria-hidden>
      <path d="M1 1.5L5 5.5L9 1.5" stroke="var(--plt-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="5" width="16" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 9H20M8 3V6M16 3V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="13" r="1" fill="currentColor" />
      <circle cx="13" cy="13" r="1" fill="currentColor" />
    </svg>
  );
}

function NetworkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="19" cy="5" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="19" cy="19" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 7L10 10M17 7L14 10M17 17L14 14" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

function SwitchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 8H17M17 8L13.5 4.5M17 8L13.5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16H7M7 16L10.5 12.5M7 16L10.5 19.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
