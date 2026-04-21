import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";

type Tab = {
  id: "site" | "profile" | "inbox";
  label: string;
  eyebrow: string;
  title: string;
  body: string;
};

const TABS: Tab[] = [
  {
    id: "site",
    label: "Roster site",
    eyebrow: "01 · Branded directory",
    title: "Your roster site, ready in minutes.",
    body:
      "A real, editorial-grade directory with your people front-and-centre. Your subdomain on day one, your own domain whenever you want it. No developer, no template feel.",
  },
  {
    id: "profile",
    label: "Profile page",
    eyebrow: "02 · Public profile",
    title: "Every person, presented properly.",
    body:
      "Portfolio, specs, availability, and one clean inquiry button — on one shareable URL. The way representation was always supposed to look online.",
  },
  {
    id: "inbox",
    label: "Inquiry inbox",
    eyebrow: "03 · Inquiry pipeline",
    title: "From inquiry to booking, in one place.",
    body:
      "Structured inquiries, versioned offers, multi-party approvals, traceable bookings. Everything a real business needs that a group chat can't give you.",
  },
];

export function ProductTourSection() {
  return (
    <MarketingSection id="tour" className="overflow-hidden">
      <MarketingContainer size="wide">
        <div className="mx-auto max-w-2xl text-center">
          <MarketingEyebrow>Product tour</MarketingEyebrow>
          <h2
            className="plt-display mt-5 text-[2rem] font-medium tracking-[-0.02em] sm:text-[2.75rem] md:text-[3rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            Three surfaces. One product.
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1rem] leading-[1.6] sm:text-[1.0625rem]"
            style={{ color: "var(--plt-muted)" }}
          >
            A branded directory site, a proper profile page, and a real inquiry inbox — all
            wired together so nothing slips between them.
          </p>
        </div>

        <div className="mt-16 grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16">
          <div className="order-2 flex flex-col gap-4 lg:order-1">
            {TABS.map((tab, i) => (
              <TourStep key={tab.id} tab={tab} index={i} />
            ))}
          </div>
          <div className="relative order-1 lg:order-2">
            <BrowserFrame>
              <MockSite />
            </BrowserFrame>
            <MobileProfileCard />
            <InboxOverlay />
          </div>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

function TourStep({ tab, index }: { tab: Tab; index: number }) {
  return (
    <div
      className="relative rounded-2xl border p-6 transition-colors sm:p-7"
      style={{
        background: "var(--plt-bg-raised)",
        borderColor: "var(--plt-hairline)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-6 h-10 w-[2px] rounded-full"
        style={{ background: index === 0 ? "var(--plt-forest)" : "var(--plt-hairline-strong)" }}
      />
      <span
        className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.24em]"
        style={{ color: "var(--plt-forest)" }}
      >
        {tab.eyebrow}
      </span>
      <h3
        className="plt-display mt-2 text-[1.375rem] font-medium leading-[1.2] tracking-[-0.02em]"
        style={{ color: "var(--plt-ink)" }}
      >
        {tab.title}
      </h3>
      <p
        className="mt-3 text-[0.9375rem] leading-[1.55]"
        style={{ color: "var(--plt-muted)" }}
      >
        {tab.body}
      </p>
    </div>
  );
}

function BrowserFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative overflow-hidden rounded-[20px]"
      style={{
        background: "var(--plt-bg-raised)",
        border: "1px solid var(--plt-hairline-strong)",
        boxShadow: "0 48px 96px -48px rgba(15,23,20,0.3)",
      }}
    >
      <div
        className="flex items-center gap-2 border-b px-4 py-3"
        style={{
          background: "var(--plt-bg-deep)",
          borderColor: "var(--plt-hairline)",
        }}
      >
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: "#E7E2D7" }}
        />
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: "#C9C2B1" }}
        />
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: "#A7A090" }}
        />
        <div
          className="plt-mono ml-3 flex-1 rounded-md px-3 py-1.5 text-[0.75rem]"
          style={{
            background: "var(--plt-bg-raised)",
            color: "var(--plt-muted)",
            border: "1px solid var(--plt-hairline)",
          }}
        >
          nova-roster.{PLATFORM_BRAND.domain}
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function MockSite() {
  return (
    <div className="relative">
      <div
        className="flex items-center justify-between px-6 py-5 sm:px-8 sm:py-7"
        style={{ borderBottom: "1px solid var(--plt-hairline)" }}
      >
        <div>
          <div
            className="plt-display text-[1.25rem] font-medium tracking-[-0.02em]"
            style={{ color: "var(--plt-ink)" }}
          >
            Nova Roster
          </div>
          <div
            className="plt-mono text-[0.6875rem] uppercase tracking-[0.22em]"
            style={{ color: "var(--plt-forest)" }}
          >
            Representation · Mexico City
          </div>
        </div>
        <div className="hidden gap-5 text-[0.75rem] sm:flex" style={{ color: "var(--plt-ink-soft)" }}>
          <span>Roster</span>
          <span>Casting</span>
          <span>About</span>
          <span
            className="relative"
            style={{ color: "var(--plt-forest)" }}
          >
            Inquiry
            <span
              aria-hidden
              className="absolute -bottom-1 left-0 right-0 h-[1.5px] rounded-full"
              style={{ background: "var(--plt-forest)" }}
            />
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[1.3fr_1fr] gap-4 px-6 py-6 sm:px-8 sm:py-8">
        <div>
          <div
            className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.22em]"
            style={{ color: "var(--plt-forest)" }}
          >
            Featured roster
          </div>
          <div
            className="plt-display mt-2 text-[1.5rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[1.75rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            People worth sending.
          </div>
          <div
            className="mt-3 text-[0.75rem] leading-[1.5]"
            style={{ color: "var(--plt-muted)" }}
          >
            A curated roster built for editorial, brand, and campaign work —
            available across CDMX, LATAM, and remote.
          </div>
        </div>
        <div
          className="relative aspect-[3/4] overflow-hidden rounded-xl"
          style={{
            background:
              "linear-gradient(140deg, #0f1714 0%, #1f4a3a 45%, #5c8b76 100%)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 80% at 20% 10%, rgba(241,237,227,0.18), transparent 55%)",
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 px-6 pb-6 sm:px-8 sm:pb-8">
        <RosterTile name="Sofía" tone="a" />
        <RosterTile name="Julián" tone="b" />
        <RosterTile name="Rami" tone="c" />
        <RosterTile name="Ines" tone="d" />
      </div>
    </div>
  );
}

function RosterTile({ name, tone }: { name: string; tone: "a" | "b" | "c" | "d" }) {
  const tones: Record<typeof tone, string> = {
    a: "linear-gradient(160deg, #0f1714, #1f4a3a 55%, #5c8b76)",
    b: "linear-gradient(160deg, #1f4a3a, #2e6b52 55%, #9ec9b2)",
    c: "linear-gradient(180deg, #0a1d16, #1f4a3a 55%, #3d7a60)",
    d: "linear-gradient(200deg, #050d0a, #143226, #2e6b52)",
  };
  return (
    <div>
      <div
        className="aspect-[3/4] rounded-lg"
        style={{ background: tones[tone], border: "1px solid rgba(15,23,20,0.08)" }}
      />
      <div
        className="mt-2 text-[0.75rem] font-medium"
        style={{ color: "var(--plt-ink)" }}
      >
        {name}
      </div>
      <div
        className="plt-mono text-[0.625rem] uppercase tracking-[0.16em]"
        style={{ color: "var(--plt-muted)" }}
      >
        Available
      </div>
    </div>
  );
}

function MobileProfileCard() {
  return (
    <div
      className="pointer-events-none absolute -bottom-10 -left-4 hidden w-[224px] rotate-[-5deg] overflow-hidden rounded-[28px] sm:block"
      style={{
        background: "var(--plt-bg-raised)",
        border: "1px solid var(--plt-hairline-strong)",
        boxShadow: "0 32px 60px -28px rgba(15,23,20,0.45)",
      }}
      aria-hidden
    >
      <div
        className="plt-mono flex items-center justify-between px-4 pt-3 text-[0.625rem]"
        style={{ color: "var(--plt-muted)" }}
      >
        <span>9:41</span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-1 w-1 rounded-full"
            style={{ background: "var(--plt-ink-soft)" }}
          />
          <span
            className="inline-block h-1 w-1 rounded-full"
            style={{ background: "var(--plt-ink-soft)" }}
          />
          <span
            className="inline-block h-1 w-1 rounded-full"
            style={{ background: "var(--plt-ink-soft)" }}
          />
        </span>
      </div>
      <div
        className="relative aspect-[4/5] w-full overflow-hidden"
        style={{
          background:
            "linear-gradient(145deg, #0f1714 0%, #1f4a3a 45%, #5c8b76 95%)",
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 80% at 30% 20%, rgba(241,237,227,0.22), transparent 60%)",
          }}
        />
      </div>
      <div className="px-4 pb-4 pt-3">
        <div
          className="plt-display text-[0.9375rem] font-medium tracking-[-0.02em]"
          style={{ color: "var(--plt-ink)" }}
        >
          Sofía M.
        </div>
        <div
          className="mt-0.5 text-[0.625rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          Editorial · CDMX
        </div>
        <div
          className="mt-3 flex items-center justify-between rounded-full border px-3 py-1.5 text-[0.625rem]"
          style={{
            borderColor: "var(--plt-hairline-strong)",
            background: "var(--plt-bg)",
            color: "var(--plt-ink-soft)",
          }}
        >
          <span className="font-medium">Request</span>
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--plt-forest-bright)" }}
            />
            Available
          </span>
        </div>
      </div>
    </div>
  );
}

