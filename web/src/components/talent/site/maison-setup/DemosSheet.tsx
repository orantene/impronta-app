"use client";

/** Phone Demos sheet (P4, cr_demos / fg_demos). One sheet at a time. */
import type { GalleryDemo, GalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { countUsableDemos } from "@/lib/talent-site/theme-catalog/usable-demos";
import type { MaisonSetupLocale } from "./maison-setup-copy";
import { DemoCard } from "./DemoStrip";
import { demosCountLabel, detailT } from "./theme-detail-copy";

export function PhoneSheet({
  sheet,
  onClose,
  children,
}: {
  sheet: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end bg-black/30 md:hidden"
      data-maison-phone-sheet={sheet}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[85vh] w-full overflow-auto rounded-t-2xl bg-white px-4 pb-6 pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-black/15" />
        {children}
      </div>
    </div>
  );
}

export function SheetHeader({
  title,
  locale,
  onClose,
  testId,
}: {
  title: string;
  locale: MaisonSetupLocale;
  onClose: () => void;
  testId: string;
}) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <h2 className="text-[16px] font-semibold text-admin-ink">{title}</h2>
      <button
        type="button"
        aria-label={detailT(locale, "Close")}
        data-testid={testId}
        className="grid h-11 w-11 place-items-center text-[18px] text-admin-ink"
        onClick={onClose}
      >
        ✕
      </button>
    </div>
  );
}

export function DemosSheet({
  design,
  demos,
  selectedKey,
  description,
  colorsKept,
  locale,
  onSelect,
  onClose,
}: {
  design: GalleryDesign;
  demos: GalleryDemo[];
  selectedKey: string | null;
  description: string;
  colorsKept: boolean;
  locale: MaisonSetupLocale;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <PhoneSheet sheet="demos" onClose={onClose}>
      <SheetHeader
        title={demosCountLabel(locale, countUsableDemos(demos))}
        locale={locale}
        onClose={onClose}
        testId="maison-phone-demos-close"
      />
      <p className="text-[13px] text-admin-ink-muted">{description}</p>
      <p className="mt-3 text-[12.5px] text-admin-ink-dim">
        {detailT(
          locale,
          colorsKept
            ? "Switching demo changes photos, sample text and sections. Colors change only when you pick a palette."
            : "Each demo can change photos, sample text, sections and its default colors.",
        )}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {demos.map((demo) => (
          <DemoCard
            key={demo.key}
            design={design}
            demo={demo}
            selected={demo.key === selectedKey}
            locale={locale}
            onSelect={onSelect}
            wide
          />
        ))}
      </div>
    </PhoneSheet>
  );
}
