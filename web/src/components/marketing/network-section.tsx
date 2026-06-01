import { getRequestLocale } from "@/i18n/request-locale";
import { getMarketingCopy } from "@/lib/marketing/copy";
import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";
import { MarketingCta } from "./cta-link";
import { MARKETING_PHOTOS } from "@/lib/marketing/photography";

export async function NetworkSection() {
  const copy = getMarketingCopy(await getRequestLocale()).network;
  return (
    <MarketingSection
      id="network"
      className="relative overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, var(--plt-bg) 0%, var(--plt-bg-deep) 55%, var(--plt-bg) 100%)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(31,74,58,0.16), transparent 45%), radial-gradient(circle at 80% 60%, rgba(15,23,20,0.08), transparent 45%)",
        }}
      />
      <MarketingContainer size="wide" className="relative">
        <div className="grid items-center gap-12 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:gap-16">
          <div>
            <MarketingEyebrow>{copy.eyebrow}</MarketingEyebrow>
            <h2
              className="mkt-display mt-5 text-[2rem] font-medium tracking-[-0.02em] sm:text-[2.75rem] md:text-[3rem]"
              style={{ color: "var(--mkt-ink)" }}
            >
              {copy.titleLine1}
              <br />
              <span style={{ color: "var(--plt-forest)" }}>{copy.titleLine2}</span>
            </h2>
            <p
              className="mt-6 max-w-[30rem] text-[1.0625rem] leading-[1.6]"
              style={{ color: "var(--mkt-ink-soft)" }}
            >
              {copy.paragraph}
            </p>

            <ul className="mt-8 space-y-4">
              {copy.bullets.map((b) => (
                <NetworkBullet key={b.title} title={b.title} body={b.body} />
              ))}
            </ul>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <MarketingCta
                href="/discover-agencies"
                variant="primary"
                size="md"
                eventSource="home-network"
                eventIntent="discover-agencies"
              >
                {copy.ctaPrimary}
              </MarketingCta>
              <MarketingCta
                href="/how-it-works#network"
                variant="inline"
                size="md"
                eventSource="home-network"
                eventIntent="learn-network"
              >
                {copy.ctaSecondary}
              </MarketingCta>
            </div>
          </div>

          <div>
            <NetworkDiagram />
          </div>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

function NetworkBullet({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex items-start gap-4">
      <span
        className="mt-1.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
        style={{ borderColor: "var(--plt-forest)" }}
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--plt-forest)" }}
        />
      </span>
      <div>
        <p className="text-[1rem] font-medium" style={{ color: "var(--mkt-ink)" }}>
          {title}
        </p>
        <p
          className="mt-1 text-[0.9375rem] leading-[1.55]"
          style={{ color: "var(--mkt-muted)" }}
        >
          {body}
        </p>
      </div>
    </li>
  );
}

/**
 * Homepage preview of the discovery experience. The full interactive filter
 * grid lives at `/discover-agencies`; this stays static so the section remains
 * lightweight and fast.
 */
function NetworkDiagram() {
  return (
    <div
      className="relative mx-auto w-full max-w-[560px] overflow-hidden rounded-[28px] p-4 sm:p-5"
      style={{
        background: "var(--mkt-surface-raised)",
        border: "1px solid var(--mkt-hairline-strong)",
        boxShadow: "0 32px 72px -32px rgba(15,23,20,0.25)",
      }}
    >
      <div
        className="relative h-[180px] overflow-hidden rounded-[22px] sm:h-[220px]"
        style={{ background: "var(--plt-bg-deep)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={MARKETING_PHOTOS.hubDiscovery.url()}
          alt={MARKETING_PHOTOS.hubDiscovery.alt}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgba(15,23,20,0.05) 0%, rgba(15,23,20,0.42) 100%)" }}
        />
        <div className="absolute inset-x-4 bottom-4">
          <span
            className="plt-mono text-[0.625rem] font-medium uppercase"
            style={{ color: "rgba(241,237,227,0.72)" }}
          >
            Agencies & hubs
          </span>
          <p
            className="plt-display mt-1 text-[1.35rem] font-semibold leading-[1.08]"
            style={{ color: "var(--plt-on-inverse)" }}
          >
            Search the network before you apply.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {["Open", "Tulum", "Beauty", "Food", "Live music"].map((tag) => (
          <span
            key={tag}
            className="rounded-full px-3 py-1.5 text-[0.75rem] font-medium"
            style={{
              background: tag === "Open" ? "var(--plt-forest)" : "var(--plt-bg)",
              color: tag === "Open" ? "var(--plt-forest-on)" : "var(--plt-ink-soft)",
              border: tag === "Open" ? "1px solid var(--plt-forest)" : "1px solid var(--plt-hairline)",
            }}
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {NETWORK_PREVIEW_CARDS.map((card) => (
          <article
            key={card.name}
            className="rounded-[20px] p-4"
            style={{
              background: "var(--plt-bg)",
              border: "1px solid var(--plt-hairline)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p
                  className="text-[0.9375rem] font-semibold"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {card.name}
                </p>
                <p
                  className="mt-1 text-[0.75rem]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {card.meta}
                </p>
              </div>
              <span
                className="rounded-full px-2 py-1 text-[0.625rem] font-semibold uppercase"
                style={{
                  background: card.kind === "Hub" ? "rgba(46,107,82,0.14)" : "var(--plt-bg-raised)",
                  color: card.kind === "Hub" ? "var(--plt-forest)" : "var(--plt-ink-soft)",
                }}
              >
                {card.kind}
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

const NETWORK_PREVIEW_CARDS = [
  { name: "Impronta Models", meta: "Tulum · models, creators, hosts", kind: "Agency" },
  { name: "Tulala Service Hub", meta: "Network · chefs, beauty, home", kind: "Hub" },
  { name: "Nova Crew", meta: "Mexico City · events, performers", kind: "Agency" },
  { name: "Private Pro Network", meta: "Remote · specialists, teams", kind: "Hub" },
] as const;
