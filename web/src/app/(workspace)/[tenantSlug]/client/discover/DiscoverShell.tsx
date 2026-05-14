"use client";

// DiscoverShell — buyer-side Discover surface (cross-tenant catalog).
//
// Replaces the original tenant-scoped roster browser. Renders a grid of
// is_discoverable=true talents across all Tulala tenants, filtered by
// country / category / search. Filter state syncs to URL so combinations
// are shareable. "Load more" paginates via /api/discover/talents.
//
// v1 scope: filter + grid + pagination + card-link to public profile.
// Detail drawer, compare view, shortlists land in subsequent slices.

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import type {
  DiscoverTalentListItem,
  DiscoverFacets,
} from "../../_data-bridge/discover";

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
  q: string | null;
};

export function DiscoverShell({
  initialItems,
  initialTotal,
  facets,
  tenantSlug,
  activeFilters,
}: {
  initialItems: DiscoverTalentListItem[];
  initialTotal: number;
  facets: DiscoverFacets;
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

  // Reset client list when SSR initial set changes (e.g. filter applied via URL).
  useEffect(() => {
    setItems(initialItems);
    setTotal(initialTotal);
  }, [initialItems, initialTotal]);

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
    !!(activeFilters.country || activeFilters.category || activeFilters.q);

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
                pushFilters({ country: null, category: null, q: null });
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
            <DiscoverCard key={t.id} item={t} tenantSlug={tenantSlug} />
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
  tenantSlug,
}: {
  item: DiscoverTalentListItem;
  tenantSlug: string;
}) {
  const initials = item.displayName
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "").join("");

  const profileHref = item.profileCode
    ? `/t/${item.profileCode}`
    : `/${tenantSlug}/client/discover#${item.id}`;
  const isExternalProfile = !!item.profileCode;

  return (
    <Link
      href={profileHref}
      target={isExternalProfile ? "_blank" : undefined}
      rel={isExternalProfile ? "noopener noreferrer" : undefined}
      style={{
        display: "flex", flexDirection: "column",
        background: C.cardBg, border: `1px solid ${C.borderSoft}`,
        borderRadius: 14, overflow: "hidden",
        textDecoration: "none", color: "inherit", fontFamily: FONT,
        transition: "border-color 150ms, box-shadow 150ms",
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
        {/* Trust badge placeholder — real tier from trust_signals lands later */}
        <div
          style={{
            position: "absolute", top: 8, left: 8,
            padding: "2px 8px", borderRadius: 4,
            background: "rgba(11,11,13,0.55)", color: "#fff",
            fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
            textTransform: "uppercase", backdropFilter: "blur(4px)",
          }}
        >
          Basic
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
      </div>
    </Link>
  );
}
