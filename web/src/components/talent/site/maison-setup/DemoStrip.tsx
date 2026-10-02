"use client";

/**
 * "Demos · N" strip (P4 + Wave 2). Cards show the person (name + trade +
 * language chips), not a gradient-only trade tile. Count is usable demos only.
 */
import type { GalleryDemo, GalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { countUsableDemos } from "@/lib/talent-site/theme-catalog/usable-demos";
import {
  demoCardInitials,
  demoCardPersonName,
  demoProfileMetaFor,
} from "@/lib/talent-site/demos/demo-profile-meta";
import type { MaisonSetupLocale } from "./maison-setup-copy";
import { demoDefaultPaletteKey } from "./theme-detail-model";
import { demosCountLabel, detailT } from "./theme-detail-copy";
import { AppBadge } from "./GalleryAppsUi";
import { appsOnDemo } from "./gallery-apps";

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
  onOpenApps,
  wide = false,
}: {
  design: GalleryDesign;
  demo: GalleryDemo;
  selected: boolean;
  locale: MaisonSetupLocale;
  onSelect: (key: string) => void;
  /** App badge click: open Theme detail on the Apps tab for this demo. */
  onOpenApps?: (key: string) => void;
  wide?: boolean;
}) {
  const apps = onOpenApps && demo.status === "built" ? appsOnDemo(demo) : [];
  const planned = demo.status !== "built";
  const person = demoCardPersonName(demo, locale);
  const trade = locale === "es" ? demo.name.es : demo.name.en;
  const meta = demoProfileMetaFor(demo);
  const langChip =
    meta && meta.siteLangs.length
      ? meta.siteLangs.map((l) => l.toUpperCase()).join("·")
      : null;
  const flag = meta?.country === "US" ? "🇺🇸" : meta?.country === "MX" ? "🇲🇽" : null;
  const initials = demoCardInitials(person);

  return (
    <div className={`relative shrink-0 ${wide ? "w-full" : "w-[148px]"}`}>
      <button
        type="button"
        data-testid={`maison-demo-card-${demo.key}`}
        data-demo-status={demo.status}
        data-demo-person={person}
        aria-pressed={selected}
        aria-disabled={planned}
        disabled={planned}
        onClick={() => onSelect(demo.key)}
        className={`flex w-full flex-col overflow-hidden rounded-lg border-2 bg-white text-left ${selected ? "border-admin-ink" : "border-admin-border-soft"} ${
          planned ? "cursor-not-allowed opacity-60" : ""
        }`}
      >
        <span className="relative flex h-[74px] w-full items-center justify-center" style={demoThumbStyle(design, demo)}>
          <span
            aria-hidden
            className="grid h-11 w-11 place-items-center rounded-full bg-white/90 text-[13px] font-semibold text-admin-ink shadow-sm ring-1 ring-black/5"
          >
            {initials}
          </span>
        </span>
        <span className="flex min-h-12 items-start justify-between gap-1 px-2 py-1.5 text-[11.5px] font-semibold text-admin-ink">
          <span className="min-w-0">
            <span className="block truncate" title={person}>
              {person}
            </span>
            <span className="block truncate text-[10.5px] font-medium text-admin-ink-dim" title={trade}>
              {trade}
              {flag || langChip ? (
                <span className="font-normal">
                  {" · "}
                  {flag ? <span aria-hidden>{flag} </span> : null}
                  {langChip}
                </span>
              ) : null}
            </span>
            {planned ? (
              <span className="block text-[10.5px] font-medium text-admin-ink-dim">
                {detailT(locale, "Preview planned")}
              </span>
            ) : null}
          </span>
          {selected ? <span aria-hidden>✓</span> : null}
        </span>
      </button>
      <AppBadge
        apps={apps}
        locale={locale}
        testId={`demo-app-badge-${demo.key}`}
        onOpen={() => onOpenApps?.(demo.key)}
        className="absolute right-1.5 top-1.5"
      />
    </div>
  );
}

export function DemoStrip({
  design,
  demos,
  selectedKey,
  locale,
  onSelect,
  onOpenApps,
}: {
  design: GalleryDesign;
  demos: GalleryDemo[];
  selectedKey: string | null;
  locale: MaisonSetupLocale;
  onSelect: (key: string) => void;
  onOpenApps?: (key: string) => void;
}) {
  return (
    <div data-maison-demo-strip="" className="flex flex-col gap-2">
      <span className="text-[12px] font-semibold text-admin-ink-dim">
        {demosCountLabel(locale, countUsableDemos(demos))}
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
            onOpenApps={onOpenApps}
          />
        ))}
      </div>
    </div>
  );
}
