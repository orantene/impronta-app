"use client";

/**
 * GuestDockLineupView — Wave 2 (W2-A) "Lineup" dock view: the inquiry cart and
 * the saved favorites side by side as TWO SHELVES.
 *
 * DATA-LAYER RULE (locked): `saved_talent` (the inquiry cart) and
 * `client_favorites` (saved) are SEPARATE stores and stay separate. This view
 * unifies them VISUALLY only:
 *   Shelf A "In your inquiry" — useInquiryCart().cartIds joined with the
 *     cart-talent-registry (the same projection the launcher rail uses).
 *     Removal routes through the injected onRemoveCartTalent — the launcher's
 *     unified path (cart flip + record patch via the registered
 *     useUnifiedInquiry.patch runner + Undo toast), NEVER a direct write here.
 *   Shelf B "Saved" — useFavorites().favoriteIds (the client_favorites facade,
 *     guest localStorage mirror included) + the existing
 *     /api/directory/talents-by-ids batch lookup for names/faces (the same
 *     reader the favorites modal uses). "Move to inquiry" reuses the
 *     favorites-modal bridge: it ADDS the id to the cart via
 *     useInquiryCart().setInCart (setTalentSaved underneath) — an add, never a
 *     store merge; the favorite itself stays saved.
 *
 * House rules: never "cart"/"buyer" in copy (it is a lineup); real portraits
 * with the silhouette medallion fallback (never a gray box); tenant accent
 * only; dark-aware; no em dashes.
 */

import { useEffect, useState } from "react";

import type { DirectoryTalentMini } from "@/app/api/directory/talents-by-ids/route";
import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import { useFavorites } from "@/lib/talent-cards/use-favorites";
import { useInquiryCart } from "@/lib/talent-cards/use-inquiry-cart";

import { registerCartTalent, useCartTalentRegistry } from "./cart-talent-registry";
import { useCartTalents } from "./use-cart-talents";
import { AVATAR_GROUND, FACE_OBJECT_POSITION, PERSON_SILHOUETTE_SVG } from "./launcher-avatar-styles";
import { FONT, paletteFor, type SurfaceMode } from "./mini-chat-styles";

export type GuestDockLineupViewProps = {
  accent: string;
  accentInk: string;
  surfaceMode?: SurfaceMode;
  t: Translator;
  /** Source attribution for a saved-shelf "move to inquiry" add. */
  sourcePage: string;
  /**
   * The launcher's unified remove path (cart flip + inquiry-record patch +
   * Undo). When absent the remove control is hidden — this view never invents
   * its own removal write.
   */
  onRemoveCartTalent?: (talentProfileId: string) => void;
};

type SavedTile = {
  id: string;
  name: string;
  profileCode: string | null;
  photoUrl: string | null;
  meta: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Small presentational bits
// ─────────────────────────────────────────────────────────────────────────────

function FaceTile({
  photoUrl,
  name,
  C,
}: {
  photoUrl: string | null;
  name: string;
  C: ReturnType<typeof paletteFor>;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(photoUrl) && !failed;
  return (
    <span
      aria-hidden
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: showImage ? AVATAR_GROUND : C.surfaceCool,
        boxShadow: `0 0 0 1px ${C.borderSoft}`,
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl ?? undefined}
          alt={name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: FACE_OBJECT_POSITION,
            display: "block",
          }}
        />
      ) : (
        <span
          style={{
            display: "inline-flex",
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(90,102,120,0.7)",
          }}
          dangerouslySetInnerHTML={{ __html: PERSON_SILHOUETTE_SVG }}
        />
      )}
    </span>
  );
}

function ShelfHeader({
  label,
  count,
  C,
}: {
  label: string;
  count: number;
  C: ReturnType<typeof paletteFor>;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "10px 14px 6px",
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        color: C.inkMuted,
        fontFamily: FONT,
      }}
    >
      {label}
      {count > 0 && (
        <span style={{ fontWeight: 600, color: C.inkDim }}>({count})</span>
      )}
    </div>
  );
}

