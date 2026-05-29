import Link from "next/link";
import { MARKETING_PHOTOS, type MarketingPhotoKey } from "@/lib/marketing/photography";
import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";

type DiscoveryCard = {
  id: string;
  kind: "Agency" | "Hub";
  name: string;
  city: string;
  region: string;
  categories: string[];
  joinMode: "Open now" | "Approval" | "Curated";
  plan: string;
  description: string;
  stats: { label: string; value: string }[];
  photoKey: MarketingPhotoKey;
  href: string;
};

const TALENT_REGISTER_HREF = "/talent/register?next=/talent/profile/fields";
const KIND_OPTIONS = ["All", "Agency", "Hub"] as const;
const CATEGORIES = [
  "All",
  "Models",
  "Beauty",
  "Food",
  "Home",
  "Music",
  "Events",
  "Professional",
] as const;

const LOCATIONS = ["All locations", "Tulum", "Mexico City", "Remote", "Miami", "Madrid"] as const;
const JOIN_OPTIONS = ["All", "Open now", "Approval", "Curated"] as const;

export type DiscoverySearchParams = {
  q?: string;
  kind?: string;
  category?: string;
  location?: string;
  join?: string;
};

export type DiscoveryFilters = {
  query: string;
  kind: (typeof KIND_OPTIONS)[number];
  category: (typeof CATEGORIES)[number];
  location: (typeof LOCATIONS)[number];
  join: (typeof JOIN_OPTIONS)[number];
};

const DISCOVERY_CARDS: DiscoveryCard[] = [
  {
    id: "impronta-models",
    kind: "Agency",
    name: "Impronta Models",
    city: "Tulum",
    region: "Riviera Maya",
    categories: ["Models", "Events", "Beauty"],
    joinMode: "Approval",
    plan: "Agency workspace",
    description:
      "Fashion, resort, lifestyle, and creator talent for brands, hospitality, and productions across Tulum and Cancun.",
    stats: [
      { label: "Roster", value: "33" },
      { label: "Focus", value: "Image" },
    ],
    photoKey: "heroServices",
    href: "https://improntamodels.com",
  },
  {
    id: "tulala-service-hub",
    kind: "Hub",
    name: "Tulala Service Hub",
    city: "Remote",
    region: "Network-wide",
    categories: ["Home", "Food", "Beauty", "Professional"],
    joinMode: "Open now",
    plan: "Hub",
    description:
      "A broad service network for cleaners, chefs, beauty pros, assistants, creatives, and specialist businesses ready to receive requests.",
    stats: [
      { label: "Apply", value: "Open" },
      { label: "Reach", value: "Global" },
    ],
    photoKey: "servicePros",
    href: "/network",
  },
  {
    id: "nova-crew",
    kind: "Agency",
    name: "Nova Crew",
    city: "Mexico City",
    region: "CDMX",
    categories: ["Events", "Music", "Models"],
    joinMode: "Open now",
    plan: "Studio workspace",
    description:
      "Event staff, performers, hosts, musicians, and production-ready talent for launches, shoots, and private experiences.",
    stats: [
      { label: "Response", value: "Fast" },
      { label: "Work", value: "Events" },
    ],
    photoKey: "talentBooking",
    href: "/agencies",
  },
  {
    id: "atelier-care",
    kind: "Agency",
    name: "Atelier Care",
    city: "Miami",
    region: "South Florida",
    categories: ["Home", "Professional"],
    joinMode: "Approval",
    plan: "Agency workspace",
    description:
      "Premium cleaning, home care, estate staffing, and concierge service professionals with polished client intake.",
    stats: [
      { label: "Clients", value: "Homes" },
      { label: "Mode", value: "Managed" },
    ],
    photoKey: "agencyBuilder",
    href: "/organizations",
  },
  {
    id: "table-studio",
    kind: "Agency",
    name: "Table Studio",
    city: "Madrid",
    region: "Spain",
    categories: ["Food", "Events", "Professional"],
    joinMode: "Curated",
    plan: "Max workspace",
    description:
      "Private chefs, caterers, food stylists, and event producers presented through a premium inquiry-first website.",
    stats: [
      { label: "Offer", value: "Food" },
      { label: "Tier", value: "Max" },
    ],
    photoKey: "heroServices",
    href: "/agencies",
  },
  {
    id: "creator-hub",
    kind: "Hub",
    name: "Creator & Voice Hub",
    city: "Remote",
    region: "Digital",
    categories: ["Music", "Beauty", "Models"],
    joinMode: "Open now",
    plan: "Hub",
    description:
      "A discovery layer for singers, presenters, creators, makeup artists, and on-camera service talent looking for paid requests.",
    stats: [
      { label: "Join", value: "Free" },
      { label: "Fit", value: "Talent" },
    ],
    photoKey: "hubDiscovery",
    href: "/network",
  },
];

