"use client";

/**
 * Colors: desktop swatch row + phone Colors sheet (P4). Palettes come from
 * gallery-meta for EVERY design. Custom colors replaces the sheet (the host
 * closes the sheet before opening the panel; never a sheet on a sheet).
 */
import type { GalleryDesign, GalleryPalette } from "@/lib/talent-site/theme-catalog/gallery-meta";
import type { MaisonCustomPaletteStored } from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import type { MaisonSetupLocale } from "./maison-setup-copy";
import { PhoneSheet, SheetHeader } from "./DemosSheet";
import { detailT } from "./theme-detail-copy";

export type ColorsProps = {
  design: GalleryDesign;
  locale: MaisonSetupLocale;
  /** Selected named palette key, or null when custom colors are on. */
  selectedKey: string | null;
  demoPaletteKey: string;
  customPalette: MaisonCustomPaletteStored | null;
  usingCustom: boolean;
  onPick: (key: string) => void;
  onUseCustom: () => void;
  onOpenCustom: () => void;
  onUseDemoColors: () => void;
};

export function swatchStyle(section: string, accent: string): React.CSSProperties {
  return { background: `linear-gradient(135deg, ${section} 50%, ${accent} 50%)` };
}

function paletteName(p: GalleryPalette, locale: MaisonSetupLocale) {
  return locale === "es" ? p.name.es : p.name.en;
}

export function ColorSwatches(props: ColorsProps) {
  const { design, locale, selectedKey, customPalette, usingCustom } = props;
  return (
    <div data-maison-palette-swatches="" className="flex flex-wrap items-center gap-2">
      {design.palettes.map((p) => {
        const selected = !usingCustom && selectedKey === p.key;
        return (
          <button
            key={p.key}
            type="button"
            data-maison-palette={p.key}
            data-testid={`maison-palette-${p.key}`}
            aria-label={paletteName(p, locale)}
            aria-pressed={selected}
            title={paletteName(p, locale)}
            onClick={() => props.onPick(p.key)}
            className={`relative min-h-11 min-w-11 rounded-full p-1 ${
              selected ? "ring-2 ring-admin-ink ring-offset-2" : ""
            }`}
          >
            <span className="block h-9 w-9 rounded-full" style={swatchStyle(p.section, p.accent)} />
          </button>
        );
      })}
      {customPalette ? (
        <button
          type="button"
          data-testid="maison-palette-custom"
          aria-label={locale === "es" ? customPalette.name.es : customPalette.name.en}
          aria-pressed={usingCustom}
          onClick={props.onUseCustom}
          className={`relative min-h-11 min-w-11 rounded-full p-1 ${
            usingCustom ? "ring-2 ring-admin-ink ring-offset-2" : ""
          }`}
        >
          <span
            className="block h-9 w-9 rounded-full"
            style={swatchStyle(customPalette.fields.section, customPalette.fields.accent)}
          />
        </button>
      ) : null}
      <button
        type="button"
        data-testid="maison-custom-colors"
        onClick={props.onOpenCustom}
        className="min-h-11 rounded-full border border-admin-border-soft px-3 text-[12.5px] font-semibold text-admin-ink"
      >
        ✎ {detailT(locale, "Custom colors")}
      </button>
    </div>
  );
}

export function ColorsSheet(props: ColorsProps & { onClose: () => void; isDemoDefault: boolean }) {
  const { design, locale, selectedKey, customPalette, usingCustom, demoPaletteKey } = props;
  return (
    <PhoneSheet sheet="colors" onClose={props.onClose}>
      <SheetHeader
        title={detailT(locale, "Colors")}
        locale={locale}
        onClose={props.onClose}
        testId="maison-phone-colors-close"
      />
      <ul className="mt-3 space-y-1">
        {design.palettes.map((p) => {
          const selected = !usingCustom && selectedKey === p.key;
          return (
            <li key={p.key}>
              <button
                type="button"
                data-testid={`maison-phone-palette-${p.key}`}
                onClick={() => props.onPick(p.key)}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-admin-surface-alt"
              >
                <span className="h-9 w-9 shrink-0 rounded-full" style={swatchStyle(p.section, p.accent)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-admin-ink">
                    {paletteName(p, locale)}
                  </span>
                  {p.key === demoPaletteKey ? (
                    <span className="text-[11.5px] text-admin-ink-dim">{detailT(locale, "Demo colors")}</span>
                  ) : p.highContrast ? (
                    <span className="text-[11.5px] text-admin-ink-dim">{detailT(locale, "High contrast")}</span>
                  ) : null}
                </span>
                {selected ? <span aria-label={detailT(locale, "Selected")}>✓</span> : null}
              </button>
            </li>
          );
        })}
        {customPalette ? (
          <li>
            <button
              type="button"
              data-testid="maison-phone-my-colors"
              onClick={props.onUseCustom}
              className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-admin-surface-alt"
            >
              <span
                className="h-9 w-9 shrink-0 rounded-full"
                style={swatchStyle(customPalette.fields.section, customPalette.fields.accent)}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-admin-ink">
                  {locale === "es" ? customPalette.name.es : customPalette.name.en}
                </span>
                <span className="text-[11.5px] text-admin-ink-dim">
                  {detailT(locale, "My colors")} · {detailT(locale, "the same when you switch demos")}
                </span>
              </span>
              {usingCustom ? <span aria-label={detailT(locale, "Selected")}>✓</span> : null}
            </button>
          </li>
        ) : null}
      </ul>
      <button
        type="button"
        data-testid="maison-phone-custom-colors"
        className="mt-2 flex min-h-[52px] w-full items-center rounded-xl border border-admin-border-soft px-3 text-[13.5px] font-semibold"
        onClick={props.onOpenCustom}
      >
        ✎ {detailT(locale, "Custom colors")} ›
      </button>
      {!props.isDemoDefault ? (
        <button
          type="button"
          data-testid="maison-phone-use-demo-colors"
          className="mt-2 min-h-11 w-full text-[13px] font-semibold text-emerald-900"
          onClick={props.onUseDemoColors}
        >
          {detailT(locale, "Use demo colors")}
        </button>
      ) : null}
      <p className="mt-3 text-[12px] text-admin-ink-dim">
        {detailT(locale, "Only colors change. Photos, content and layout stay.")}
      </p>
    </PhoneSheet>
  );
}
