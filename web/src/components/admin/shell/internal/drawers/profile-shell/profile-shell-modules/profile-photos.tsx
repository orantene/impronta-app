// Phase-1f decomp — ProfileActivityLog + three-slot photo block (cover
// + avatar + gallery strip).  relTime kept module-scoped here (its sole
// consumer was ProfileActivityLog at line 2744 of the monolith).
"use client";
import React, { useState, useEffect } from "react";
import {
  COLORS,
  FONTS,
  ProfileActivityEntry,
  getTalentProfileActivity,
  useDashboardText,
} from "../../drawer-shared";

// Q5: relative-time helper hoisted to module scope so the Date.now() call
// doesn't trip react-hooks/purity when used from a render closure.
function relTime(iso: string, isSpanish: boolean): string {
  const diff = Date.now() - Date.parse(iso);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return isSpanish ? `hace ${mins} min` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return isSpanish ? `hace ${hrs} h` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return isSpanish ? `hace ${days} d` : `${days}d ago`;
}

export function ProfileActivityLog({ talentProfileId }: { talentProfileId?: string }) {
  const copy = useDashboardText();
  const [entries, setEntries] = useState<ProfileActivityEntry[]>([]);
  const [loading, setLoading] = useState(!!talentProfileId);

  useEffect(() => {
    if (!talentProfileId) { setLoading(false); return; }
    setLoading(true);
    getTalentProfileActivity({ talent_profile_id: talentProfileId, limit: 8 })
      .then((res) => { if (res.ok) setEntries(res.entries); })
      .finally(() => setLoading(false));
  }, [talentProfileId]);

  if (loading) return (
    <div style={{ padding: "12px 0", fontSize: 12, fontFamily: FONTS.body }} className="text-admin-ink-muted">{copy.t("Loading…")}</div>
  );
  if (entries.length === 0) return (
    <div style={{ padding: "12px 0", fontSize: 12, fontFamily: FONTS.body }} className="text-admin-ink-dim">{copy.t("No activity recorded yet.")}</div>
  );

  // Q5: relTime moved to module scope (see top of file) so the Date.now()
  // call no longer trips react-hooks/purity from a render-time closure.

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: FONTS.body }}>
      {entries.map((e, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 10px", borderRadius: 8,
          background: COLORS.surface,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: e.actorRole === "admin" ? COLORS.amberDeep
              : e.actorRole === "talent" ? COLORS.indigoDeep
              : COLORS.inkDim, flexShrink: 0, }} />
          <span className="flex-1 min-w-0">
            <span style={{ display: "block", fontSize: 12, lineHeight: 1.4 }} className="text-admin-ink">
              <strong style={{ fontWeight: 600, textTransform: "capitalize" }}>{copy.t(e.actorRole)}</strong>{" · "}{e.action}
            </span>
            <span style={{ display: "block", fontSize: 10.5, marginTop: 1 }} className="text-admin-ink-muted">{relTime(e.createdAt, copy.isSpanish)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Three-slot photo block (Phase 1) ─────────────────────────────────────────


export function ThreeSlotPhotoBlock({
  avatarUrl,
  heroUrl,
  galleryPhotos,
  onOpenSlot,
}: {
  avatarUrl: string | null;
  heroUrl: string | null;
  galleryPhotos: string[];
  onOpenSlot: (slot: "avatar" | "hero" | "gallery") => void;
}) {
  const copy = useDashboardText();
  return (
    <div style={{
      padding: "14px 18px 10px",
      borderBottom: `1px solid ${COLORS.borderSoft}`,
      marginBottom: 14,
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      {/* Cover photo — full-width at the top, tall preview */}
      <CoverPhotoSlot
        imageUrl={heroUrl}
        onClick={() => onOpenSlot("hero")}
      />
      {/* Avatar + gallery strip in a row below */}
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        {/*
          B8 — "Cover" used to name two different things on one screen: this
          16:9 profile banner, and the per-site card face picked in "Photos on
          this site" (which silently outranks this one on roster cards). Each
          slot is now named by WHERE it shows.
        */}
        <PhotoSlot
          label={copy.t("Profile photo")}
          hint={`1:1 ${copy.t("square")}`}
          imageUrl={avatarUrl}
          aspectRatio="1 / 1"
          onClick={() => onOpenSlot("avatar")}
          onRemove={avatarUrl ? () => onOpenSlot("avatar") : undefined}
        />
        <GalleryStrip
          photos={galleryPhotos}
          totalCount={galleryPhotos.length}
          onOpen={() => onOpenSlot("gallery")}
        />
      </div>
    </div>
  );
}


export function CoverPhotoSlot({
  imageUrl,
  onClick,
}: {
  imageUrl: string | null;
  onClick: () => void;
}) {
  const copy = useDashboardText();
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        aria-label={copy.t(imageUrl ? "Change cover photo" : "Set cover photo")}
        style={{
          width: "100%",
          height: 220,
          borderRadius: 10,
          overflow: "hidden",
          border: imageUrl
            ? `2px solid rgba(15,79,62,0.25)`
            : `2px dashed ${COLORS.borderSoft}`,
          background: imageUrl ? "transparent" : COLORS.surfaceAlt,
          cursor: "pointer",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={copy.t("Cover")}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontFamily: FONTS.body }} className="text-admin-ink-muted">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span className="text-admin-11h font-medium">{copy.t("Add cover photo")}</span>
          </div>
        )}
        {imageUrl && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(0,0,0,0)",
            transition: "background 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
            className="pshell-cover-hover"
          />
        )}
      </button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 2 }}>
        <span style={{ fontFamily: FONTS.body, fontSize: 11, fontWeight: 500 }} className="text-admin-ink-muted">
          {copy.t("Profile banner")}{" "}
          <span className="text-admin-ink-dim">
            · 16:9 · {copy.t("shows on this talent's own page")}
          </span>
        </span>
        {imageUrl && (
          <button type="button" onClick={onClick} style={{
            fontFamily: FONTS.body, fontSize: 11, color: COLORS.accent, fontWeight: 500,
            border: "none", background: "none", cursor: "pointer", padding: 0,
          }}>{copy.t("Change")}</button>
        )}
      </div>
    </div>
  );
}


