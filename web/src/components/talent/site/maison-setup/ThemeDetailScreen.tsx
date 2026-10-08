"use client";

/**
 * cr_detail / fg_th_* — Theme detail desktop + phone (W27–W34, P4).
 * Demo strip + demo switching (gallery-meta demos), colors for every design,
 * colors kept on demo switch, phone Demos / Colors sheets.
 * Use this design → applyMaisonDesignAction → Review (W35).
 */
import { useEffect, useState, useTransition } from "react";
import {
  MAISON_PALETTES,
  MAISON_STARTER_COUNTS,
  type MaisonPaletteKey,
} from "@/lib/talent-site/theme-catalog/maison/seed";
import { applyMaisonDesignAction } from "@/lib/talent-site/server/maison-apply-actions";
import { publishMaxSiteAction } from "@/lib/talent-site/server/site-management-actions";
import { isThemeApplyBusy, runThemeApply } from "@/lib/talent-site/history/apply-busy";
import {
  buildMaisonCustomPalette,
  defaultCustomFieldsFromPalette,
  maisonCustomLookTokens,
  type MaisonCustomColorFields,
  type MaisonCustomPaletteStored,
} from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import { ThemeGalleryPreviewFrame } from "@/components/talent/site/theme-gallery/ThemeGalleryPreviewFrame";
import { galleryPreviewLookSlug } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { useThemePreview } from "@/components/talent/site/theme-gallery/useThemePreview";
import { ImportStarterPanel } from "./ImportStarterPanel";
import { CustomColorsPanel } from "./CustomColorsPanel";
import { PublishColorsDialog, type MaisonColorSwatchRef } from "./PublishColorsDialog";
import { PublishDesignDialog } from "./PublishDesignDialog";
import {
  buildLiveDesignChangeSummary,
  paletteDisplayName,
  type LiveDesignChangeSummary,
} from "./live-design-change";
import { DemoStrip } from "./DemoStrip";
import { DemosSheet } from "./DemosSheet";
import { DemoProfilePanel } from "./DemoProfilePanel";
import { GalleryDesignTags } from "./GalleryDesignTags";
import { AppsTab } from "./GalleryAppsUi";
import { appsForDetail, galleryAppsT } from "./gallery-apps";
import { ColorSwatches, ColorsSheet, swatchStyle, type ColorsProps } from "./ColorsSheet";
import type { MaisonSetupChoices, MaisonPhoneSheet } from "./maison-choices";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";
import { demosCountLabel, detailT, resultsForLabel } from "./theme-detail-copy";
import { countUsableDemos } from "@/lib/talent-site/theme-catalog/usable-demos";
import { demoCardPersonName } from "@/lib/talent-site/demos/demo-profile-meta";
import {
  ContentModeToggle,
  DetailDesktopHeader,
  DetailPhoneHeader,
} from "./ThemeDetailChrome";
import {
  demoDefaultPaletteKey,
  demoPreviewParam,
  demoSwitchPatch,
  detailDesign,
  effectiveColors,
  isMaisonDesign,
  orderedDemos,
  pickPalettePatch,
  previewTokensFor,
  resolveActiveDemo,
  useDemoColorsPatch,
} from "./theme-detail-model";
import { demoHasImportCatalog } from "@/lib/talent-site/theme-catalog/gallery-import-catalog";

type Props = {
  locale: MaisonSetupLocale;
  talentProfileId: string;
  choices: MaisonSetupChoices;
  onChange: (next: Partial<MaisonSetupChoices>) => void;
  onBackToGallery: () => void;
  onClose: () => void;
  onAppliedToReview: () => void;
  /** After colors-only publish on a live site (W68). */
  onColorsPublished?: () => void;
  /** P5: after a live design switch is published; toast "✓ <Design> is live". */
  onDesignPublished?: (toast: string, designSlug: string) => void;
  /** Design currently live (for "Layout: <Old> → <New>"). */
  liveDesignSlug?: string | null;
  /** Current live look — used for before swatch in Publish new colors (W68). */
  liveLookSlug?: string | null;
  liveCustomPalette?: MaisonCustomPaletteStored | null;
  fromLiveSite?: boolean;
  /** Wave 4: open Apps library / app detail from the Apps tab. */
  onBrowseAppsLibrary?: () => void;
  onOpenAppDetail?: (appId: string) => void;
};

