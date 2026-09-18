import { createTranslator } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import { getFavoriteTalentIds } from "@/lib/public-discovery";
import { HeaderFavoritesLauncher } from "./HeaderFavoritesLauncher";
import {
  HeaderWidgetGlyph,
  HeaderWidgetPlaceholder,
} from "../shared/header-widget";
import type { SectionComponentProps } from "../types";
import type { HeaderFavoritesV1 } from "./schema";

/**
 * WS-A A5 — header FAVORITES widget. The live header's ♥ saved-talent affordance.
 * Opens the chat dock on its Lineup view (the one favorites surface since DOCK
 * v2.1); it used to link to /client/favorites, a dead end for guests.
 *
 *   - editor canvas (`preview`)  → a static placeholder chip.
 *   - published shell            → the real heart/bookmark → dock Lineup.
 */
export async function HeaderFavoritesComponent({
  props,
  preview,
  locale,
}: SectionComponentProps<HeaderFavoritesV1>) {
  const t = createTranslator(locale as Locale);
  const ariaLabel = t("public.header.directoryShortlistAria");

  if (preview) {
    return (
      <HeaderWidgetPlaceholder
        icon={props.icon}
        typeKey="header_favorites"
        label="Favorites"
        glyph={
          <HeaderWidgetGlyph>
            <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
          </HeaderWidgetGlyph>
        }
      />
    );
  }

  // Awaited AFTER the preview early-return so the editor canvas never pays
  // for it. Cookie-scoped guest RPC / client_favorites read, request-cached
  // (the page's discovery provider reads the same list).
  const favoriteIds = await getFavoriteTalentIds();
  return (
    <HeaderFavoritesLauncher
      ariaLabel={ariaLabel}
      initialCount={favoriteIds.length}
    />
  );
}
