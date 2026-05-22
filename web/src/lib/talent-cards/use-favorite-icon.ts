"use client";

/**
 * Lane G / G5 — read the per-tenant `favoriteIcon` branding token.
 *
 * The token is projected onto `<html data-token-favorite-icon="…">` by the
 * design-token pipeline (`resolve.ts` → root layout). `<TalentCardActions>`
 * itself renders both glyphs and lets CSS pick the visible one (SSR-safe,
 * no flash); this hook is for consumers that need the resolved value in JS
 * (analytics, labels). It defaults to `heart` and reconciles on mount.
 *
 * See `./contracts` for `FavoriteIconStyle` + the data-attribute name.
 */

import { useEffect, useState } from "react";

import {
  FAVORITE_ICON_DATA_ATTR,
  FAVORITE_ICON_DEFAULT,
  type FavoriteIconStyle,
} from "./contracts";

export function useFavoriteIcon(): FavoriteIconStyle {
  const [icon, setIcon] = useState<FavoriteIconStyle>(FAVORITE_ICON_DEFAULT);

  useEffect(() => {
    const raw = document.documentElement.getAttribute(FAVORITE_ICON_DATA_ATTR);
    setIcon(raw === "bookmark" ? "bookmark" : "heart");
  }, []);

  return icon;
}
