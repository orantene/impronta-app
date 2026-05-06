"use client";

// DiscoverShell — client wrapper for Client Discover page.
// Handles category filter tabs and search state.

import Link from "next/link";
import { useState } from "react";
import type { WorkspaceRosterItem } from "../../_data-bridge";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  blueDeep:   "#1D4ED8",
  greenDeep:  "#1A7348",
  greenSoft:  "rgba(26,115,72,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

/** Derive a short category group from the primaryTypeLabel.
 *  One-item groups that fall through are collapsed into "Other" by buildCategoryTabs. */
function deriveCategoryGroup(label: string | undefined): string {
  if (!label) return "Other";
  const normalized = label.toLowerCase();
  if (normalized.includes("model")) return "Models";
  if (normalized.includes("host") || normalized.includes("mc") || normalized.includes("emcee")) return "Hosts";
  if (normalized.includes("chef") || normalized.includes("cook") || normalized.includes("culinary")) return "Chefs";
  if (normalized.includes("musician") || normalized.includes("band") || normalized.includes("singer") || normalized.includes("vocalist")) return "Musicians";
  if (normalized.includes("dj")) return "DJs";
  if (normalized.includes("photographer") || normalized.includes("photo")) return "Photographers";
  if (normalized.includes("artist") || normalized.includes("performer") || normalized.includes("entertainer")) return "Artists";
  if (normalized.includes("dancer")) return "Dancers";
  if (normalized.includes("actor") || normalized.includes("actress")) return "Actors";
  if (normalized.includes("makeup") || normalized.includes("stylist") || normalized.includes("hair")) return "Stylists";
  if (normalized.includes("ambassador") || normalized.includes("promotional") || normalized.includes("brand")) return "Brand Talent";
  return "Other";
}

function buildCategoryTabs(items: WorkspaceRosterItem[]): string[] {
  const countByGroup = new Map<string, number>();
  for (const item of items) {
    const group = deriveCategoryGroup(item.primaryTypeLabel);
    countByGroup.set(group, (countByGroup.get(group) ?? 0) + 1);
  }
  // Sort by count descending, limit to top 7, prepend "All"
  const sorted = [...countByGroup.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([g]) => g);
  return sorted.length > 1 ? ["All", ...sorted] : [];
}