export function normalizeDiscoveryFilters(
  raw: DiscoverySearchParams,
): DiscoveryFilters {
  return {
    query: (raw.q ?? "").trim().slice(0, 80),
    kind: coerceOption(raw.kind, KIND_OPTIONS, "All"),
    category: coerceOption(raw.category, CATEGORIES, "All"),
    location: coerceOption(raw.location, LOCATIONS, "All locations"),
    join: coerceOption(raw.join, JOIN_OPTIONS, "All"),
  };
}

export function AgencyHubDiscovery({
  appDiscoverHref,
  filters,
}: {
  appDiscoverHref: string;
  filters: DiscoveryFilters;
}) {
  const { query, kind, category, location, join } = filters;
  const q = query.toLowerCase();
  const filtered = DISCOVERY_CARDS.filter((card) => {
    const haystack = [
      card.name,
      card.city,
      card.region,
      card.description,
      card.kind,
      card.joinMode,
      ...card.categories,
    ]
      .join(" ")
      .toLowerCase();
    return (
      (!q || haystack.includes(q)) &&
      (kind === "All" || card.kind === kind) &&
      (category === "All" || card.categories.includes(category)) &&
      (location === "All locations" || card.city === location) &&
      (join === "All" || card.joinMode === join)
    );
  });

  return (
    <>
      <MarketingSection spacing="tight" className="overflow-hidden pt-16 sm:pt-20">
        <MarketingContainer size="wide">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-14">
            <div>
              <MarketingEyebrow>Agencies & hubs</MarketingEyebrow>
              <h1
                className="plt-display mt-6 max-w-[42rem] text-[2.65rem] font-semibold leading-[1] sm:text-[3.7rem]"
                style={{ color: "var(--plt-ink)" }}
              >
                Find where your talent can grow next.
              </h1>
              <p
                className="mt-6 max-w-[37rem] text-[1.0625rem] leading-[1.6]"
                style={{ color: "var(--plt-muted)" }}
              >
                Browse agencies and hubs by category, city, and application mode.
                Create a free Tulala talent page, then apply from the talent dashboard
                when you find a fit.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a
                  href={TALENT_REGISTER_HREF}
                  className="inline-flex min-h-12 items-center justify-center rounded-full px-6 text-[0.9375rem] font-medium leading-none transition-[background,transform,box-shadow] duration-200 hover:-translate-y-[1px]"
                  style={{
                    background: "var(--plt-forest)",
                    color: "var(--plt-forest-on)",
                    boxShadow: "var(--plt-shadow-forest)",
                  }}
                >
                  Create free talent page
                </a>
                <a
                  href={appDiscoverHref}
                  className="inline-flex min-h-12 items-center justify-center rounded-full border px-6 text-[0.9375rem] font-medium leading-none transition-colors hover:border-[var(--plt-forest)] hover:text-[var(--plt-forest)]"
                  style={{
                    borderColor: "var(--plt-hairline-strong)",
                    color: "var(--plt-ink)",
                    background: "var(--plt-bg-elevated)",
                  }}
                >
                  Apply in dashboard
                </a>
              </div>
            </div>

            <div
              className="relative min-h-[24rem] overflow-hidden rounded-[28px]"
              style={{
                background: "var(--plt-bg-deep)",
                border: "1px solid var(--plt-hairline-strong)",
                boxShadow: "0 42px 90px -50px rgba(15,23,20,0.42)",
              }}
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
                style={{ background: "linear-gradient(180deg, rgba(15,23,20,0.02) 20%, rgba(15,23,20,0.48) 100%)" }}
              />
              <div className="absolute inset-x-5 bottom-5 sm:inset-x-7 sm:bottom-7">
                <span
                  className="plt-mono text-[0.6875rem] font-medium uppercase"
                  style={{ color: "rgba(241,237,227,0.72)" }}
                >
                  Opportunity feed
                </span>
                <p
                  className="plt-display mt-2 max-w-[28rem] text-[1.7rem] font-semibold leading-[1.08] sm:text-[2.2rem]"
                  style={{ color: "var(--plt-on-inverse)" }}
                >
                  Search the network like a marketplace, then apply from one account.
                </p>
              </div>
            </div>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection
        className="relative"
        style={{ background: "var(--plt-bg-raised)" }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "var(--plt-hairline)" }}
        />
        <MarketingContainer size="wide">
          <form
            action="/discover-agencies"
            method="get"
            className="rounded-[28px] p-4 sm:p-5"
            style={{
              background: "var(--plt-bg)",
              border: "1px solid var(--plt-hairline)",
              boxShadow: "0 28px 60px -44px rgba(15,23,20,0.24)",
            }}
          >
            <div className="grid gap-3 lg:grid-cols-[minmax(13rem,1.2fr)_repeat(4,minmax(0,1fr))_minmax(7rem,0.7fr)]">
              <FilterInput value={query} />
              <FilterSelect
                label="Type"
                name="kind"
                value={kind}
                values={KIND_OPTIONS}
              />
              <FilterSelect
                label="Category"
                name="category"
                value={category}
                values={CATEGORIES}
              />
              <FilterSelect
                label="Location"
                name="location"
                value={location}
                values={LOCATIONS}
              />
              <FilterSelect
                label="Apply"
                name="join"
                value={join}
                values={JOIN_OPTIONS}
              />
              <button
                type="submit"
                className="inline-flex min-h-14 items-center justify-center rounded-[18px] px-5 text-[0.875rem] font-semibold transition-transform hover:-translate-y-[1px]"
                style={{
                  background: "var(--plt-forest)",
                  color: "var(--plt-forest-on)",
                  boxShadow: "var(--plt-shadow-forest)",
                }}
              >
                Search
              </button>
            </div>
          </form>

          <div className="mt-8 flex items-center justify-between gap-4">
            <div>
              <MarketingEyebrow>Search results</MarketingEyebrow>
              <p
                className="mt-2 text-[0.9375rem]"
                style={{ color: "var(--plt-muted)" }}
              >
                {filtered.length} {filtered.length === 1 ? "match" : "matches"} ready to explore
              </p>
            </div>
            <Link
              href="/discover-agencies"
              className="rounded-full border px-4 py-2 text-[0.8125rem] font-medium transition-colors hover:border-[var(--plt-forest)] hover:text-[var(--plt-forest)]"
              style={{
                borderColor: "var(--plt-hairline-strong)",
                color: "var(--plt-ink-soft)",
                background: "var(--plt-bg)",
              }}
            >
              Reset filters
            </Link>
          </div>

          {filtered.length > 0 ? (
            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((card) => (
                <DiscoveryResultCard
                  key={card.id}
                  card={card}
                  appDiscoverHref={appDiscoverHref}
                />
              ))}
            </div>
          ) : (
            <div
              className="mt-8 rounded-[28px] px-6 py-14 text-center"
              style={{
                background: "var(--plt-bg)",
                border: "1px solid var(--plt-hairline)",
              }}
            >
              <h2
                className="plt-display text-[1.6rem] font-semibold"
                style={{ color: "var(--plt-ink)" }}
              >
                No matches for that filter.
              </h2>
              <p className="mx-auto mt-3 max-w-md text-[0.9375rem]" style={{ color: "var(--plt-muted)" }}>
                Try a broader category or open the talent dashboard to see live agencies and hubs available to your profile.
              </p>
            </div>
          )}
        </MarketingContainer>
      </MarketingSection>
    </>
  );
}

