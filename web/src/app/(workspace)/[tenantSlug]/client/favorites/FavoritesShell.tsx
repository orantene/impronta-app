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
  familyToTalentCardStyle,
  type CardDesign,
} from "@/lib/site-admin/server/card-design-shape";
import { useFavorites } from "@/lib/talent-cards/use-favorites";
import { FavoritesInquireModal } from "./favorites-inquire-modal";
import type { FavoriteModalTalent } from "@/components/directory/favorites-modal-view";
import { EmptyState } from "../_components/EmptyState";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

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
  const t = useT();
  const { isFavorited, setFavorite } = useFavorites();
  const [inquireOpen, setInquireOpen] = useState(false);
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

  const modalTalents: FavoriteModalTalent[] = visible.map((t) => ({
    id: t.talentId,
    name: t.displayName,
    profileCode: t.profileCode,
    photoUrl: t.headshotUrl,
    primaryType: t.primaryTypeLabel,
    location: [t.homeCity, t.homeCountry].filter(Boolean).join(" · ") || null,
    profileHref: t.profileCode ? `/t/${t.profileCode}` : null,
  }));

  if (visible.length === 0) {
    return (
      <EmptyState
        icon="♡"
        title={t("dashboard.clientConfirm.favoritesEmptyTitle")}
        body={t("dashboard.clientConfirm.favoritesEmptyBody")}
        actions={
          <Link
            href={`/${tenantSlug}/client/discover`}
            style={{
              display: "inline-flex", alignItems: "center",
              height: 38, padding: "0 16px", borderRadius: 10,
              background: C.accent, color: "#fff",
              fontSize: 13, fontWeight: 600, textDecoration: "none",
              letterSpacing: -0.1,
            }}
          >
            {t("dashboard.clientConfirm.favoritesEmptyCta")}
          </Link>
        }
      />
    );
  }

  return (
    <div style={{ fontFamily: FONT }}>
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, marginBottom: 16, flexWrap: "wrap",
        }}
      >
        <p style={{ margin: 0, fontSize: 13, color: C.inkMuted }}>
          {interpolate(t("dashboard.clientFavorites.savedPick"), { count: visible.length })}
        </p>
        <button
          type="button"
          onClick={() => setInquireOpen(true)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            height: 38, padding: "0 16px", borderRadius: 10,
            background: C.accent, color: "#fff",
            fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
            letterSpacing: -0.1,
          }}
        >
          {t("dashboard.clientFavorites.selectAndSend")}
        </button>
      </div>
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
            cardStyle={cardDesign ? familyToTalentCardStyle(cardDesign.family) : "editorial"}
            popupDisabled={cardDesign?.profilePopup === "off"}
            locale={locale}
          />
        ))}
      </div>
      <div style={{
        marginTop: 18, padding: 14, borderRadius: 10,
        background: C.surface, border: `1px dashed ${C.borderSoft}`,
        textAlign: "center", color: C.inkMuted, fontSize: 12,
      }}>
        {t("dashboard.clientFavorites.shortlistHintPrefix")}<Link href={`/${tenantSlug}/client/shortlists`} style={{ color: C.accent, fontWeight: 600 }}>{t("dashboard.clientFavorites.shortlistHintLink")}</Link>{t("dashboard.clientFavorites.shortlistHintSuffix")}
      </div>

      <FavoritesInquireModal
        open={inquireOpen}
        onOpenChange={setInquireOpen}
        talents={modalTalents}
        tenantSlug={tenantSlug}
        onRemove={(id) => setFavorite(id, false)}
        onClearAll={() => visible.forEach((t) => setFavorite(t.talentId, false))}
        cardCssVars={cardCssVars}
      />
    </div>
  );
}

/** Map a saved-favorite talent to the canonical `<TalentCard>` data shape.
 *  Favorites is browse-only with no availability snapshot, so the availability
 *  line is suppressed (showAvailability:false) and a neutral label is carried. */
function toFavoriteCardData(
  talent: DiscoverShortlistTalent,
  nameHref: string,
  availabilityLabel: string,
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
    availabilityLabel,
    availabilityKnown: false,
    availableDaysInNext30: null,
  };
}

function FavoriteCard({
  talent,
  tenantSlug,
  cardCssVars,
  cardStyle = "editorial",
  popupDisabled = false,
  locale = "en",
}: {
  talent: DiscoverShortlistTalent;
  tenantSlug: string;
  cardCssVars: Record<string, string> | undefined;
  /** Tenant card family → TalentCard style branch (no more hardcoded editorial). */
  cardStyle?: "portrait" | "editorial";
  /** Tenant `directory.card.profile-popup` ceiling: "off" = hard-navigate so the @modal intercept never fires. */
  popupDisabled?: boolean;
  /** Workspace UI locale (request locale) so the remove-undo toast localizes. */
  locale?: string;
}) {
  const t = useT();
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
      data={toFavoriteCardData(talent, nameHref, t("dashboard.clientFavorites.availabilityOnRequest"))}
      style={cardStyle}
      aspect="4:5"
      cssVars={cardCssVars}
      nameFallback="first_name"
      rootMode="button"
      onActivate={() => {
        // Tenant popup ceiling: soft router.push to /t/<code> would open the
        // @modal intercept; a hard load honors "open the full profile page".
        if (popupDisabled && talent.profileCode) {
          window.location.assign(nameHref);
          return;
        }
        router.push(nameHref);
      }}
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
