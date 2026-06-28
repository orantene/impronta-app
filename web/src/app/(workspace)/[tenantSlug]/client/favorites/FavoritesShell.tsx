"use client";

// FavoritesShell — viewer for /client/favorites.
//
// Lighter than the Discover grid (no filter chips, no availability strips).
// Just the talents the client hearted, with a quick remove-from-favorites
// affordance. Click a card to open the talent's public page in a new tab —
// the in-app drawer lives on Discover; from here we deep-link to the
// canonical /t/<profileCode>.
//
// D4 — favorites are now the canonical store. The bespoke
// `DELETE /api/discover/favorites/:id` fetch is retired; the per-card
// favorite control is the shared <TalentCardActions>, wired through
// useFavorites() → client_favorites. Un-favoriting a card here drops it
// from the list reactively (no page reload).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DiscoverShortlistTalent } from "../../_data-bridge/discover";
import { TalentCardActions } from "@/components/talent-cards/talent-card-actions";
import { TalentCard } from "@/components/talent-cards/TalentCard";
import type { CanonicalTalentCardData } from "@/components/talent-cards/talent-card-shape";
import {
  cardDesignToCssVars,
  type CardDesign,
} from "@/lib/site-admin/server/card-design-shape";
import { useFavorites } from "@/lib/talent-cards/use-favorites";

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

export function FavoritesShell({
  favorites,
  tenantSlug,
  cardDesign,
  locale = "en",
}: {
  favorites: DiscoverShortlistTalent[];
  tenantSlug: string;
  /** Workspace UI locale (request locale) so the remove-undo toast localizes. */
  locale?: string;
  /**
   * Shell-tenant card palette (load-card-design bridge → resolveCardDesign).
   * Spread as inline `--token-card-*` vars on each canonical card root so the
   * favorites grid paints the dashboard tenant's palette (it escapes the
   * storefront `<html>` cascade). Optional — un-wired pages inherit the theme
   * through the `var(--token-card-*, …)` fallback chain.
   */
  cardDesign?: CardDesign;
}) {
  const { isFavorited } = useFavorites();
  const cardCssVars = useMemo(
    () => (cardDesign ? cardDesignToCssVars(cardDesign) : undefined),
    [cardDesign],
  );

  // SSR renders the full server list. Once the canonical store has
  // hydrated (DiscoveryStateBridge runs in the client layout, an effect
  // ancestor of this page), filter to talents still favorited — so
  // un-favoriting a card via <TalentCardActions> drops it immediately.
  // The pre-hydration gate avoids a one-frame "all removed" flash.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const visible = hydrated
    ? favorites.filter((f) => isFavorited(f.talentId))
    : favorites;

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
            talent={t}
            tenantSlug={tenantSlug}
            cardCssVars={cardCssVars}
            locale={locale}
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

/** Map a saved-favorite talent to the canonical `<TalentCard>` data shape.
 *  Favorites is browse-only with no availability snapshot, so the availability
 *  line is suppressed (showAvailability:false) and a neutral label is carried. */
function toFavoriteCardData(
  talent: DiscoverShortlistTalent,
  nameHref: string,
): CanonicalTalentCardData {
  return {
    id: talent.talentId,
    name: talent.displayName,
    profileCode: talent.profileCode,
    profileHref: nameHref,
    primaryType: talent.primaryTypeLabel,
    location:
      [talent.homeCity, talent.homeCountry].filter(Boolean).join(" · ") || null,
    photoUrl: talent.headshotUrl,
    agencyName: talent.agencyName,
    isExclusive: talent.isExclusive,
    availabilityLabel: "Availability on request",
    availabilityKnown: false,
    availableDaysInNext30: null,
  };
}

function FavoriteCard({
  talent,
  tenantSlug,
  cardCssVars,
  locale = "en",
}: {
  talent: DiscoverShortlistTalent;
  tenantSlug: string;
  cardCssVars: Record<string, string> | undefined;
  /** Workspace UI locale (request locale) so the remove-undo toast localizes. */
  locale?: string;
}) {
  const router = useRouter();

  // Open the canonical public profile when the talent has a profile code;
  // otherwise keep the user on Discover (the in-app detail drawer lives
  // there — drawer state is client-side and not deep-linkable).
  const nameHref = talent.profileCode
    ? `/t/${talent.profileCode}`
    : `/${tenantSlug}/client/discover`;

  // Canonical card (editorial: photo + info block below). rootMode="button"
  // (NOT "link") so the favorite control nested in badgeSlot stays a valid
  // <button> — a <button> inside an <a> is invalid HTML and warns at hydrate.
  // onActivate navigates to the same destination the prior name link used, so
  // the whole tile is the (larger) hit target without the nested-anchor hazard.
  // The favorite control's own onClick stops propagation, so tapping the heart
  // never navigates; un-favoriting drops the card from the list via useFavorites.
  return (
    <TalentCard
      data={toFavoriteCardData(talent, nameHref)}
      style="editorial"
      aspect="4:5"
      cssVars={cardCssVars}
      nameFallback="first_name"
      rootMode="button"
      onActivate={() => router.push(nameHref)}
      show={{
        showName: true,
        showTalentType: true,
        showLocation: true,
        showBadges: true,
        showAvailability: false,
      }}
      badgeSlot={
        // Canonical favorite control — toggles client_favorites via
        // useFavorites(). Un-favoriting drops this card from the list.
        // stopPropagation on keydown so Enter/Space on the heart doesn't also
        // fire the card root's onActivate (which would navigate away).
        <div
          style={{ position: "absolute", top: 8, right: 8, zIndex: 1, pointerEvents: "auto" }}
          onKeyDown={(e) => { e.stopPropagation(); }}
        >
          <TalentCardActions
            talentProfileId={talent.talentId}
            profileCode={talent.profileCode ?? ""}
            displayName={talent.displayName}
            sourcePage="client-dashboard"
            variant="compact"
            locale={locale}
            hideInquiry
          />
        </div>
      }
    />
  );
}
