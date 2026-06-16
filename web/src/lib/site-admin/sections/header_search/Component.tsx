import Link from "next/link";
import { Search } from "lucide-react";

import { createTranslator } from "@/i18n/messages";
import { withLocalePath } from "@/i18n/pathnames";
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
export function HeaderSearchComponent({
  preview,
  locale,
  publicPathPrefix = "",
}: SectionComponentProps<HeaderSearchV1>) {
  const t = createTranslator(locale as Locale);
  const ariaLabel = t("public.header.searchTalentAria");

  if (preview) {
    return (
      <HeaderWidgetPlaceholder
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

  const href = `${publicPathPrefix}${withLocalePath("/directory", locale as Locale)}`;
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
