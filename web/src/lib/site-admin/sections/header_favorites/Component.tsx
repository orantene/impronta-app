import Link from "next/link";
import { Bookmark } from "lucide-react";

import { createTranslator } from "@/i18n/messages";
import { withLocalePath } from "@/i18n/pathnames";
import { getRequestLocaleUrlSettings } from "@/i18n/tenant-url-locale";
import type { Locale } from "@/i18n/config";
import {
  HeaderWidgetGlyph,
  HeaderWidgetPlaceholder,
} from "../shared/header-widget";
import type { SectionComponentProps } from "../types";
import type { HeaderFavoritesV1 } from "./schema";

/**
 * WS-A A5 — header FAVORITES widget. The live header's ♥ saved-talent affordance.
 * Rendered as a lightweight bookmark link to the favorites list, locale +
 * path-prefix resolved like the legacy header. (The full discovery DRAWER lives
 * in the coupled inquiry cluster; this is the standalone bookmark entry point.)
 *
 *   - editor canvas (`preview`)  → a static placeholder chip.
 *   - published shell            → the real bookmark → favorites link.
 */
export async function HeaderFavoritesComponent({
  props,
  preview,
  locale,
  publicPathPrefix = "",
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
  // for it. The tenant's grammar decides whether the ACTIVE locale is the
  // unprefixed one; the platform fallback gets that backwards on any tenant
  // whose default locale is not the platform default.
  const pathSettings = await getRequestLocaleUrlSettings();
  const href = `${publicPathPrefix}${withLocalePath("/client/favorites", locale as Locale, pathSettings)}`;
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="site-header-widget-embed site-header-widget-embed--favorites inline-flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      data-header-widget="header_favorites"
      data-header-widget-mode="live"
    >
      {/* size-4, NOT size-5: every sibling header icon is hosted in <Button>,
          which forces `[&_svg]:size-4` (16px) on its glyph. This widget is a
          plain link, so a size-5 glyph rendered 20px and read as an oddly
          oversized icon next to the others (owner report 2026-08-21). */}
      <Bookmark className="size-4" aria-hidden />
    </Link>
  );
}
