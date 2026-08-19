import { headers } from "next/headers";

import { ORIGINAL_PATHNAME_HEADER } from "@/i18n/request-locale";
import { localeUrlSettings, stripLocaleFromPathname } from "@/i18n/pathnames";
import type { Locale } from "@/i18n/config";
import { PublicLanguageToggle } from "@/components/public-language-toggle";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import {
  HeaderWidgetGlyph,
  HeaderWidgetPlaceholder,
} from "../shared/header-widget";
import type { SectionComponentProps } from "../types";
import type { HeaderLanguageV1 } from "./schema";

/**
 * Header LANGUAGE widget — the EN | ES toggle as a freeform-embeddable section.
 *
 *   - editor canvas (`preview`) → a static placeholder chip (no headers(), no
 *     DB read, no navigation side effects — safe on the canvas).
 *   - published shell           → the real `<PublicLanguageToggle>`.
 *
 * The live branch mirrors `HeaderAuthArea` exactly (see its language block):
 * read the tenant's published locales, build the URL grammar from THAT pair
 * rather than the platform default, then strip the locale prefix off the
 * ORIGINAL request path so each link points at the same page in the other
 * language. Getting the grammar from the tenant matters — the platform
 * fallback assumes an `en` default and inverts the prefix for any tenant whose
 * default locale is not `en`.
 *
 * `PublicLanguageToggle` self-hides when `availableLocales.length <= 1`, so a
 * single-language tenant renders nothing rather than a dead one-item switch.
 */
export async function HeaderLanguageComponent({
  props,
  preview,
  tenantId,
  locale,
}: SectionComponentProps<HeaderLanguageV1>) {
  if (preview) {
    return (
      <HeaderWidgetPlaceholder
        icon={props.icon}
        typeKey="header_language"
        label="EN | ES"
        glyph={
          <HeaderWidgetGlyph>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" />
          </HeaderWidgetGlyph>
        }
      />
    );
  }

  // Awaited AFTER the preview early-return so the editor canvas never pays for
  // the locale read or the headers() access.
  const localeSettings = await loadTenantLocaleSettings(tenantId);
  const availableLocales = localeSettings.supportedLocales as readonly Locale[];
  const defaultLocale = localeSettings.defaultLocale as Locale;

  const h = await headers();
  const originalPath = h.get(ORIGINAL_PATHNAME_HEADER) ?? "/";
  const pathSettings = localeUrlSettings(defaultLocale, availableLocales);
  const { pathnameWithoutLocale } = stripLocaleFromPathname(
    originalPath,
    pathSettings,
  );

  return (
    <span
      className="site-header-widget-embed site-header-widget-embed--language inline-flex items-center"
      data-header-widget="header_language"
      data-header-widget-mode="live"
    >
      <PublicLanguageToggle
        activeLocale={locale as Locale}
        pathnameWithoutLocale={pathnameWithoutLocale}
        availableLocales={availableLocales}
        defaultLocale={defaultLocale}
      />
    </span>
  );
}
