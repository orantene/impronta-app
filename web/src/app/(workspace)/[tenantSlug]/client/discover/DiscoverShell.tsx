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
import Image from "next/image";
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

/** Local mirror of DiscoverShortlist (API response shape). */
type DiscoverShortlist = {
  id: string;
  name: string;
  eventDateHint: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  talentIds: string[];
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
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(() => new Set());
  const [shortlists, setShortlists] = useState<DiscoverShortlist[]>([]);
  const [autoOpenPicker, setAutoOpenPicker] = useState(false);

  // Hydrate favorites + shortlists once on mount. Optimistic mutations below.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/discover/favorites")
      .then((r) => (r.ok ? r.json() : { favorites: [] }))
      .then((j: { favorites?: Array<{ talentId: string }> }) => {
        if (cancelled) return;
        const ids = (j.favorites ?? []).map((f) => f.talentId);
        setFavoritedIds(new Set(ids));
      })
      .catch(() => {});
    fetch("/api/discover/shortlists")
      .then((r) => (r.ok ? r.json() : { shortlists: [] }))
      .then((j: { shortlists?: DiscoverShortlist[] }) => {
        if (cancelled) return;
        setShortlists(j.shortlists ?? []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const addTalentToShortlist = useCallback(async (shortlistId: string, talentId: string): Promise<boolean> => {
    setShortlists((prev) => prev.map((s) =>
      s.id === shortlistId && !s.talentIds.includes(talentId)
        ? { ...s, talentIds: [...s.talentIds, talentId] }
        : s,
    ));
    try {
      const res = await fetch(`/api/discover/shortlists/${shortlistId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talentId }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const removeTalentFromShortlist = useCallback(async (shortlistId: string, talentId: string): Promise<boolean> => {
    setShortlists((prev) => prev.map((s) =>
      s.id === shortlistId
        ? { ...s, talentIds: s.talentIds.filter((id) => id !== talentId) }
        : s,
    ));
    try {
      const res = await fetch(`/api/discover/shortlists/${shortlistId}/items/${talentId}`, {
        method: "DELETE",
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const createShortlist = useCallback(async (name: string): Promise<DiscoverShortlist | null> => {
    try {
      const res = await fetch("/api/discover/shortlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { shortlist: DiscoverShortlist };
      setShortlists((prev) => [j.shortlist, ...prev]);
      return j.shortlist;
    } catch {
      return null;
    }
  }, []);

  const handleToggleFavorite = useCallback(async (talentId: string) => {
    // Optimistic — flip the set, fire the API, revert on failure.
    let nextFavorited = false;
    setFavoritedIds((prev) => {
      const next = new Set(prev);
      if (next.has(talentId)) {
        next.delete(talentId);
        nextFavorited = false;
      } else {
        next.add(talentId);
        nextFavorited = true;
      }
      return next;
    });
    try {
      const res = await fetch(`/api/discover/favorites/${talentId}`, {
        method: nextFavorited ? "POST" : "DELETE",
      });
      if (!res.ok) throw new Error("favorite_failed");
    } catch {
      // Revert
      setFavoritedIds((prev) => {
        const next = new Set(prev);
        if (nextFavorited) next.delete(talentId);
        else next.add(talentId);
        return next;
      });
    }
  }, []);

  // Reset client list when SSR initial set changes (e.g. filter applied via URL).
  useEffect(() => {
    setItems(initialItems);
    setTotal(initialTotal);
  }, [initialItems, initialTotal]);

  // D3: the per-card N+1 availability fetch was retired here. Cards now
  // render immediately from item.availabilityDots14d (denormalized on
  // the talent_discover_index materialized view) — one query for all
  // cards instead of N. The granular per-day endpoint
  // (/api/discover/talent/<id>/availability) is still called by the
  // detail drawer for the open/tentative/booked/blocked distinction
  // that the binary dots collapse. The `availabilityByTalent` map below
  // stays untouched — anything that DOES populate it (e.g. an explicit
  // hydration trigger) takes precedence over the inline dots inside
  // AvailabilityStrip.

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
          <a
            href={`/${tenantSlug}/client/discover/map`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              height: 32,
              padding: "0 14px",
              borderRadius: 999,
              border: `1px solid ${C.borderSoft}`,
              background: C.cardBg,
              color: C.ink,
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              marginLeft: "auto",
            }}
            title="See every talent on a world map"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 2 3 5v17l6-3 6 3 6-3V2l-6 3-6-3z" />
              <line x1="9" y1="2" x2="9" y2="19" />
              <line x1="15" y1="5" x2="15" y2="22" />
            </svg>
            Map
          </a>
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
              isFavorited={favoritedIds.has(t.id)}
              onToggleFavorite={() => handleToggleFavorite(t.id)}
              onOpen={() => { setAutoOpenPicker(false); setOpenTalentId(t.id); }}
              onAddToShortlist={() => { setAutoOpenPicker(true); setOpenTalentId(t.id); }}
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
        onClose={() => { setOpenTalentId(null); setAutoOpenPicker(false); }}
        shortlists={shortlists}
        onAddToShortlist={addTalentToShortlist}
        onRemoveFromShortlist={removeTalentFromShortlist}
        onCreateShortlist={createShortlist}
        autoOpenPicker={autoOpenPicker}
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
  isFavorited,
  onToggleFavorite,
  onAddToShortlist,
  onOpen,
}: {
  item: DiscoverTalentListItem;
  availability: DiscoverAvailabilityDay[] | undefined;
  isFavorited: boolean;
  onToggleFavorite: () => void;
  onAddToShortlist: () => void;
  onOpen: () => void;
}) {
  const initials = item.displayName
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "").join("");

  // Card is a div+role=button (not a <button>) so the favorite-toggle
  // <button> inside it is valid HTML. Click + Enter/Space both open the
  // drawer; the favorite button stops propagation to avoid double-fire.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
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
          background: C.surface,
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {item.headshotUrl && (
          <Image
            src={item.headshotUrl}
            alt={item.displayName ?? "Talent"}
            fill
            sizes="(max-width: 600px) 50vw, (max-width: 1100px) 25vw, 280px"
            style={{ objectFit: "cover" }}
            unoptimized
          />
        )}
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
        {/* Favorite heart — toggles client_favorites via /api/discover/favorites/:id.
            Click stops propagation so it doesn't open the detail drawer. */}
        <button
          type="button"
          aria-label={isFavorited ? "Remove from favorites" : "Save to favorites"}
          aria-pressed={isFavorited}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          onKeyDown={(e) => { e.stopPropagation(); }}
          style={{
            position: "absolute", top: 8, right: 8,
            width: 32, height: 32, borderRadius: "50%",
            background: isFavorited ? "rgba(176,48,58,0.92)" : "rgba(255,255,255,0.88)",
            color: isFavorited ? "#fff" : "rgba(11,11,13,0.55)",
            border: "none", padding: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, lineHeight: 1, cursor: "pointer",
            backdropFilter: "blur(6px)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
            transition: "background 120ms, color 120ms",
          }}
          title={isFavorited ? "Saved — click to remove" : "Save to favorites"}
        >
          {isFavorited ? "♥" : "♡"}
        </button>
        {/* Add to shortlist — opens drawer with picker auto-expanded.
            Sits beside the heart so the two save-affordances live together. */}
        <button
          type="button"
          aria-label="Add to shortlist"
          onClick={(e) => {
            e.stopPropagation();
            onAddToShortlist();
          }}
          onKeyDown={(e) => { e.stopPropagation(); }}
          title="Add to shortlist"
          style={{
            position: "absolute", top: 8, right: 46,
            width: 32, height: 32, borderRadius: "50%",
            background: "rgba(255,255,255,0.88)",
            color: "rgba(11,11,13,0.55)",
            border: "none", padding: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, lineHeight: 1, fontWeight: 400, cursor: "pointer",
            backdropFilter: "blur(6px)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
            transition: "background 120ms",
          }}
        >
          ＋
        </button>
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
        <AvailabilityStrip
          days={availability}
          inlineDots={item.availabilityDots14d}
          availableDaysInNext30={item.availableDaysInNext30}
          nextAvailableDate={item.nextAvailableDate}
        />
      </div>
    </div>
  );
}

/**
 * D3: prefers the inline 14-char availability string from the
 * talent_discover_index materialized view (one query for all cards,
 * surfaces on first paint). Falls back to richer per-day data fetched
 * from /api/discover/talent/<id>/availability when present — that
 * surface carries the tentative / booked / blocked distinction the
 * binary dots lose.
 *
 * Color mapping:
 *   ·  → open (green)
 *   ×  → blocked (grey)
 *   open / tentative / booked / blocked → per-day legend (4 colors)
 */
function AvailabilityStrip({
  days,
  inlineDots,
  availableDaysInNext30,
  nextAvailableDate,
}: {
  days: DiscoverAvailabilityDay[] | undefined;
  inlineDots: string | null;
  availableDaysInNext30: number | null;
  nextAvailableDate: string | null;
}) {
  type Cell = { color: string; title?: string };
  const colorFor = (s: DiscoverAvailabilityDay["status"]): string => {
    if (s === "booked") return "#B0303A";
    if (s === "blocked") return "rgba(11,11,13,0.32)";
    if (s === "tentative") return "#D9A03A";
    return "#2E7D5B"; // open
  };

  let cells: Cell[];
  if (days && days.length > 0) {
    // Granular path (richer status). Drops the loading placeholder.
    cells = days.slice(0, 14).map((d) => ({
      color: colorFor(d.status),
      title: `${d.date}: ${d.status}`,
    }));
  } else if (inlineDots) {
    // Fast path — view-driven binary dots.
    const chars = inlineDots.split("");
    cells = Array.from({ length: 14 }, (_, i) => ({
      color: chars[i] === "·"
        ? "#2E7D5B"
        : chars[i] === "×"
          ? "rgba(11,11,13,0.32)"
          : "rgba(11,11,13,0.10)",
    }));
  } else {
    // No data at all — neutral placeholder so card height doesn't jump.
    cells = Array.from({ length: 14 }, () => ({ color: "rgba(11,11,13,0.10)" }));
  }

  // Footer label — prefer granular open-day count when available; fall
  // back to the 30-day rollup from the view.
  const granularOpenIn14 = days
    ? days.filter((d) => d.status === "open").length
    : null;
  const footerLabel = (() => {
    if (granularOpenIn14 !== null) {
      return granularOpenIn14 === 0
        ? "Fully booked next 14 days"
        : `${granularOpenIn14} of next 14 days open`;
    }
    if (typeof availableDaysInNext30 === "number") {
      if (availableDaysInNext30 === 0) return "Fully booked next 30 days";
      return `${availableDaysInNext30} of next 30 days open`;
    }
    return null;
  })();

  // Optional 2nd-line "Available from …" — only when we have a concrete date.
  const nextAvailLabel = (() => {
    if (!nextAvailableDate) return null;
    const d = new Date(nextAvailableDate);
    if (Number.isNaN(d.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d <= today) return null; // already available today — redundant
    const month = d.toLocaleString("en-US", { month: "short" });
    return `Next free ${month} ${d.getDate()}`;
  })();

  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{ display: "flex", gap: 2, alignItems: "center" }}
        aria-label={footerLabel ?? "Availability"}
      >
        {cells.map((c, i) => (
          <span
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            title={c.title}
            style={{
              width: 5, height: 5, borderRadius: 999,
              background: c.color,
              flexShrink: 0,
            }}
          />
        ))}
      </div>
      {footerLabel && (
        <div style={{ fontSize: 10.5, color: C.inkDim, marginTop: 4, fontFamily: FONT }}>
          {footerLabel}
        </div>
      )}
      {nextAvailLabel && (
        <div style={{ fontSize: 10, color: C.inkDim, marginTop: 1, fontFamily: FONT }}>
          {nextAvailLabel}
        </div>
      )}
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
  shortlists,
  onAddToShortlist,
  onRemoveFromShortlist,
  onCreateShortlist,
  autoOpenPicker = false,
}: {
  talentId: string | null;
  onClose: () => void;
  shortlists: DiscoverShortlist[];
  onAddToShortlist: (shortlistId: string, talentId: string) => Promise<boolean>;
  onRemoveFromShortlist: (shortlistId: string, talentId: string) => Promise<boolean>;
  onCreateShortlist: (name: string) => Promise<DiscoverShortlist | null>;
  autoOpenPicker?: boolean;
}) {
  const [detail, setDetail] = useState<DiscoverTalentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Sync the picker-open intent each time a new card opens via the
  // card "+" affordance — fires when talentId+autoOpenPicker change so
  // the picker auto-expands without an extra click.
  useEffect(() => {
    if (talentId && autoOpenPicker) setPickerOpen(true);
  }, [talentId, autoOpenPicker]);
  const [newListName, setNewListName] = useState("");
  const [creating, setCreating] = useState(false);
  const [inquireOpen, setInquireOpen] = useState(false);
  const [inquireDate, setInquireDate] = useState("");
  const [inquireLocation, setInquireLocation] = useState("");
  const [inquireMessage, setInquireMessage] = useState("");
  const [inquireSubmitting, setInquireSubmitting] = useState(false);
  const [inquireResult, setInquireResult] = useState<{ ok: boolean; text: string } | null>(null);

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
                background: C.surface,
                display: "flex", alignItems: "center", justifyContent: "center",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {detail.headshotUrl && (
                <Image
                  src={detail.headshotUrl}
                  alt={detail.displayName}
                  fill
                  sizes="(max-width: 600px) 100vw, 480px"
                  priority
                  style={{ objectFit: "cover" }}
                  unoptimized
                />
              )}
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
                          position: "relative",
                          borderRadius: 8,
                          overflow: "hidden",
                          background: C.surface,
                        }}
                      >
                        <Image
                          src={url}
                          alt={`${detail.displayName} gallery ${i + 1}`}
                          fill
                          sizes="(max-width: 600px) 33vw, 160px"
                          style={{ objectFit: "cover" }}
                          unoptimized
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer actions — primary: inquire (D5). Secondary: view profile, shortlist. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setInquireOpen((v) => !v);
                    setInquireResult(null);
                  }}
                  style={{
                    height: 40, borderRadius: 10,
                    background: inquireOpen ? C.accentSoft : C.accent,
                    border: `1px solid ${inquireOpen ? C.accent : "transparent"}`,
                    color: inquireOpen ? C.accentDeep : "#fff",
                    fontFamily: FONT, fontSize: 13, fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {inquireOpen ? "Cancel inquiry" : `Inquire about ${detail.displayName}`}
                </button>
                {inquireOpen && (
                  <div
                    style={{
                      padding: 12,
                      border: `1px solid ${C.borderSoft}`,
                      borderRadius: 10,
                      background: C.surface,
                      display: "flex", flexDirection: "column", gap: 10,
                      fontFamily: FONT,
                    }}
                  >
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: C.inkMuted }}>
                      Event date (optional)
                      <input
                        type="date"
                        value={inquireDate}
                        onChange={(e) => setInquireDate(e.target.value)}
                        style={{
                          height: 34, padding: "0 10px",
                          borderRadius: 8, border: `1px solid ${C.borderSoft}`,
                          background: "#fff", color: C.ink, fontFamily: FONT, fontSize: 13,
                        }}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: C.inkMuted }}>
                      Event location (optional)
                      <input
                        type="text"
                        placeholder="e.g. Milan, Italy"
                        value={inquireLocation}
                        onChange={(e) => setInquireLocation(e.target.value)}
                        style={{
                          height: 34, padding: "0 10px",
                          borderRadius: 8, border: `1px solid ${C.borderSoft}`,
                          background: "#fff", color: C.ink, fontFamily: FONT, fontSize: 13,
                        }}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: C.inkMuted }}>
                      Brief
                      <textarea
                        placeholder="Quick context: brand, role, scope, dates if known."
                        value={inquireMessage}
                        onChange={(e) => setInquireMessage(e.target.value)}
                        rows={3}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8, border: `1px solid ${C.borderSoft}`,
                          background: "#fff", color: C.ink, fontFamily: FONT, fontSize: 13,
                          resize: "vertical",
                        }}
                      />
                    </label>
                    {inquireResult && (
                      <div
                        style={{
                          padding: "8px 10px", borderRadius: 8,
                          fontSize: 12,
                          background: inquireResult.ok ? "rgba(46,125,91,0.10)" : "rgba(176,48,58,0.10)",
                          color: inquireResult.ok ? "#1B5C45" : "#B0303A",
                          border: `1px solid ${inquireResult.ok ? "rgba(46,125,91,0.30)" : "rgba(176,48,58,0.30)"}`,
                        }}
                      >
                        {inquireResult.text}
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={inquireSubmitting}
                      onClick={async () => {
                        setInquireSubmitting(true);
                        setInquireResult(null);
                        try {
                          const res = await fetch("/api/discover/inquiry", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              talentIds: [detail.id],
                              eventDate: inquireDate || undefined,
                              eventLocation: inquireLocation || undefined,
                              message: inquireMessage || undefined,
                            }),
                          });
                          const j = await res.json();
                          if (res.ok && j.inquiries?.length > 0) {
                            setInquireResult({
                              ok: true,
                              text: `Inquiry sent — ${detail.agencyName ?? "the talent's agency"} will get back to you within their stated SLA.`,
                            });
                            setInquireDate("");
                            setInquireLocation("");
                            setInquireMessage("");
                          } else if (j.skipped?.length > 0 && j.skipped[0].reason === "no_roster") {
                            setInquireResult({
                              ok: false,
                              text: "This talent isn't on any agency roster yet. Use 'View full profile' to reach them directly.",
                            });
                          } else {
                            setInquireResult({
                              ok: false,
                              text: j.error === "no_routable_talents"
                                ? "No routable workspace for this talent — try 'View full profile' instead."
                                : "Couldn't send — try again in a moment.",
                            });
                          }
                        } catch {
                          setInquireResult({ ok: false, text: "Network issue — try again." });
                        } finally {
                          setInquireSubmitting(false);
                        }
                      }}
                      style={{
                        height: 38, borderRadius: 8,
                        background: inquireSubmitting ? "rgba(11,11,13,0.4)" : C.accent,
                        color: "#fff", border: "none",
                        fontFamily: FONT, fontSize: 13, fontWeight: 600,
                        cursor: inquireSubmitting ? "not-allowed" : "pointer",
                      }}
                    >
                      {inquireSubmitting ? "Sending…" : "Send inquiry"}
                    </button>
                  </div>
                )}
                {detail.profileCode && (
                  <a
                    href={`/t/${detail.profileCode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      height: 36, borderRadius: 10,
                      background: "transparent", border: `1px solid ${C.borderSoft}`,
                      color: C.ink, fontFamily: FONT, fontSize: 12.5, fontWeight: 500,
                      textDecoration: "none",
                    }}
                  >
                    View full profile ↗
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  style={{
                    height: 40, borderRadius: 10,
                    background: pickerOpen ? C.accentSoft : "transparent",
                    border: `1px solid ${pickerOpen ? C.accent : C.borderSoft}`,
                    color: pickerOpen ? C.accentDeep : C.ink,
                    fontFamily: FONT, fontSize: 13, fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  ＋ Add to shortlist
                </button>
                {pickerOpen && detail && (
                  <div
                    style={{
                      marginTop: 4,
                      padding: 10,
                      border: `1px solid ${C.borderSoft}`,
                      borderRadius: 10,
                      background: C.surface,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      fontFamily: FONT,
                    }}
                  >
                    {shortlists.length > 0 ? (
                      shortlists.map((s) => {
                        const isOn = s.talentIds.includes(detail.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              if (isOn) onRemoveFromShortlist(s.id, detail.id);
                              else onAddToShortlist(s.id, detail.id);
                            }}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "8px 12px", borderRadius: 8,
                              background: isOn ? "rgba(15,79,62,0.06)" : "#fff",
                              border: `1px solid ${isOn ? C.accent : C.borderSoft}`,
                              color: C.ink, fontFamily: FONT,
                              fontSize: 12.5, fontWeight: 500,
                              cursor: "pointer", textAlign: "left",
                            }}
                          >
                            <span>
                              {isOn ? "✓ " : "+ "}
                              {s.name}
                            </span>
                            <span style={{ fontSize: 11, color: C.inkDim }}>
                              {s.talentIds.length} {s.talentIds.length === 1 ? "talent" : "talents"}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div style={{ fontSize: 12, color: C.inkMuted, padding: "4px 4px 8px" }}>
                        No shortlists yet — create your first below.
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <input
                        type="text"
                        placeholder="New shortlist name…"
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter" && newListName.trim() && !creating) {
                            setCreating(true);
                            const created = await onCreateShortlist(newListName.trim());
                            if (created) {
                              await onAddToShortlist(created.id, detail.id);
                              setNewListName("");
                            }
                            setCreating(false);
                          }
                        }}
                        disabled={creating}
                        style={{
                          flex: 1, height: 32, padding: "0 10px",
                          borderRadius: 8, border: `1px solid ${C.borderSoft}`,
                          background: "#fff", color: C.ink,
                          fontFamily: FONT, fontSize: 12.5, outline: "none",
                        }}
                      />
                      <button
                        type="button"
                        disabled={!newListName.trim() || creating}
                        onClick={async () => {
                          if (!newListName.trim() || creating) return;
                          setCreating(true);
                          const created = await onCreateShortlist(newListName.trim());
                          if (created) {
                            await onAddToShortlist(created.id, detail.id);
                            setNewListName("");
                          }
                          setCreating(false);
                        }}
                        style={{
                          height: 32, padding: "0 12px",
                          borderRadius: 8, border: "none",
                          background: !newListName.trim() || creating ? "rgba(11,11,13,0.18)" : C.accent,
                          color: "#fff", fontFamily: FONT,
                          fontSize: 12.5, fontWeight: 600,
                          cursor: !newListName.trim() || creating ? "not-allowed" : "pointer",
                        }}
                      >
                        {creating ? "…" : "Create"}
                      </button>
                    </div>
                  </div>
                )}
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
