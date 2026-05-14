"use client";

// FavoritesShell — viewer for /client/favorites.
//
// Lighter than the Discover grid (no filter chips, no availability strips).
// Just the talents the client hearted, with a quick remove-from-favorites
// affordance. Click a card to open the talent's public page in a new tab —
// the in-app drawer lives on Discover; from here we deep-link to the
// canonical /t/<profileCode>.

import { useState } from "react";
import Link from "next/link";
import type { DiscoverShortlistTalent } from "../../_data-bridge/discover";

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
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

type FavoriteWithProfileCode = DiscoverShortlistTalent & { profileCode?: string | null };

export function FavoritesShell({
  favorites,
  tenantSlug,
}: {
  favorites: DiscoverShortlistTalent[];
  tenantSlug: string;
}) {
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const visible = favorites.filter((f) => !removed.has(f.talentId));

  const handleRemove = async (talentId: string) => {
    // Optimistic remove with revert on failure.
    setRemoved((prev) => new Set([...prev, talentId]));
    try {
      const res = await fetch(`/api/discover/favorites/${talentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete_failed");
    } catch {
      setRemoved((prev) => {
        const next = new Set(prev);
        next.delete(talentId);
        return next;
      });
    }
  };

  if (visible.length === 0) {
    return (
      <div style={{
        padding: 32, textAlign: "center",
        background: C.surface, border: `1px dashed ${C.borderSoft}`,
        borderRadius: 14, fontFamily: FONT, color: C.inkMuted, fontSize: 13,
      }}>
        All favorites removed in this session. <Link href={`/${tenantSlug}/client/discover`} style={{ color: C.accent, fontWeight: 600 }}>Browse Discover</Link> to save more.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FONT }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 14,
        }}
      >
        {visible.map((t) => (
          <FavoriteCard
            key={t.talentId}
            talent={t as FavoriteWithProfileCode}
            tenantSlug={tenantSlug}
            onRemove={() => handleRemove(t.talentId)}
          />
        ))}
      </div>
      <div style={{
        marginTop: 18, padding: 14, borderRadius: 10,
        background: C.surface, border: `1px dashed ${C.borderSoft}`,
        textAlign: "center", color: C.inkMuted, fontSize: 12,
      }}>
        Want event-bound groups? Build a <Link href={`/${tenantSlug}/client/shortlists`} style={{ color: C.accent, fontWeight: 600 }}>shortlist</Link> and send one inquiry to multiple talents at once.
      </div>
    </div>
  );
}

function FavoriteCard({
  talent,
  tenantSlug,
  onRemove,
}: {
  talent: FavoriteWithProfileCode;
  tenantSlug: string;
  onRemove: () => void;
}) {
  const initials = talent.displayName
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "").join("");

  // Discover detail drawer surface lives at /client/discover; deep-linking
  // to it isn't wired (drawer state is client-side). Open the public
  // profile in a new tab so the user can keep this list visible.
  // profileCode is a future enrichment — for now, no public link unless
  // the talent provided one.
  const inquireHref = `/${tenantSlug}/client/discover`;

  return (
    <div
      style={{
        display: "flex", flexDirection: "column",
        background: C.cardBg, border: `1px solid ${C.borderSoft}`,
        borderRadius: 12, overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          aspectRatio: "4 / 5", position: "relative",
          background: talent.headshotUrl
            ? `url(${talent.headshotUrl}) center/cover no-repeat`
            : C.surface,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {!talent.headshotUrl && (
          <div
            style={{
              width: 56, height: 56, borderRadius: "50%",
              background: C.accentSoft, color: C.accent,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, fontWeight: 700,
            }}
          >
            {initials || "?"}
          </div>
        )}
        <button
          type="button"
          aria-label="Remove from favorites"
          title="Remove from favorites"
          onClick={onRemove}
          style={{
            position: "absolute", top: 8, right: 8,
            width: 30, height: 30, borderRadius: "50%",
            background: "rgba(176,48,58,0.92)", color: "#fff",
            border: "none", padding: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, lineHeight: 1, cursor: "pointer",
            backdropFilter: "blur(6px)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
          }}
        >
          ♥
        </button>
        {talent.agencyName && (
          <div
            style={{
              position: "absolute", bottom: 8, left: 8,
              padding: "3px 8px", borderRadius: 999,
              background: "rgba(255,255,255,0.94)", color: C.ink,
              fontSize: 10, fontWeight: 600,
              maxWidth: "calc(100% - 16px)",
              overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
              backdropFilter: "blur(6px)",
            }}
            title={`${talent.agencyName}${talent.isExclusive ? " · exclusive" : ""}`}
          >
            {talent.agencyName}
          </div>
        )}
      </div>
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        <Link
          href={inquireHref}
          style={{
            fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 600,
            color: C.ink, textDecoration: "none", letterSpacing: -0.1,
          }}
        >
          {talent.displayName}
        </Link>
        {talent.primaryTypeLabel && (
          <div style={{ fontSize: 11, color: C.inkMuted }}>{talent.primaryTypeLabel}</div>
        )}
        {(talent.homeCity || talent.homeCountry) && (
          <div style={{ fontSize: 10.5, color: C.inkDim, marginTop: 1 }}>
            {[talent.homeCity, talent.homeCountry].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}
