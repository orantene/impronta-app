import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";
import { MarketingCta } from "./cta-link";

export function NetworkSection() {
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
            <MarketingEyebrow>The network</MarketingEyebrow>
            <h2
              className="mkt-display mt-5 text-[2rem] font-medium tracking-[-0.02em] sm:text-[2.75rem] md:text-[3rem]"
              style={{ color: "var(--mkt-ink)" }}
            >
              You&rsquo;re not alone on a link.
              <br />
              <span style={{ color: "var(--plt-forest)" }}>You&rsquo;re on a network.</span>
            </h2>
            <p
              className="mt-6 max-w-[30rem] text-[1.0625rem] leading-[1.6]"
              style={{ color: "var(--mkt-ink-soft)" }}
            >
              Every roster site plugs into a shared discovery hub where clients actually
              browse. So independent operators get exposure, agencies get volume, and the
              whole network gets bigger every time someone new joins.
            </p>

            <ul className="mt-8 space-y-4">
              <NetworkBullet
                title="Shared discovery"
                body="Clients search across the network — not just your inbox — so the people you represent get seen even when you&rsquo;re not pitching."
              />
              <NetworkBullet
                title="Agencies as hubs"
                body="Agencies run their own branded site and still benefit from network-wide discovery. One platform, both surfaces."
              />
              <NetworkBullet
                title="Your data stays yours"
                body="Opt in to the hub, opt out any time. Your roster, your branding, your relationships — always portable."
              />
            </ul>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <MarketingCta
                href="/network"
                variant="primary"
                size="md"
                eventSource="home-network"
                eventIntent="network"
              >
                Explore the network
              </MarketingCta>
              <MarketingCta
                href="/how-it-works#network"
                variant="inline"
                size="md"
                eventSource="home-network"
                eventIntent="learn-network"
              >
                How the hub works
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
 * Schematic: central "hub" ring with agency + freelancer + client nodes
 * connected by thin gold lines. Pure SVG.
 */
function NetworkDiagram() {
  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[520px] overflow-hidden rounded-[28px] p-6 sm:p-10"
      style={{
        background: "var(--mkt-surface-raised)",
        border: "1px solid var(--mkt-hairline-strong)",
        boxShadow: "0 32px 72px -32px rgba(15,23,20,0.25)",
      }}
    >
      <svg
        viewBox="0 0 420 420"
        fill="none"
        className="h-full w-full"
        role="img"
        aria-label="Network diagram: central hub connected to agencies, freelancers, and clients."
      >
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2e6b52" />
            <stop offset="100%" stopColor="#0f1714" />
          </linearGradient>
          <radialGradient id="nodeForest" cx="50%" cy="45%" r="50%">
            <stop offset="0%" stopColor="#5c8b76" />
            <stop offset="100%" stopColor="#1f4a3a" />
          </radialGradient>
          <radialGradient id="nodeInk" cx="50%" cy="45%" r="50%">
            <stop offset="0%" stopColor="#2c332f" />
            <stop offset="100%" stopColor="#0f1714" />
          </radialGradient>
        </defs>

        {/* Rings */}
        <circle cx="210" cy="210" r="180" stroke="var(--mkt-hairline)" strokeDasharray="2 6" />
        <circle cx="210" cy="210" r="130" stroke="var(--mkt-hairline)" strokeDasharray="2 6" />
        <circle cx="210" cy="210" r="80" stroke="url(#ringGrad)" strokeWidth="1.25" />

        {/* Connection lines */}
        {LINES.map((l) => (
          <line
            key={`${l.x1}-${l.y1}`}
            x1={l.x1}
            y1={l.y1}
            x2={210}
            y2={210}
            stroke="url(#ringGrad)"
            strokeOpacity="0.35"
            strokeWidth="0.75"
          />
        ))}

        {/* Central hub */}
        <circle cx="210" cy="210" r="54" fill="url(#nodeInk)" />
        <text
          x="210"
          y="204"
          textAnchor="middle"
          fill="var(--plt-on-inverse)"
          fontFamily="var(--font-geist-sans), sans-serif"
          fontSize="15"
          fontWeight="600"
          letterSpacing="-0.5"
        >
          Network
        </text>
        <text
          x="210"
          y="222"
          textAnchor="middle"
          fill="rgba(241,237,227,0.55)"
          fontFamily="var(--font-geist-mono), monospace"
          fontSize="9"
          fontWeight="500"
          letterSpacing="2"
        >
          SHARED HUB
        </text>

        {/* Nodes */}
        {NODES.map((node) => (
          <g key={`${node.label}-${node.x}-${node.y}`}>
            <circle
              cx={node.x}
              cy={node.y}
              r={node.r}
              fill={node.tone === "forest" ? "url(#nodeForest)" : "var(--plt-bg-raised)"}
              stroke={node.tone === "forest" ? "none" : "var(--plt-hairline-strong)"}
              strokeWidth="1"
            />
            <text
              x={node.x}
              y={node.y + 4}
              textAnchor="middle"
              fontFamily="var(--font-geist-sans), sans-serif"
              fontSize="10"
              fontWeight="600"
              fill={node.tone === "forest" ? "var(--plt-on-inverse)" : "var(--plt-ink)"}
            >
              {node.initial}
            </text>
            <text
              x={node.x}
              y={node.y + node.r + 14}
              textAnchor="middle"
              fontFamily="var(--font-geist-sans), sans-serif"
              fontSize="10"
              fontWeight="500"
              fill="var(--plt-muted)"
              letterSpacing="0.05em"
            >
              {node.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

const NODES = [
  { x: 90, y: 90, r: 22, tone: "ink", initial: "A", label: "Agency" },
  { x: 330, y: 95, r: 22, tone: "forest", initial: "F", label: "Freelancer" },
  { x: 360, y: 230, r: 18, tone: "forest", initial: "T", label: "Talent" },
  { x: 320, y: 345, r: 20, tone: "ink", initial: "C", label: "Client" },
  { x: 110, y: 340, r: 18, tone: "ink", initial: "B", label: "Booker" },
  { x: 55, y: 220, r: 20, tone: "forest", initial: "T", label: "Talent" },
] as const;

const LINES = NODES.map((n) => ({ x1: n.x, y1: n.y }));
