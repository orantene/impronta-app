import Link from "next/link";
import { Search } from "lucide-react";

import { createTranslator } from "@/i18n/messages";
import { withLocalePath } from "@/i18n/pathnames";
import { getRequestLocaleUrlSettings } from "@/i18n/tenant-url-locale";
import type { Locale } from "@/i18n/config";
import {
  HeaderWidgetGlyph,
  HeaderWidgetPlaceholder,
} from "../shared/header-widget";
import type { SectionComponentProps } from "../types";
import type { HeaderSearchV1 } from "./schema";

/**
 * WS-A A5 — header SEARCH widget. The live header mounts a Search icon linking
 * to the directory (see `PublicHeader`); this curated embed reproduces that
 * exact affordance for the shell builder.
 *
 *   - editor canvas (`preview`)  → a static placeholder chip (no link side
 *     effects, no data — safe on the canvas).
 *   - published shell            → the real Search → /directory link, locale +
 *     path-prefix resolved like the legacy header.
 */
export async function HeaderSearchComponent({
  props,
  preview,
  locale,
  publicPathPrefix = "",
}: SectionComponentProps<HeaderSearchV1>) {
  const t = createTranslator(locale as Locale);
  const ariaLabel = t("public.header.searchTalentAria");

  if (preview) {
    return (
      <HeaderWidgetPlaceholder
        icon={props.icon}
        typeKey="header_search"
        label="Search"
        glyph={
          <HeaderWidgetGlyph>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
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
  const href = `${publicPathPrefix}${withLocalePath("/directory", locale as Locale, pathSettings)}`;
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="site-header-widget-embed site-header-widget-embed--search inline-flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      data-header-widget="header_search"
      data-header-widget-mode="live"
    >
      <Search className="size-5" aria-hidden />
    </Link>
  );
}