function EmptyShelfNote({ text, C }: { text: string; C: ReturnType<typeof paletteFor> }) {
  return (
    <div
      style={{
        margin: "0 14px",
        padding: "12px 12px",
        borderRadius: 10,
        background: C.surfaceFaint,
        border: `1px dashed ${C.borderSoft}`,
        fontSize: 11.5,
        lineHeight: 1.45,
        color: C.inkDim,
        fontFamily: FONT,
      }}
    >
      {text}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function GuestDockLineupView({
  accent,
  accentInk,
  surfaceMode = "light",
  t,
  sourcePage,
  onRemoveCartTalent,
}: GuestDockLineupViewProps) {
  const C = paletteFor(surfaceMode);
  // Shelf A — the inquiry lineup (cart). Same projection the launcher rail uses:
  // cartIds (membership) joined with the registry (presentation only).
  const cart = useInquiryCart();
  const registry = useCartTalentRegistry();
  const cartTalents = useCartTalents(registry);

  // Shelf B — saved favorites (client_favorites facade; guest localStorage
  // mirror for signed-out visitors). Metadata via the existing public batch
  // lookup — the exact reader the favorites modal uses.
  const favorites = useFavorites();
  const favoriteIds = favorites.favoriteIds;
  const favoritesKey = [...favoriteIds].join(",");
  const [savedTiles, setSavedTiles] = useState<SavedTile[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  useEffect(() => {
    if (favoritesKey.length === 0) {
      setSavedTiles([]);
      return;
    }
    let cancelled = false;
    setSavedLoading(true);
    fetch("/api/directory/talents-by-ids", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ ids: favoritesKey.split(",") }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: { talents: DirectoryTalentMini[] }) => {
        if (cancelled) return;
        setSavedTiles(
          (data.talents ?? []).map((mini) => ({
            id: mini.id,
            name: mini.displayName,
            profileCode: mini.profileCode,
            photoUrl: mini.photoUrl,
            meta: mini.primaryTypeLabel,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setSavedTiles([]);
      })
      .finally(() => {
        if (!cancelled) setSavedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [favoritesKey]);

  // The favorites-modal bridge, per tile: ADD the saved talent to the inquiry
  // lineup (saved_talent) via the canonical cart facade. The favorite itself is
  // untouched — no store merge, ever. The registry gets the face so the
  // launcher rail + Shelf A render the portrait immediately; the open panel's
  // useCartTalentPreload mirrors the new cart set into the inquiry record.
  function moveToInquiry(tile: SavedTile) {
    if (cart.isInCart(tile.id)) return;
    registerCartTalent(tile.id, { displayName: tile.name, portraitUrl: tile.photoUrl });
    cart.setInCart(
      { talentProfileId: tile.id, profileCode: tile.profileCode ?? "", displayName: tile.name },
      true,
      sourcePage,
    );
  }

  const rowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "7px 14px",
  } as const;

  const nameStyle = {
    fontSize: 13,
    fontWeight: 600,
    color: C.ink,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: FONT,
  } as const;

  return (
    <div
      data-guest-dock-view="lineup"
      style={{ flex: 1, minHeight: 0, overflowY: "auto", background: C.surface, paddingBottom: 10 }}
    >
      {/* ── Shelf A: the inquiry lineup (saved_talent) ─────────────────────── */}
      <ShelfHeader
        label={t("public.guestChat.dockLineupShelfInquiry")}
        count={cartTalents.length}
        C={C}
      />
      {cartTalents.length === 0 ? (
        <EmptyShelfNote text={t("public.guestChat.dockLineupEmptyInquiry")} C={C} />
      ) : (
        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {cartTalents.map((talent) => (
            <li key={talent.talentProfileId} style={rowStyle}>
              <FaceTile photoUrl={talent.portraitUrl} name={talent.displayName} C={C} />
              <span style={{ ...nameStyle, flex: 1, minWidth: 0 }}>{talent.displayName}</span>
              {onRemoveCartTalent && (
                <button
                  type="button"
                  aria-label={interpolate(t("public.guestChat.talentRemoveAria"), {
                    name: talent.displayName,
                  })}
                  onClick={() => onRemoveCartTalent(talent.talentProfileId)}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    border: `1px solid ${C.borderSoft}`,
                    background: "transparent",
                    color: C.inkMuted,
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1,
                    flexShrink: 0,
                    fontFamily: FONT,
                  }}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ── Shelf B: saved favorites (client_favorites) ────────────────────── */}
      <ShelfHeader
        label={t("public.guestChat.dockLineupShelfSaved")}
        count={savedTiles.length}
        C={C}
      />
      {savedLoading && savedTiles.length === 0 ? (
        <div
          aria-live="polite"
          style={{ padding: "4px 14px", fontSize: 11.5, color: C.inkDim, fontFamily: FONT }}
        >
          {t("public.guestChat.dockLoading")}
        </div>
      ) : savedTiles.length === 0 ? (
        <EmptyShelfNote text={t("public.guestChat.dockLineupEmptySaved")} C={C} />
      ) : (
        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {savedTiles.map((tile) => {
            const inLineup = cart.isInCart(tile.id);
            const pending = cart.isPending(tile.id);
            return (
              <li key={tile.id} style={rowStyle}>
                <FaceTile photoUrl={tile.photoUrl} name={tile.name} C={C} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ ...nameStyle, display: "block" }}>{tile.name}</span>
                  {tile.meta && (
                    <span
                      style={{
                        display: "block",
                        fontSize: 10.5,
                        color: C.inkDim,
                        fontFamily: FONT,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tile.meta}
                    </span>
                  )}
                </span>
                {inLineup ? (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: C.inkMuted,
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: C.surfaceCool,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      fontFamily: FONT,
                    }}
                  >
                    {t("public.guestChat.dockLineupInInquiry")}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => moveToInquiry(tile)}
                    style={{
                      border: "none",
                      borderRadius: 999,
                      padding: "5px 10px",
                      background: accent,
                      color: accentInk,
                      fontSize: 10.5,
                      fontWeight: 700,
                      cursor: pending ? "default" : "pointer",
                      opacity: pending ? 0.6 : 1,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      fontFamily: FONT,
                    }}
                  >
                    {t("public.guestChat.dockLineupMoveToInquiry")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