function ProfileCard({
  id,
  name,
  primaryTypeLabel,
  city,
  state,
  thumb,
  tenantSlug,
  profileCode,
}: {
  id: string;
  name: string;
  primaryTypeLabel?: string;
  city?: string;
  state: string;
  thumb?: string;
  tenantSlug: string;
  profileCode?: string | null;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const isPublished = state === "published";

  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: FONT,
      }}
    >
      {/* Portrait photo area — 4:5 aspect ratio */}
      <div
        style={{
          aspectRatio: "4 / 5",
          background: thumb
            ? `url(${thumb}) center/cover no-repeat`
            : "rgba(11,11,13,0.03)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {!thumb && (
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: C.accentSoft,
              color: C.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 0.5,
            }}
          >
            {initials}
          </div>
        )}
        {/* Published badge */}
        {isPublished && (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              background: C.greenSoft,
              border: `1px solid rgba(26,115,72,0.25)`,
              borderRadius: 999,
              padding: "2px 8px",
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase" as const,
              color: C.greenDeep,
              backdropFilter: "blur(4px)",
            }}
          >
            Available
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "12px 14px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
          {name}
        </div>
        {primaryTypeLabel && (
          <div style={{ fontSize: 11.5, color: C.inkMuted }}>{primaryTypeLabel}</div>
        )}
        {city && (
          <div style={{ fontSize: 11, color: C.inkDim, marginTop: 1 }}>{city}</div>
        )}

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {isPublished ? (
            <Link
              href={`/${tenantSlug}/client/inquiries/new?talent=${encodeURIComponent(id)}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 32,
                borderRadius: 8,
                background: C.accent,
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                textDecoration: "none",
                fontFamily: FONT,
              }}
            >
              Request booking
            </Link>
          ) : (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 32,
                borderRadius: 8,
                background: C.surface,
                color: C.inkDim,
                fontSize: 12,
                fontWeight: 500,
                fontFamily: FONT,
              }}
            >
              Not available
            </div>
          )}
          {profileCode && (
            <a
              href={`https://tulala.digital/t/${profileCode}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                height: 30,
                borderRadius: 8,
                background: "transparent",
                border: `1px solid ${C.borderSoft}`,
                color: C.inkMuted,
                fontSize: 11.5,
                fontWeight: 500,
                textDecoration: "none",
                fontFamily: FONT,
              }}
            >
              View profile ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function DiscoverShell({
  roster,
  tenantSlug,
}: {
  roster: WorkspaceRosterItem[];
  tenantSlug: string;
}) {
  const visible = roster.filter((r) => r.state === "published");
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");

  const categoryTabs = buildCategoryTabs(visible);
  const showTabs = categoryTabs.length > 1;

  const filtered = visible.filter((t) => {
    if (activeCategory !== "All") {
      if (deriveCategoryGroup(t.primaryTypeLabel) !== activeCategory) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        (t.primaryTypeLabel ?? "").toLowerCase().includes(q) ||
        (t.city ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div>
      {/* Search + filter row */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        {/* Search input */}
        <input
          type="search"
          placeholder="Search by name, type, or city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            height: 38,
            width: "100%",
            maxWidth: 400,
            padding: "0 14px",
            borderRadius: 10,
            border: `1px solid ${C.borderSoft}`,
            background: C.cardBg,
            fontFamily: FONT,
            fontSize: 13,
            color: C.ink,
            outline: "none",
            boxSizing: "border-box",
          }}
        />

        {/* Category filter tabs */}
        {showTabs && (
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "nowrap",
              overflowX: "auto",
              paddingBottom: 2,
              scrollbarWidth: "none",
            }}
          >
            {categoryTabs.map((cat) => {
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 32,
                    padding: "0 14px",
                    borderRadius: 999,
                    border: isActive
                      ? `1.5px solid ${C.accent}`
                      : `1px solid ${C.borderSoft}`,
                    background: isActive ? C.accentSoft : C.cardBg,
                    color: isActive ? C.blueDeep : C.inkMuted,
                    fontFamily: FONT,
                    fontSize: 12.5,
                    fontWeight: isActive ? 700 : 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    transition: "all 100ms",
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <>
          {(search || activeCategory !== "All") && (
            <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 12, fontFamily: FONT }}>
              {filtered.length} {filtered.length === 1 ? "result" : "results"}
              {search && ` for "${search}"`}
              {activeCategory !== "All" && ` · ${activeCategory}`}
            </div>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 16,
            }}
          >
            {filtered.map((t) => (
              <ProfileCard
                key={t.id}
                id={t.id}
                name={t.name}
                primaryTypeLabel={t.primaryTypeLabel}
                city={t.city}
                state={t.state}
                thumb={t.thumb}
                tenantSlug={tenantSlug}
                profileCode={t.profileCode}
              />
            ))}
          </div>
        </>
      ) : (
        <div
          style={{
            padding: "48px 20px",
            textAlign: "center",
            background: C.surface,
            border: `1px dashed ${C.borderSoft}`,
            borderRadius: 14,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
            No results
          </div>
          <p style={{ fontSize: 13, color: C.inkMuted, margin: "0 auto", maxWidth: 300, lineHeight: 1.5 }}>
            {search ? `No talent matches "${search}"` : `No talent in this category.`}
          </p>
          <button
            onClick={() => { setSearch(""); setActiveCategory("All"); }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              marginTop: 14,
              height: 32,
              padding: "0 14px",
              borderRadius: 8,
              border: `1px solid ${C.borderSoft}`,
              background: "transparent",
              color: C.ink,
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: FONT,
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
