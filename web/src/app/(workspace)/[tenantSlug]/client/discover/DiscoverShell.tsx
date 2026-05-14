"use client";

// DiscoverShell — buyer-side Discover surface (cross-tenant catalog).
//
// Replaces the original tenant-scoped roster browser. Renders a grid of
// is_discoverable=true talents across all Tulala tenants, filtered by
// country / category / search. Filter state syncs to URL so combinations
// are shareable. "Load more" paginates via /api/discover/talents.
//
// Card click → in-app detail drawer (fetches /api/discover/talent/:id).
// Public profile link is now inside the drawer footer — same destination,
// keeps the client on the Discover surface for the swipe-through compare
// flow that's coming in D4.

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type {
  DiscoverTalentListItem,
  DiscoverFacets,
  DiscoverHub,
} from "../../_data-bridge/discover";

/** Local mirror of DiscoverAvailabilityDay (API response shape). */
type DiscoverAvailabilityDay = {
  date: string;
  status: "open" | "tentative" | "booked" | "blocked";
};

/** Local mirror of DiscoverTalentDetail (API response shape). Inline
 *  rather than imported because the API route file is server-only. */
type DiscoverTalentDetail = {
  id: string;
  displayName: string;
  profileCode: string | null;
  primaryTypeLabel: string | null;
  primaryTypeSlug: string | null;
  secondaryTypeLabels: string[];
  homeCity: string | null;
  homeCountry: string | null;
  agencyName: string | null;
  agencyTenantId: string | null;
  isExclusive: boolean;
  bio: string | null;
  responseTime: "1h" | "4h" | "24h" | "48h" | null;
  languages: string[];
  headshotUrl: string | null;
  galleryUrls: string[];
};

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.16)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  accentDeep: "#0F4F3E",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

type ActiveFilters = {
  country: string | null;
  category: string | null;
  hub: string | null;
  q: string | null;
};

