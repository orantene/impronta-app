"use client";

/**
 * "Demos · N" strip (P4). Built demos swap the preview; planned demos show
 * "Preview planned" and cannot be selected. Thumbnails are the demo's own
 * palette (data values from gallery-meta), since demos carry no image yet.
 */
import type { GalleryDemo, GalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";
import type { MaisonSetupLocale } from "./maison-setup-copy";
import { demoDefaultPaletteKey } from "./theme-detail-model";
import { demosCountLabel, detailT } from "./theme-detail-copy";

export function demoThumbStyle(design: GalleryDesign, demo: GalleryDemo): React.CSSProperties {
  const key = demoDefaultPaletteKey(design, demo);
  const p = design.palettes.find((x) => x.key === key) ?? design.palettes[0];
  return p ? { background: `linear-gradient(135deg, ${p.section}, ${p.accent})` } : {};
}

export function DemoCard({
  design,
  demo,
  selected,
  locale,
  onSelect,
  wide = false,
}: {
  design: GalleryDesign;
  demo: GalleryDemo;
  selected: boolean;
  locale: MaisonSetupLocale;
  onSelect: (key: string) => void;
  wide?: boolean;
}) {
  const planned = demo.status !== "built";
  const name = locale === "es" ? demo.name.es : demo.name.en;
  return (
    <button
      type="button"
      data-testid={`maison-demo-card-${demo.key}`}
      data-demo-status={demo.status}
      aria-pressed={selected}
      aria-disabled={planned}
      disabled={planned}
      onClick={() => onSelect(demo.key)}
      className={`flex shrink-0 flex-col overflow-hidden rounded-lg border-2 bg-white text-left ${
        wide ? "w-full" : "w-[132px]"
      } ${selected ? "border-admin-ink" : "border-admin-border-soft"} ${
        planned ? "cursor-not-allowed opacity-60" : ""
      }`}
    >
      <span className="block h-[74px] w-full" style={demoThumbStyle(design, demo)} />
      <span className="flex min-h-11 items-center justify-between gap-1 px-2 py-1.5 text-[11.5px] font-semibold text-admin-ink">
        <span className="min-w-0">
          <span className="block truncate">{name}</span>
          {planned ? (
            <span className="block text-[10.5px] font-medium text-admin-ink-dim">
              {detailT(locale, "Preview planned")}
            </span>
          ) : null}
        </span>
        {selected ? <span aria-hidden>✓</span> : null}
      </span>
    </button>
  );
}

export function DemoStrip({
  design,
  demos,
  selectedKey,
  locale,
  onSelect,
}: {
  design: GalleryDesign;
  demos: GalleryDemo[];
  selectedKey: string | null;
  locale: MaisonSetupLocale;
  onSelect: (key: string) => void;
}) {
  return (
    <div data-maison-demo-strip="" className="flex flex-col gap-2">
      <span className="text-[12px] font-semibold text-admin-ink-dim">
        {demosCountLabel(locale, demos.length)}
      </span>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {demos.map((demo) => (
          <DemoCard
            key={demo.key}
            design={design}
            demo={demo}
            selected={demo.key === selectedKey}
            locale={locale}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