export function ThemeDetailScreen({
  locale,
  talentProfileId,
  choices,
  onChange,
  onBackToGallery,
  onClose,
  onAppliedToReview,
  onColorsPublished,
  onDesignPublished,
  liveDesignSlug = null,
  liveLookSlug = null,
  liveCustomPalette = null,
  fromLiveSite = false,
  onBrowseAppsLibrary,
  onOpenAppDetail,
}: Props) {
  const preview = useThemePreview({ talentProfileId, locale });
  const [applyError, setApplyError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [keptToast, setKeptToast] = useState(false);
  const [colorsDialog, setColorsDialog] = useState<{
    before: MaisonColorSwatchRef;
    after: MaisonColorSwatchRef;
  } | null>(null);
  const [publishColorsError, setPublishColorsError] = useState<string | null>(null);
  const [designDialog, setDesignDialog] = useState<LiveDesignChangeSummary | null>(null);
  const [publishDesignError, setPublishDesignError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const design = detailDesign(choices.designSlug);
  const maison = isMaisonDesign(design.slug);
  const demos = orderedDemos(design);
  const { demo, plannedFallback } = resolveActiveDemo(design, choices.demoKey);
  const selectedDemoKey = demo?.key ?? null;
  const detailApps = appsForDetail(design, demo);
  // Wave 4: Apps tab on every finished design (Folio + Gridline included),
  // even when this design has no recommended apps yet.
  const appsTabOn = choices.detailTab === "apps";
  const colors = effectiveColors(design, demo, choices, choices.contentMode);
  const usingCustom = colors.kind === "custom";
  const activeCustom = usingCustom ? choices.customPalette : null;
  const demoPaletteKey = demoDefaultPaletteKey(design, demo);
  const isDemoDefault = colors.kind === "palette" && colors.isDemoDefault;
  const selectedPaletteKey = colors.kind === "palette" ? colors.palette.key : null;
  // A demo talent's own site shown on its default palette already wears its
  // saved Look (server side, F19); pushing the gallery palette would repaint
  // every demo in the design default.
  const demoWearsOwnLook =
    choices.contentMode === "demo" && isDemoDefault && demo?.source.kind === "demo-talent";
  const tokens = demoWearsOwnLook ? null : previewTokensFor(design, colors, choices);
  const loadState = preview.loadState;
  const sendTokens = preview.sendTokens;

  const tokensKey = tokens ? JSON.stringify(tokens) : "";
  useEffect(() => {
    // Re-send after every iframe load too: a demo switch reloads the frame.
    if (tokensKey) sendTokens(JSON.parse(tokensKey) as Record<string, string>);
  }, [tokensKey, loadState, sendTokens]);

  useEffect(() => {
    if (!keptToast) return;
    const t = window.setTimeout(() => setKeptToast(false), 3000);
    return () => window.clearTimeout(t);
  }, [keptToast]);

  const livePaletteKey = ((): MaisonPaletteKey | null => {
    if (!liveLookSlug?.startsWith("maison-")) return null;
    const key = liveLookSlug.slice("maison-".length);
    return key in MAISON_PALETTES ? (key as MaisonPaletteKey) : null;
  })();
  // The design's OWN palette key (Maison: its `maison-*` Look rows), so the
  // preview paints its colours and fonts on first load, not the platform's.
  const lookSlug = selectedPaletteKey ? galleryPreviewLookSlug(design, selectedPaletteKey) : null;
  const showDemoContent = choices.contentMode === "demo";
  const demoParam = showDemoContent ? demoPreviewParam(design.slug, demo) : null;
  const url = preview.src(
    design.slug,
    lookSlug,
    demoParam,
  );
  const designTitle = design.name;
  const description = locale === "es" ? design.description.es : design.description.en;
  const demoTitle = demo ? demoCardPersonName(demo, locale) : "";
  const swatch =
    activeCustom
      ? { section: activeCustom.fields.section, accent: activeCustom.fields.accent }
      : colors.kind === "palette"
        ? colors.palette
        : design.palettes[0]!;
  const paletteName = activeCustom
    ? locale === "es"
      ? activeCustom.name.es
      : activeCustom.name.en
    : colors.kind === "palette"
      ? locale === "es"
        ? colors.palette.name.es
        : colors.palette.name.en
      : "";
  const colorsKept = usingCustom || !isDemoDefault;
  // Wave 3: import entry on every finished design with a non-empty catalog.
  const showImport = demoHasImportCatalog(design.slug, demo);

  const backLabel = fromLiveSite
    ? maisonSetupT(locale, "My website")
    : choices.fromQuery
      ? resultsForLabel(locale, choices.fromQuery)
      : detailT(locale, "All themes");

  const selectDemo = (key: string) => {
    const { patch, kept } = demoSwitchPatch(design, choices, key);
    if (!patch) return;
    onChange(patch);
    if (kept && key !== demo?.key) setKeptToast(true);
  };

  const pickPalette = (key: string) => onChange(pickPalettePatch(design, key));
  const useDemoColors = () => onChange(useDemoColorsPatch(design, demo));
  const useCustom = () =>
    onChange({ useCustomPalette: true, status: "Choices saved", phoneSheet: null });

  const openCustomColors = () => {
    // Custom colors replaces the sheet (never a sheet on a sheet).
    onChange({ phoneSheet: null });
    setCustomOpen(true);
  };

  const openSheet = (sheet: MaisonPhoneSheet) => {
    onChange({ phoneSheet: sheet });
  };

  const handleCustomSaved = (paletteStored: MaisonCustomPaletteStored) => {
    onChange({
      customPalette: paletteStored,
      useCustomPalette: true,
      status: "Choices saved",
      phoneSheet: null,
    });
    setCustomOpen(false);
  };

  const handleCustomPreview = (fields: MaisonCustomColorFields) => {
    preview.sendTokens(maisonCustomLookTokens(buildMaisonCustomPalette(fields)));
  };

  const handleUseDesign = () => {
    // W35 — apply draft immediately (no summary/confirm table).
    // W68 — live colors-only → one Publish new colors dialog.
    startTransition(async () => {
      setApplyError(null);
      const res = await runThemeApply(() => applyMaisonDesignAction({
        paletteKey: maison && selectedPaletteKey ? selectedPaletteKey : choices.paletteKey,
        designSlug: design.slug,
        contentMode: choices.contentMode,
        customPalette: usingCustom && choices.customPalette ? choices.customPalette : null,
        // Non-Maison designs: the gallery-meta palette on screen.
        galleryPaletteKey: !maison && !usingCustom ? selectedPaletteKey : null,
      }));
      if (!res.ok) {
        setApplyError(res.error);
        return;
      }
      if (res.data.livePending && res.data.colorsOnly) {
        setColorsDialog({
          before: { paletteKey: livePaletteKey, customPalette: liveCustomPalette },
          after: { paletteKey: res.data.paletteKey, customPalette: res.data.customPalette },
        });
        onChange({ status: "Choices saved", phoneSheet: null });
        return;
      }
      if (res.data.livePending) {
        // P5 — live design switch: one "Publish <Design>?" review + publish.
        setPublishDesignError(null);
        setDesignDialog(
          buildLiveDesignChangeSummary({
            locale,
            fromSlug: liveDesignSlug,
            toSlug: design.slug,
            paletteName: paletteDisplayName({
              locale,
              designSlug: design.slug,
              lookSlug: res.data.lookSlug,
              customPalette: res.data.customPalette,
            }),
          }),
        );
        onChange({ status: "Choices saved", phoneSheet: null });
        return;
      }
      onChange({ status: "Draft saved", phoneSheet: null, screen: "review" });
      onAppliedToReview();
    });
  };

  const handlePublishColors = () => {
    startTransition(async () => {
      setPublishColorsError(null);
      if (isThemeApplyBusy()) return;
      const res = await publishMaxSiteAction();
      if (!res.ok) {
        setPublishColorsError(res.error);
        return;
      }
      setColorsDialog(null);
      onChange({ status: "Live", phoneSheet: null, screen: "gallery" });
      onColorsPublished?.();
    });
  };

  const handlePublishDesign = () => {
    const summary = designDialog;
    if (!summary) return;
    startTransition(async () => {
      setPublishDesignError(null);
      // Materializes pending_design and writes the design revision (Restore).
      if (isThemeApplyBusy()) return;
      const res = await publishMaxSiteAction();
      if (!res.ok) {
        setPublishDesignError(res.error);
        return;
      }
      setDesignDialog(null);
      onChange({ status: "Live", phoneSheet: null, screen: "gallery" });
      onDesignPublished?.(summary.toast, design.slug);
    });
  };

  const customInitialFields: MaisonCustomColorFields =
    choices.customPalette?.fields ?? defaultCustomFieldsFromPalette(
      colors.kind === "palette" ? colors.palette : design.palettes[0]!,
    );

  const colorsProps: ColorsProps = {
    design,
    locale,
    selectedKey: selectedPaletteKey,
    demoPaletteKey,
    customPalette: choices.customPalette,
    usingCustom,
    onPick: pickPalette,
    onUseCustom: useCustom,
    onOpenCustom: openCustomColors,
    onUseDemoColors: useDemoColors,
  };

  const previewFrame = (
    <div
      data-maison-preview-device={choices.previewDevice}
      className={
        choices.previewDevice === "phone"
          ? "mx-auto w-full max-w-[375px] overflow-hidden rounded-[28px] border-[10px] border-admin-ink shadow-sm"
          : "w-full overflow-hidden rounded-xl border border-admin-border-soft"
      }
    >
      {/* G1-P0-05: demo chip lives on the frame chrome, never over scroll content. */}
      {demoParam ? (
        <div className="flex justify-end border-b border-admin-border-soft/70 bg-admin-canvas/80 px-3 py-1.5">
          <span
            data-testid="gallery-demo-content-chip"
            className="rounded bg-admin-ink/85 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white"
          >
            {maisonSetupT(locale, "DEMO CONTENT")}
          </span>
        </div>
      ) : null}
      <div className="relative">
        <ThemeGalleryPreviewFrame
          preview={preview}
          url={url}
          locale={locale}
          title={designTitle}
          errorTitle={maisonSetupT(locale, "The preview didn't load")}
          errorBody={maisonSetupT(locale, "Your choices are saved. Try again.")}
          retryLabel={maisonSetupT(locale, "Try again")}
          virtualWidth={choices.previewDevice === "phone" ? undefined : 1280}
          aspectRatio={choices.previewDevice === "phone" ? undefined : "16 / 11"}
        />
      </div>
    </div>
  );

  const segment = (
    <ContentModeToggle
      locale={locale}
      mode={choices.contentMode}
      onChange={(mode) => onChange({ contentMode: mode, status: "Choices saved" })}
    />
  );

  const tabStrip = (
    <div
      role="tablist"
      data-testid="maison-detail-tabs"
      data-gallery-wave4-detail-tabs=""
      className="grid grid-cols-2 rounded-lg border border-admin-border-soft p-0.5"
    >
      {(["preview", "apps"] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={tab === "apps" ? appsTabOn : !appsTabOn}
          data-testid={`maison-detail-tab-${tab}`}
          onClick={() => onChange({ detailTab: tab })}
          className={`min-h-11 rounded-md text-[13px] font-semibold ${
            (tab === "apps") === appsTabOn
              ? "bg-admin-surface-alt text-admin-ink ring-1 ring-admin-ink"
              : "bg-transparent text-admin-ink-muted"
          }`}
        >
          {tab === "apps"
            ? detailApps.length > 0
              ? `${galleryAppsT(locale, "apps")} · ${detailApps.length}`
              : galleryAppsT(locale, "apps")
            : maisonSetupT(locale, "Preview")}
        </button>
      ))}
    </div>
  );
  const plannedNote = plannedFallback ? (
    <p data-testid="maison-demo-planned-note" className="text-[12px] text-admin-ink-dim">
      {detailT(locale, "Showing the featured demo · this demo's preview is planned")}
    </p>
  ) : null;

  return (
    <section
      data-maison-theme-detail=""
      data-testid="maison-theme-detail"
      data-design-slug={design.slug}
      className="relative flex min-h-[70vh] flex-col font-admin-body"
    >
      <DetailDesktopHeader
        locale={locale}
        backLabel={backLabel}
        fromLiveSite={fromLiveSite}
        designTitle={designTitle}
        onBack={fromLiveSite ? onClose : onBackToGallery}
        onClose={onClose}
        device={choices.previewDevice}
        onDevice={(device) => onChange({ previewDevice: device })}
        status={choices.status}
        liveStays={fromLiveSite}
      />
      <DetailPhoneHeader
        locale={locale}
        backLabel={backLabel}
        fromLiveSite={fromLiveSite}
        designTitle={designTitle}
        demoTitle={demoTitle}
        paletteName={paletteName}
        onBack={fromLiveSite ? onClose : onBackToGallery}
        onClose={onClose}
        status={choices.status}
      />

      {/* Wave 3: preview-first (~70%) + slim rail */}
      <div className="flex flex-1 flex-col md:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 md:w-[70%] md:p-4">
          <div className="hidden md:block">
            <DemoStrip
              design={design}
              demos={demos}
              selectedKey={selectedDemoKey}
              locale={locale}
              onSelect={selectDemo}
              onOpenApps={(key) => {
                selectDemo(key);
                onChange({ detailTab: "apps" });
              }}
            />
            {plannedNote}
          </div>

          {/* Phone: full-width Demo | My content above the preview */}
          <div className="md:hidden">{segment}</div>
          <div className="md:hidden">{plannedNote}</div>
          {tabStrip}

          <div className="min-h-0 flex-1 overflow-auto">
            {appsTabOn ? (
              <AppsTab
                apps={detailApps}
                locale={locale}
                previewDevice={choices.previewDevice}
                onBrowseAll={onBrowseAppsLibrary}
                onOpenApp={onOpenAppDetail}
              />
            ) : (
              previewFrame
            )}
          </div>
        </div>

        {/* Desktop right panel — slim Wave 3 rail */}
        <aside
          data-maison-inspector=""
          className="hidden w-[280px] shrink-0 flex-col border-l border-admin-border-soft bg-white md:sticky md:top-0 md:flex md:h-[calc(100dvh-6rem)] md:w-[30%] md:max-w-[340px] md:self-start"
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-admin-ink-dim">
                {maisonSetupT(locale, "THEME")}
              </p>
              <p className="mt-1 text-[16px] font-semibold text-admin-ink">
                {designTitle}
                {demoTitle ? (
                  <span className="font-normal text-admin-ink-muted">
                    {" · "}
                    {maisonSetupT(locale, "Demo:")} <span className="font-semibold text-admin-ink">{demoTitle}</span>
                  </span>
                ) : null}
              </p>
              <GalleryDesignTags design={design} locale={locale} onFilter={onBackToGallery} />
            </div>

            <DemoProfilePanel demo={demo} locale={locale} />

            <div>
              <p className="mb-2 text-[13px] font-semibold text-admin-ink">{maisonSetupT(locale, "Show")}</p>
              {segment}
              <p className="mt-2 text-[12px] leading-snug text-admin-ink-muted">
                <span aria-hidden>ⓘ </span>
                {maisonSetupT(
                  locale,
                  choices.contentMode === "demo"
                    ? "Demo photos, text and prices. Nothing is added to your site unless you import it."
                    : "Your profile, services and photos in this design. Sections without content are hidden.",
                )}
              </p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-admin-ink">{detailT(locale, "Colors")}</p>
                {isDemoDefault ? (
                  <span className="text-[12px] text-admin-ink-dim">{detailT(locale, "Demo colors")}</span>
                ) : (
                  <button
                    type="button"
                    data-testid="maison-use-demo-colors"
                    onClick={useDemoColors}
                    className="min-h-11 text-[12px] font-semibold text-emerald-900"
                  >
                    {detailT(locale, "Use demo colors")}
                  </button>
                )}
              </div>
              <ColorSwatches {...colorsProps} />
              <p className="mt-2 text-[13px] font-semibold text-admin-ink" data-testid="maison-palette-name">
                {usingCustom
                  ? `${detailT(locale, "Custom colors")} · ${detailT(locale, "My colors")} · ${detailT(locale, "the same when you switch demos")}`
                  : paletteName}
              </p>
              {colorsKept && !usingCustom ? (
                <p className="mt-1 text-[12px] text-admin-ink-dim" data-testid="maison-colors-kept-note">
                  {detailT(locale, "Switching demo changes photos, sample text and sections. Colors change only when you pick a palette.")}
                </p>
              ) : null}
            </div>

            {showImport ? (
              <div>
                <button
                  type="button"
                  data-testid="maison-import-entry"
                  onClick={() => setImportOpen(true)}
                  className="flex min-h-12 w-full items-center justify-between rounded-xl border border-admin-border-soft px-3 text-left text-[13px] font-semibold text-admin-ink"
                >
                  {detailT(locale, "Use demo content ›")}
                </button>
                <p className="mt-1.5 text-[12px] text-admin-ink-dim">
                  {maison
                    ? `${MAISON_STARTER_COUNTS.total} · `
                    : ""}
                  {maisonSetupT(locale, "Optional. Imported items are saved as drafts.")}
                </p>
              </div>
            ) : null}
          </div>
          <div className="sticky bottom-0 border-t border-admin-border-soft bg-white px-4 py-3">
            {applyError ? (
              <p className="mb-2 text-[12px] text-red-800" data-testid="maison-apply-error">
                {applyError}
              </p>
            ) : null}
            <button
              type="button"
              data-testid="maison-use-design"
              onClick={handleUseDesign}
              disabled={pending}
              className="min-h-12 w-full rounded-xl bg-admin-ink text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {maisonSetupT(locale, "Use this design")}
            </button>
          </div>
        </aside>
      </div>

      {/* Phone bottom bar: Demos · N | Colors | Use this design (never wraps) */}
      <div className="sticky bottom-0 flex flex-nowrap items-center gap-2 border-t border-admin-border-soft bg-white px-3 py-2 md:hidden">
        {applyError ? <span className="sr-only">{applyError}</span> : null}
        <button
          type="button"
          data-testid="maison-phone-demos"
          onClick={() => openSheet("demos")}
          className="min-h-11 shrink-0 whitespace-nowrap rounded-xl border border-admin-border-soft px-3 text-[14px] font-semibold text-admin-ink max-[379px]:px-[9px]"
        >
          {demosCountLabel(locale, countUsableDemos(demos))}
        </button>
        <button
          type="button"
          data-testid="maison-phone-colors"
          onClick={() => openSheet("colors")}
          className="flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-admin-border-soft px-3 text-[14px] font-semibold text-admin-ink max-[379px]:px-[9px]"
        >
          <span className="inline-block h-3.5 w-3.5 rounded-full" style={swatchStyle(swatch.section, swatch.accent)} />
          {detailT(locale, "Colors")}
        </button>
        <button
          type="button"
          data-testid="maison-use-design-phone"
          onClick={handleUseDesign}
          disabled={pending}
          className="min-h-11 min-w-0 flex-1 truncate whitespace-nowrap rounded-xl bg-admin-ink px-3 text-[14px] font-semibold text-white disabled:opacity-50"
        >
          {maisonSetupT(locale, "Use this design")}
        </button>
      </div>

      {/* One sheet at a time (W34) */}
      {choices.phoneSheet === "demos" ? (
        <DemosSheet
          design={design}
          demos={demos}
          selectedKey={selectedDemoKey}
          description={description}
          colorsKept={colorsKept}
          locale={locale}
          onSelect={selectDemo}
          onClose={() => onChange({ phoneSheet: null })}
        />
      ) : choices.phoneSheet === "colors" ? (
        <ColorsSheet {...colorsProps} isDemoDefault={isDemoDefault} onClose={() => onChange({ phoneSheet: null })} />
      ) : null}

      {keptToast ? (
        <div
          role="status"
          data-testid="maison-colors-kept-toast"
          className="fixed bottom-[110px] left-1/2 z-[80] -translate-x-1/2 rounded-full bg-admin-ink px-4 py-2 text-[13px] font-semibold text-white md:bottom-6"
        >
          {detailT(locale, "✓ Colors unchanged")}
        </div>
      ) : null}

      {importOpen ? (
        <ImportStarterPanel
          locale={locale}
          designSlug={design.slug}
          demoKey={selectedDemoKey}
          onClose={() => setImportOpen(false)}
          onContinueDesigning={() => setImportOpen(false)}
        />
      ) : null}

      {customOpen ? (
        <CustomColorsPanel
          locale={locale}
          initialFields={customInitialFields}
          initialName={
            choices.customPalette
              ? locale === "es"
                ? choices.customPalette.name.es
                : choices.customPalette.name.en
              : undefined
          }
          onPreviewFields={handleCustomPreview}
          onClose={() => {
            setCustomOpen(false);
            if (tokens) preview.sendTokens(tokens);
          }}
          onSaved={handleCustomSaved}
        />
      ) : null}

      {colorsDialog ? (
        <PublishColorsDialog
          locale={locale}
          before={colorsDialog.before}
          after={colorsDialog.after}
          pending={pending}
          error={publishColorsError}
          onPublish={handlePublishColors}
          onKeepEditing={() => {
            setColorsDialog(null);
            setPublishColorsError(null);
          }}
        />
      ) : null}
      {designDialog ? (
        <PublishDesignDialog
          locale={locale}
          summary={designDialog}
          pending={pending}
          error={publishDesignError}
          onPublish={handlePublishDesign}
          onKeepEditing={() => {
            setDesignDialog(null);
            setPublishDesignError(null);
          }}
        />
      ) : null}
    </section>
  );
}