export function GalleryStrip({
  photos,
  totalCount,
  onOpen,
}: {
  photos: string[];
  totalCount: number;
  onOpen: () => void;
}) {
  const copy = useDashboardText();
  // Show up to 8 thumbs; anything beyond gets a +N chip
  const MAX_THUMBS = 8;
  const shown = photos.slice(0, MAX_THUMBS);
  const extra = totalCount - shown.length;

  if (totalCount === 0) {
    return (
      <button type="button" onClick={onOpen} style={{
        flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center",
        gap: 6, padding: "10px 14px", borderRadius: 8,
        border: `1.5px dashed ${COLORS.borderSoft}`,
        background: COLORS.surfaceAlt, cursor: "pointer", minHeight: 86,
      }}>
        <span style={{ fontSize: 20, opacity: 0.35 }}>📷</span>
        <span style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 500 }} className="text-admin-ink-muted">
          {copy.t("Add photos")}
        </span>
      </button>
    );
  }

  return (
    <button type="button" onClick={onOpen} style={{
      flex: 1, minWidth: 0,
      padding: 6, borderRadius: 8,
      border: `1px solid ${COLORS.borderSoft}`,
      background: COLORS.surfaceAlt, cursor: "pointer",
      display: "grid",
      gridTemplateColumns: `repeat(auto-fill, minmax(62px, 1fr))`,
      gap: 4,
      alignItems: "stretch",
    }}>
      {shown.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={url} alt="" style={{
          width: "100%", aspectRatio: "3 / 4", objectFit: "cover",
          borderRadius: 5, display: "block",
        }} />
      ))}
      {extra > 0 && (
        <div style={{ aspectRatio: "3 / 4", borderRadius: 5, background: "rgba(15,79,62,0.10)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONTS.body, fontSize: 12, fontWeight: 700 }} className="text-admin-accent">+{extra}</div>
      )}
    </button>
  );
}


export function PhotoSlot({
  label,
  hint,
  imageUrl,
  aspectRatio,
  onClick,
  onRemove,
}: {
  label: string;
  hint: string;
  imageUrl: string | null;
  aspectRatio: string;
  onClick: () => void;
  onRemove?: () => void;
}) {
  const copy = useDashboardText();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div className="relative">
        <button
          type="button"
          onClick={onClick}
          aria-label={`${copy.t(imageUrl ? "Change" : "Set")} ${label}`}
          style={{
            width: aspectRatio === "1 / 1" ? 72 : 58,
            height: 72,
            borderRadius: 8,
            overflow: "hidden",
            border: imageUrl
              ? `2px solid rgba(15,79,62,0.25)`
              : `1.5px dashed rgba(15,79,62,0.3)`,
            background: imageUrl ? "transparent" : COLORS.surfaceAlt,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            position: "relative",
          }}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={label}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span style={{ fontSize: 22, opacity: 0.4 }}>📷</span>
          )}
          <span style={{
            position: "absolute", bottom: 2, left: 0, right: 0,
            background: "rgba(11,11,13,0.45)", color: "#fff",
            fontFamily: FONTS.body, fontSize: 9, fontWeight: 700,
            textAlign: "center", padding: "1px 0",
            opacity: 0,
            transition: "opacity 120ms",
          }} className="photo-slot-overlay">
            {copy.t(imageUrl ? "Change" : "Set")}
          </span>
        </button>
        {imageUrl && onRemove && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            aria-label={`${copy.t("Remove")} ${label}`}
            style={{
              position: "absolute", top: 4, right: 4,
              width: 18, height: 18, borderRadius: "50%",
              background: "rgba(0,0,0,0.6)", border: "none",
              color: "#fff", fontSize: 11, lineHeight: 1,
              cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center",
              padding: 0,
            }}
          >×</button>
        )}
      </div>
      <style>{`button:hover .photo-slot-overlay { opacity: 1 !important; }`}</style>
      <div className="text-center">
        <div style={{ fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600 }} className="text-admin-ink">{label}</div>
        <div style={{ fontFamily: FONTS.body, fontSize: 9.5 }} className="text-admin-ink-dim">{hint}</div>
      </div>
    </div>
  );
}

// ── Cover photo editor ──────────────────────────────────────────────