export function DiscoverShell({
  initialItems,
  initialTotal,
  facets,
  hubs,
  tenantSlug,
  activeFilters,
}: {
  initialItems: DiscoverTalentListItem[];
  initialTotal: number;
  facets: DiscoverFacets;
  hubs: DiscoverHub[];
  tenantSlug: string;
  activeFilters: ActiveFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<DiscoverTalentListItem[]>(initialItems);
  const [total, setTotal] = useState<number>(initialTotal);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState<string>(activeFilters.q ?? "");
  const [, startNavTransition] = useTransition();
  const [openTalentId, setOpenTalentId] = useState<string | null>(null);
  const [availabilityByTalent, setAvailabilityByTalent] = useState<Map<string, DiscoverAvailabilityDay[]>>(() => new Map());

  // Reset client list when SSR initial set changes (e.g. filter applied via URL).
  useEffect(() => {
    setItems(initialItems);
    setTotal(initialTotal);
  }, [initialItems, initialTotal]);

  // Progressive enhancement — cards render immediately (no waiting on
  // availability), then 14-day windows hydrate per visible talent.
  // Browser concurrency limit (~6) keeps the network behaved with 24 cards.
  useEffect(() => {
    const missing = items.filter((t) => !availabilityByTalent.has(t.id)).map((t) => t.id);
    if (missing.length === 0) return;
    const controller = new AbortController();
    Promise.all(
      missing.map((id) =>
        fetch(`/api/discover/talent/${id}/availability?days=14`, { signal: controller.signal })
          .then((r) => (r.ok ? r.json() : { days: [] as DiscoverAvailabilityDay[] }))
          .then((j: { days: DiscoverAvailabilityDay[] }) => [id, j.days] as const)
          .catch(() => [id, [] as DiscoverAvailabilityDay[]] as const),
      ),
    ).then((results) => {
      if (controller.signal.aborted) return;
      setAvailabilityByTalent((prev) => {
        const next = new Map(prev);
        for (const [id, days] of results) next.set(id, days);
        return next;
      });
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Update URL params and let SSR refetch the new initial list.
  const pushFilters = useCallback(
    (next: Partial<ActiveFilters>) => {
      const sp = new URLSearchParams(searchParams.toString());
      const apply = (key: keyof ActiveFilters, value: string | null) => {
        if (value && value.trim()) sp.set(key, value.trim());
        else sp.delete(key);
      };
      if (next.country !== undefined) apply("country", next.country);
      if (next.category !== undefined) apply("category", next.category);
      if (next.hub !== undefined) apply("hub", next.hub);
      if (next.q !== undefined) apply("q", next.q);
      const url = `${pathname}${sp.toString() ? `?${sp.toString()}` : ""}`;
      startNavTransition(() => router.replace(url, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  const handleLoadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const sp = new URLSearchParams();
      if (activeFilters.country) sp.set("country", activeFilters.country);
      if (activeFilters.category) sp.set("category", activeFilters.category);
      if (activeFilters.hub) sp.set("hub", activeFilters.hub);
      if (activeFilters.q) sp.set("q", activeFilters.q);
      sp.set("limit", "24");
      sp.set("offset", String(items.length));
      const res = await fetch(`/api/discover/talents?${sp.toString()}`);
      if (!res.ok) return;
      const json = (await res.json()) as { items: DiscoverTalentListItem[]; total: number };
      setItems((prev) => [...prev, ...json.items]);
      setTotal(json.total);
    } finally {
      setLoadingMore(false);
    }
  }, [activeFilters, items.length, loadingMore]);

  const hasActiveFilters =
    !!(activeFilters.country || activeFilters.category || activeFilters.hub || activeFilters.q);

  return (
    <div>
      {/* Filter chip bar — country + category + search */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="search"
            placeholder="Search talent by name…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") pushFilters({ q: searchInput });
            }}
            onBlur={() => {
              if ((activeFilters.q ?? "") !== searchInput) pushFilters({ q: searchInput });
            }}
            style={{
              height: 38, flex: "1 1 220px", maxWidth: 320,
              padding: "0 14px", borderRadius: 10,
              border: `1px solid ${C.borderSoft}`,
              background: C.cardBg, fontFamily: FONT, fontSize: 13,
              color: C.ink, outline: "none", boxSizing: "border-box",
            }}
          />
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                pushFilters({ country: null, category: null, hub: null, q: null });
              }}
              style={{
                height: 32, padding: "0 14px", borderRadius: 999,
                border: `1px solid ${C.borderSoft}`, background: "transparent",
                color: C.inkMuted, fontFamily: FONT, fontSize: 12,
                fontWeight: 500, cursor: "pointer",
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Country chip row */}
        {facets.countries.length > 0 && (
          <FacetChipRow
            label="Country"
            value={activeFilters.country}
            options={facets.countries.map((c) => ({ value: c.value, label: c.value, count: c.count }))}
            onChange={(v) => pushFilters({ country: v })}
          />
        )}

        {/* Hub chip row — agency Studio/Agency/Network workspaces only */}
        {hubs.length > 0 && (
          <FacetChipRow
            label="Hub"
            value={activeFilters.hub}
            options={hubs.map((h) => ({ value: h.id, label: h.displayName, count: h.discoverableTalentCount }))}
            onChange={(v) => pushFilters({ hub: v })}
          />
        )}

        {/* Category chip row */}
        {facets.categories.length > 0 && (
          <FacetChipRow
            label="Category"
            value={activeFilters.category}
            options={facets.categories.map((c) => ({ value: c.value, label: c.label, count: c.count }))}
            onChange={(v) => pushFilters({ category: v })}
          />
        )}
      </div>

      {/* Result count + grid */}
      <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 12, fontFamily: FONT }}>
        {items.length} of {total} {total === 1 ? "talent" : "talents"}
        {hasActiveFilters && " · matching your filters"}
      </div>

      {items.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 16,
          }}
        >
          {items.map((t) => (
            <DiscoverCard
              key={t.id}
              item={t}
              availability={availabilityByTalent.get(t.id)}
              onOpen={() => setOpenTalentId(t.id)}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: "48px 20px", textAlign: "center",
            background: C.surface, border: `1px dashed ${C.borderSoft}`,
            borderRadius: 14, fontFamily: FONT,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
            No matches
          </div>
          <p style={{ fontSize: 13, color: C.inkMuted, margin: "0 auto", maxWidth: 320, lineHeight: 1.5 }}>
            Try a broader country or category — or clear your filters to see everyone.
          </p>
        </div>
      )}

      {/* Load more */}
      {items.length > 0 && items.length < total && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            style={{
              padding: "10px 22px", borderRadius: 999,
              background: loadingMore ? "rgba(11,11,13,0.4)" : C.accent,
              color: "#fff", border: "none",
              fontFamily: FONT, fontSize: 13, fontWeight: 600,
              cursor: loadingMore ? "not-allowed" : "pointer",
            }}
          >
            {loadingMore ? "Loading…" : `Load more · ${total - items.length} remaining`}
          </button>
        </div>
      )}

      {/* Detail drawer — slides in when a card is clicked. Fetches the
          full DiscoverTalentDetail from /api/discover/talent/:id. */}
      <DiscoverDetailDrawer
        talentId={openTalentId}
        onClose={() => setOpenTalentId(null)}
      />
    </div>
  );
}

function FacetChipRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: Array<{ value: string; label: string; count: number }>;
  onChange: (next: string | null) => void;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4,
          textTransform: "uppercase", color: C.inkDim,
          marginBottom: 6, fontFamily: FONT,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex", gap: 6, flexWrap: "nowrap",
          overflowX: "auto", paddingBottom: 2,
          scrollbarWidth: "none",
        }}
      >
        <FacetChip
          label="All"
          count={null}
          active={!value}
          onClick={() => onChange(null)}
        />
        {options.map((o) => (
          <FacetChip
            key={o.value}
            label={o.label}
            count={o.count}
            active={value === o.value}
            onClick={() => onChange(value === o.value ? null : o.value)}
          />
        ))}
      </div>
    </div>
  );
}

function FacetChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        height: 30, padding: "0 12px", borderRadius: 999,
        border: active ? `1.5px solid ${C.accent}` : `1px solid ${C.borderSoft}`,
        background: active ? C.accentSoft : C.cardBg,
        color: active ? C.accentDeep : C.inkMuted,
        fontFamily: FONT, fontSize: 12,
        fontWeight: active ? 700 : 500,
        cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
        transition: "all 100ms",
      }}
    >
      {label}
      {count !== null && (
        <span style={{ fontSize: 10.5, fontWeight: 600, color: active ? C.accentDeep : C.inkDim }}>
          · {count}
        </span>
      )}
    </button>
  );
}