function coerceOption<T extends readonly string[]>(
  value: string | undefined,
  options: T,
  fallback: T[number],
): T[number] {
  const candidate = value ?? "";
  return (options as readonly string[]).includes(candidate)
    ? (candidate as T[number])
    : fallback;
}

function FilterInput({
  value,
}: {
  value: string;
}) {
  return (
    <label
      className="flex min-h-14 flex-col justify-center rounded-[18px] border px-4 py-2"
      style={{
        borderColor: "var(--plt-hairline)",
        background: "var(--plt-bg-elevated)",
      }}
    >
      <span className="plt-mono text-[0.625rem] font-medium uppercase" style={{ color: "var(--plt-muted)" }}>
        Search
      </span>
      <input
        name="q"
        defaultValue={value}
        placeholder="chef, singer, Tulum..."
        className="mt-1 w-full bg-transparent text-[0.9375rem] font-medium outline-none placeholder:text-[var(--plt-muted-soft)]"
        style={{ color: "var(--plt-ink)" }}
      />
    </label>
  );
}

function FilterSelect({
  label,
  name,
  value,
  values,
}: {
  label: string;
  name: string;
  value: string;
  values: readonly string[];
}) {
  return (
    <label
      className="flex min-h-14 flex-col justify-center rounded-[18px] border px-4 py-2"
      style={{
        borderColor: "var(--plt-hairline)",
        background: "var(--plt-bg-elevated)",
      }}
    >
      <span className="plt-mono text-[0.625rem] font-medium uppercase" style={{ color: "var(--plt-muted)" }}>
        {label}
      </span>
      <select
        name={name}
        defaultValue={value}
        className="mt-1 w-full appearance-none bg-transparent text-[0.9375rem] font-medium outline-none"
        style={{ color: "var(--plt-ink)" }}
      >
        {values.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function DiscoveryResultCard({
  card,
  appDiscoverHref,
}: {
  card: DiscoveryCard;
  appDiscoverHref: string;
}) {
  const photo = MARKETING_PHOTOS[card.photoKey];
  return (
    <article
      className="group flex min-h-[31rem] flex-col overflow-hidden rounded-[28px]"
      style={{
        background: "var(--plt-bg)",
        border: "1px solid var(--plt-hairline)",
        boxShadow: "0 24px 58px -44px rgba(15,23,20,0.24)",
      }}
    >
      <div className="relative min-h-[15rem] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url()}
          alt={photo.alt}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgba(15,23,20,0.02) 20%, rgba(15,23,20,0.52) 100%)" }}
        />
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <span
            className="rounded-full px-3 py-1 text-[0.6875rem] font-semibold uppercase"
            style={{
              background: card.kind === "Hub" ? "var(--plt-forest)" : "rgba(241,237,227,0.92)",
              color: card.kind === "Hub" ? "var(--plt-forest-on)" : "var(--plt-ink)",
            }}
          >
            {card.kind}
          </span>
          <span
            className="rounded-full px-3 py-1 text-[0.6875rem] font-semibold uppercase"
            style={{
              background: "rgba(15,23,20,0.56)",
              color: "var(--plt-on-inverse)",
            }}
          >
            {card.joinMode}
          </span>
        </div>
        <div className="absolute inset-x-4 bottom-4">
          <p className="plt-mono text-[0.6875rem] font-medium uppercase" style={{ color: "rgba(241,237,227,0.72)" }}>
            {card.city} · {card.region}
          </p>
          <h2
            className="plt-display mt-1 text-[1.75rem] font-semibold leading-[1.08]"
            style={{ color: "var(--plt-on-inverse)" }}
          >
            {card.name}
          </h2>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex flex-wrap gap-2">
          {card.categories.map((tag) => (
            <span
              key={tag}
              className="rounded-full px-3 py-1 text-[0.75rem] font-medium"
              style={{
                background: "var(--plt-bg-raised)",
                color: "var(--plt-ink-soft)",
                border: "1px solid var(--plt-hairline)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
        <p className="mt-5 text-[0.9375rem] leading-[1.6]" style={{ color: "var(--plt-muted)" }}>
          {card.description}
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-3">
          {card.stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-[16px] px-4 py-3"
              style={{
                background: "var(--plt-bg-raised)",
                border: "1px solid var(--plt-hairline)",
              }}
            >
              <dt className="plt-mono text-[0.625rem] uppercase" style={{ color: "var(--plt-muted)" }}>
                {stat.label}
              </dt>
              <dd className="mt-1 text-[1rem] font-semibold" style={{ color: "var(--plt-ink)" }}>
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
          <a
            href={appDiscoverHref}
            className="inline-flex min-h-10 items-center justify-center rounded-full px-4 text-[0.875rem] font-medium transition-transform hover:-translate-y-[1px]"
            style={{
              background: "var(--plt-forest)",
              color: "var(--plt-forest-on)",
            }}
          >
            Apply from dashboard
          </a>
          <a
            href={card.href}
            className="inline-flex min-h-10 items-center justify-center rounded-full border px-4 text-[0.875rem] font-medium transition-colors hover:border-[var(--plt-forest)] hover:text-[var(--plt-forest)]"
            style={{
              borderColor: "var(--plt-hairline-strong)",
              color: "var(--plt-ink-soft)",
            }}
          >
            View profile
          </a>
        </div>
      </div>
    </article>
  );
}