function InboxOverlay() {
  return (
    <div
      className="pointer-events-none absolute -right-6 -top-6 hidden w-[264px] rotate-[3deg] rounded-2xl p-4 sm:block"
      style={{
        background: "var(--plt-bg-raised)",
        border: "1px solid var(--plt-hairline-strong)",
        boxShadow: "0 32px 60px -28px rgba(15,23,20,0.45)",
      }}
      aria-hidden
    >
      <div className="flex items-center justify-between">
        <span
          className="plt-mono text-[0.625rem] font-medium uppercase tracking-[0.22em]"
          style={{ color: "var(--plt-forest)" }}
        >
          Inquiry inbox
        </span>
        <span
          className="plt-mono rounded-full px-2 py-0.5 text-[0.625rem] font-medium"
          style={{
            background: "var(--plt-bg)",
            color: "var(--plt-ink-soft)",
            border: "1px solid var(--plt-hairline-strong)",
          }}
        >
          3 new
        </span>
      </div>
      <div className="mt-3 space-y-2">
        <InboxRow name="Cosmo Studio" status="New" tone="new" detail="Editorial · Sofía · Nov 10" />
        <InboxRow name="Vela Films" status="Offer" tone="ink" detail="Brand · Rami · Nov 6" />
        <InboxRow name="Canto Agency" status="Booked" tone="booked" detail="Campaign · Julián" />
      </div>
    </div>
  );
}

function InboxRow({
  name,
  status,
  tone,
  detail,
}: {
  name: string;
  status: string;
  tone: "new" | "ink" | "booked";
  detail: string;
}) {
  const toneStyles: Record<typeof tone, { bg: string; fg: string }> = {
    new: { bg: "rgba(46,107,82,0.14)", fg: "var(--plt-forest)" },
    ink: { bg: "rgba(15,23,20,0.08)", fg: "var(--plt-ink)" },
    booked: { bg: "rgba(52,193,110,0.16)", fg: "#1F7B3E" },
  };
  const s = toneStyles[tone];
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-xl px-3 py-2"
      style={{
        background: "var(--plt-bg)",
        border: "1px solid var(--plt-hairline)",
      }}
    >
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-[0.75rem] font-medium"
          style={{ color: "var(--plt-ink)" }}
        >
          {name}
        </div>
        <div
          className="truncate text-[0.625rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          {detail}
        </div>
      </div>
      <span
        className="plt-mono shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-medium"
        style={{ background: s.bg, color: s.fg }}
      >
        {status}
      </span>
    </div>
  );
}