function DiscoverCard({
  item,
  availability,
  onOpen,
}: {
  item: DiscoverTalentListItem;
  availability: DiscoverAvailabilityDay[] | undefined;
  onOpen: () => void;
}) {
  const initials = item.displayName
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "").join("");

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: "flex", flexDirection: "column",
        background: C.cardBg, border: `1px solid ${C.borderSoft}`,
        borderRadius: 14, overflow: "hidden",
        textAlign: "left", color: "inherit", fontFamily: FONT,
        cursor: "pointer", padding: 0,
        transition: "border-color 150ms, box-shadow 150ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = C.border;
        e.currentTarget.style.boxShadow = "0 4px 14px -8px rgba(11,11,13,0.18)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = C.borderSoft;
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Photo */}
      <div
        style={{
          aspectRatio: "4 / 5", position: "relative",
          background: item.headshotUrl
            ? `url(${item.headshotUrl}) center/cover no-repeat`
            : C.surface,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {!item.headshotUrl && (
          <div
            style={{
              width: 64, height: 64, borderRadius: "50%",
              background: C.accentSoft, color: C.accent,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, fontWeight: 700, letterSpacing: 0.5,
            }}
          >
            {initials || "?"}
          </div>
        )}
        {/* Tulala-verified mark. Every discoverable talent has
            workflow_status ∈ {approved, published} — that's our
            review pass. Trust LADDER (Basic/Verified/Silver/Gold)
            is a CLIENT property, not a talent property — see
            project_client_trust_badges.md §3 — so we don't surface
            a per-talent ladder badge. */}
        <div
          style={{
            position: "absolute", top: 8, left: 8,
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 8px", borderRadius: 999,
            background: "rgba(15,79,62,0.92)", color: "#fff",
            fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
            backdropFilter: "blur(4px)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
          }}
          title="Profile reviewed and approved by Tulala"
        >
          ✓ Tulala
        </div>
        {/* Ownership badge: agency vs independent */}
        {item.agencyName ? (
          <div
            style={{
              position: "absolute", bottom: 8, left: 8,
              padding: "3px 9px", borderRadius: 999,
              background: "rgba(255,255,255,0.94)", color: C.ink,
              fontSize: 10.5, fontWeight: 600,
              maxWidth: "calc(100% - 16px)",
              overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
              backdropFilter: "blur(6px)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
            }}
            title={`${item.agencyName}${item.isExclusive ? " · exclusive" : ""}`}
          >
            {item.agencyName}
            {item.isExclusive && <span style={{ marginLeft: 4, color: C.inkMuted, fontSize: 9 }}>· exclusive</span>}
          </div>
        ) : (
          <div
            style={{
              position: "absolute", bottom: 8, left: 8,
              padding: "3px 9px", borderRadius: 999,
              background: "rgba(255,255,255,0.85)", color: C.inkMuted,
              fontSize: 10.5, fontWeight: 600,
              backdropFilter: "blur(6px)",
            }}
          >
            Independent
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "12px 14px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
          {item.displayName}
        </div>
        {item.primaryTypeLabel && (
          <div style={{ fontSize: 11.5, color: C.inkMuted }}>{item.primaryTypeLabel}</div>
        )}
        {(item.homeCity || item.homeCountry) && (
          <div style={{ fontSize: 11, color: C.inkDim, marginTop: 1 }}>
            {[item.homeCity, item.homeCountry].filter(Boolean).join(" · ")}
          </div>
        )}
        <AvailabilityStrip days={availability} />
      </div>
    </button>
  );
}

function AvailabilityStrip({ days }: { days: DiscoverAvailabilityDay[] | undefined }) {
  // Placeholder before hydration — neutral dots so the card height doesn't jump.
  const dots: Array<DiscoverAvailabilityDay | null> = days ?? Array.from({ length: 14 }, () => null);
  const colorFor = (s: DiscoverAvailabilityDay["status"] | null): string => {
    if (s === null) return "rgba(11,11,13,0.10)";
    if (s === "booked") return "#B0303A";
    if (s === "blocked") return "rgba(11,11,13,0.32)";
    if (s === "tentative") return "#D9A03A";
    return "#2E7D5B"; // open
  };
  const openDays = days ? days.filter((d) => d.status === "open").length : null;
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{ display: "flex", gap: 2, alignItems: "center" }}
        aria-label={openDays !== null ? `${openDays} of next 14 days open` : "Availability loading"}
      >
        {dots.slice(0, 14).map((d, i) => (
          <span
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            title={d ? `${d.date}: ${d.status}` : undefined}
            style={{
              width: 5, height: 5, borderRadius: 999,
              background: colorFor(d ? d.status : null),
              flexShrink: 0,
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: C.inkDim, marginTop: 4, fontFamily: FONT }}>
        {openDays === null
          ? "Loading availability…"
          : openDays === 0
            ? "Fully booked next 14 days"
            : `${openDays} of next 14 days open`}
      </div>
    </div>
  );
}

/**
 * Slide-in detail drawer. Mounted always; renders content only when
 * `talentId` is non-null. Fetches /api/discover/talent/:id on id change.
 * Esc + backdrop close.
 */
function DiscoverDetailDrawer({
  talentId,
  onClose,
}: {
  talentId: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<DiscoverTalentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!talentId) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    fetch(`/api/discover/talent/${talentId}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 404) {
          setError("Talent is no longer on Discover.");
          return;
        }
        if (!r.ok) {
          setError("Couldn't load this talent — try again.");
          return;
        }
        const j = (await r.json()) as { talent: DiscoverTalentDetail };
        if (!cancelled) setDetail(j.talent);
      })
      .catch(() => {
        if (!cancelled) setError("Network issue — try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [talentId]);

  useEffect(() => {
    if (!talentId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [talentId, onClose]);

  if (!talentId) return null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Talent detail"
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        display: "flex", justifyContent: "flex-end",
        fontFamily: FONT,
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(11,11,13,0.42)",
          backdropFilter: "blur(2px)",
        }}
      />

      {/* Drawer panel */}
      <aside
        style={{
          position: "relative",
          width: "min(480px, 100vw)",
          height: "100%",
          background: C.cardBg,
          boxShadow: "-12px 0 32px -16px rgba(11,11,13,0.32)",
          display: "flex", flexDirection: "column",
          overflowY: "auto",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail drawer"
          style={{
            position: "absolute", top: 12, right: 12, zIndex: 2,
            width: 32, height: 32, borderRadius: "50%",
            background: "rgba(255,255,255,0.85)",
            border: `1px solid ${C.borderSoft}`,
            color: C.ink, fontSize: 16, lineHeight: 1,
            cursor: "pointer", backdropFilter: "blur(4px)",
          }}
        >
          ✕
        </button>

        {loading && !detail && (
          <div style={{ padding: 32, color: C.inkMuted, fontSize: 13 }}>
            Loading talent…
          </div>
        )}

        {error && (
          <div style={{ padding: 32 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🌫️</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
              {error}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                marginTop: 12, padding: "8px 14px", borderRadius: 8,
                background: "transparent", border: `1px solid ${C.borderSoft}`,
                color: C.ink, fontFamily: FONT, fontSize: 12.5, cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        )}

        {detail && (
          <>
            {/* Hero photo */}
            <div
              style={{
                aspectRatio: "4 / 5",
                background: detail.headshotUrl
                  ? `url(${detail.headshotUrl}) center/cover no-repeat`
                  : C.surface,
                display: "flex", alignItems: "center", justifyContent: "center",
                position: "relative",
              }}
            >
              {!detail.headshotUrl && (
                <div
                  style={{
                    width: 84, height: 84, borderRadius: "50%",
                    background: C.accentSoft, color: C.accent,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 30, fontWeight: 700, letterSpacing: 0.5,
                  }}
                >
                  {detail.displayName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?"}
                </div>
              )}
              <div
                style={{
                  position: "absolute", top: 12, left: 12,
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "4px 10px", borderRadius: 999,
                  background: "rgba(15,79,62,0.92)", color: "#fff",
                  fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
                  backdropFilter: "blur(4px)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
                }}
                title="Profile reviewed and approved by Tulala"
              >
                ✓ Tulala
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600, color: C.ink, marginBottom: 2 }}>
                  {detail.displayName}
                </div>
                {detail.primaryTypeLabel && (
                  <div style={{ fontSize: 13, color: C.inkMuted }}>
                    {detail.primaryTypeLabel}
                    {detail.secondaryTypeLabels.length > 0 && (
                      <span style={{ color: C.inkDim }}>
                        {" · "}
                        {detail.secondaryTypeLabels.join(" · ")}
                      </span>
                    )}
                  </div>
                )}
                {(detail.homeCity || detail.homeCountry) && (
                  <div style={{ fontSize: 12, color: C.inkDim, marginTop: 4 }}>
                    📍 {[detail.homeCity, detail.homeCountry].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {detail.agencyName ? (
                  <Pill bg={C.accentSoft} color={C.accentDeep}>
                    🏛 {detail.agencyName}{detail.isExclusive ? " · exclusive" : ""}
                  </Pill>
                ) : (
                  <Pill bg="rgba(11,11,13,0.05)" color={C.inkMuted}>
                    Independent
                  </Pill>
                )}
                {detail.responseTime && (
                  <Pill bg="rgba(11,11,13,0.05)" color={C.inkMuted}>
                    ⏱ Replies within {detail.responseTime}
                  </Pill>
                )}
                {detail.languages.slice(0, 4).map((l) => (
                  <Pill key={l} bg="rgba(11,11,13,0.05)" color={C.inkMuted}>
                    {l}
                  </Pill>
                ))}
              </div>

              {detail.bio && (
                <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.55 }}>
                  {detail.bio}
                </div>
              )}

              {detail.galleryUrls.length > 1 && (
                <div>
                  <div style={{
                    fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4,
                    textTransform: "uppercase", color: C.inkDim, marginBottom: 8,
                  }}>
                    Gallery
                  </div>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 6,
                  }}>
                    {detail.galleryUrls.slice(0, 6).map((url, i) => (
                      <div
                        // eslint-disable-next-line react/no-array-index-key
                        key={i}
                        style={{
                          aspectRatio: "1 / 1",
                          background: `url(${url}) center/cover no-repeat`,
                          borderRadius: 8,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Footer actions — public profile + inquire (D5 placeholder) */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {detail.profileCode && (
                  <a
                    href={`/t/${detail.profileCode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      height: 40, borderRadius: 10,
                      background: C.accent, color: "#fff",
                      fontFamily: FONT, fontSize: 13, fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    View full profile ↗
                  </a>
                )}
                <button
                  type="button"
                  disabled
                  title="Multi-talent inquiry routing ships with D5 — not yet wired."
                  style={{
                    height: 40, borderRadius: 10,
                    background: "transparent", border: `1px solid ${C.borderSoft}`,
                    color: C.inkDim, fontFamily: FONT, fontSize: 13, fontWeight: 600,
                    cursor: "not-allowed",
                  }}
                >
                  ＋ Add to shortlist · coming soon
                </button>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function Pill({ children, bg, color }: { children: React.ReactNode; bg: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "3px 9px", borderRadius: 999,
        background: bg, color, fontSize: 11.5, fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}
