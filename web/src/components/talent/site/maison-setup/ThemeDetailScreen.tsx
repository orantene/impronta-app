"use client";

/**
 * cr_detail — Theme detail desktop + phone (W27–W34).
 * Use this design → applyMaisonDesignAction → Review (W35).
 */
import { useEffect, useState, useTransition } from "react";
import {
  MAISON_BUILTIN_DEMO,
  MAISON_BUILTIN_DESIGN,
} from "@/lib/talent-site/theme-catalog/maison/builtins";
import {
  MAISON_DEFAULT_PALETTE_KEY,
  MAISON_PALETTE_ORDER,
  MAISON_PALETTES,
  MAISON_SEED,
  maisonPaletteLookTokens,
  type MaisonPaletteKey,
} from "@/lib/talent-site/theme-catalog/maison/seed";
import { applyMaisonDesignAction } from "@/lib/talent-site/server/maison-apply-actions";
import {
  buildMaisonCustomPalette,
  defaultCustomFieldsFromPalette,
  maisonCustomLookTokens,
  type MaisonCustomColorFields,
  type MaisonCustomPaletteStored,
} from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import { ThemeGalleryPreviewFrame } from "@/components/talent/site/theme-gallery/ThemeGalleryPreviewFrame";
import { useThemePreview } from "@/components/talent/site/theme-gallery/useThemePreview";
import { MaisonTagChips } from "./MaisonTagChips";
import { ImportStarterPanel } from "./ImportStarterPanel";
import { CustomColorsPanel } from "./CustomColorsPanel";
import { MAISON_STARTER_COUNTS } from "@/lib/talent-site/theme-catalog/maison/seed";
import type { MaisonSetupChoices, MaisonPhoneSheet } from "./maison-choices";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";

type Props = {
  locale: MaisonSetupLocale;
  talentProfileId: string;
  choices: MaisonSetupChoices;
  onChange: (next: Partial<MaisonSetupChoices>) => void;
  onBackToGallery: () => void;
  onClose: () => void;
  onAppliedToReview: () => void;
};

export function ThemeDetailScreen({
  locale,
  talentProfileId,
  choices,
  onChange,
  onBackToGallery,
  onClose,
  onAppliedToReview,
}: Props) {
  const preview = useThemePreview({ talentProfileId, locale });
  const [applyError, setApplyError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const lookSlug = `maison-${choices.paletteKey}`;
  const url = preview.src("maison", lookSlug);
  const demoTitle =
    locale === "es" ? MAISON_BUILTIN_DEMO.summary : MAISON_BUILTIN_DEMO.title;
  const description =
    locale === "es"
      ? MAISON_SEED.theme.description.es
      : MAISON_SEED.theme.description.en;
  const namedPalette = MAISON_PALETTES[choices.paletteKey];
  const usingCustom = choices.useCustomPalette && choices.customPalette !== null;
  const activeCustom = usingCustom ? choices.customPalette! : null;
  const palette = activeCustom
    ? {
        section: activeCustom.fields.section,
        accent: activeCustom.fields.accent,
        page: activeCustom.fields.page,
        text: activeCustom.fields.text,
      }
    : namedPalette;
  const paletteName = activeCustom
    ? locale === "es"
      ? activeCustom.name.es
      : activeCustom.name.en
    : locale === "es"
      ? namedPalette.name.es
      : namedPalette.name.en;
  const isDefaultPalette =
    !usingCustom && choices.paletteKey === MAISON_DEFAULT_PALETTE_KEY;

  useEffect(() => {
    if (usingCustom && choices.customPalette) {
      preview.sendTokens(maisonCustomLookTokens(choices.customPalette));
    } else {
      preview.sendTokens(maisonPaletteLookTokens(choices.paletteKey));
    }
  }, [choices.paletteKey, choices.useCustomPalette, choices.customPalette, usingCustom, preview]);

  const setPalette = (key: MaisonPaletteKey) => {
    onChange({
      paletteKey: key,
      useCustomPalette: false,
      status: "Choices saved",
      phoneSheet: null,
    });
  };

  const openCustomColors = () => {
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
    startTransition(async () => {
      setApplyError(null);
      const res = await applyMaisonDesignAction({
        paletteKey: choices.paletteKey,
        contentMode: choices.contentMode,
        customPalette:
          choices.useCustomPalette && choices.customPalette
            ? choices.customPalette
            : null,
      });
      if (!res.ok) {
        setApplyError(res.error);
        return;
      }
      onChange({ status: "Draft saved", phoneSheet: null, screen: "review" });
      onAppliedToReview();
    });
  };

  const customInitialFields: MaisonCustomColorFields =
    choices.customPalette?.fields ??
    defaultCustomFieldsFromPalette(namedPalette);

  const previewFrame = (
    <div
      data-maison-preview-device={choices.previewDevice}
      className={
        choices.previewDevice === "phone"
          ? "mx-auto w-full max-w-[375px] overflow-hidden rounded-[28px] border-[10px] border-admin-ink shadow-sm"
          : "w-full overflow-hidden rounded-xl border border-admin-border-soft"
      }
    >
      <div className="relative">
        <ThemeGalleryPreviewFrame
          preview={preview}
          url={url}
          locale={locale}
          title={MAISON_BUILTIN_DESIGN.title}
        />
        {choices.contentMode === "demo" ? (
          <span className="absolute bottom-3 left-3 rounded bg-admin-ink/85 px-2 py-1 text-[10px] font-bold tracking-wide text-white">
            {maisonSetupT(locale, "DEMO CONTENT")}
          </span>
        ) : null}
      </div>
    </div>
  );

  const segment = (
    <div
      data-maison-content-mode=""
      className="grid grid-cols-2 rounded-lg border border-admin-border-soft p-0.5"
      role="tablist"
      aria-label={maisonSetupT(locale, "Show")}
    >
      {(["demo", "mine"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={choices.contentMode === mode}
          data-testid={`maison-mode-${mode}`}
          onClick={() => onChange({ contentMode: mode, status: "Choices saved" })}
          className={`min-h-[38px] rounded-md text-[13px] font-semibold ${
            choices.contentMode === mode
              ? "bg-admin-ink text-white"
              : "bg-transparent text-admin-ink"
          }`}
        >
          {maisonSetupT(locale, mode === "demo" ? "Demo" : "My content")}
        </button>
      ))}
    </div>
  );

  const swatches = (
    <div data-maison-palette-swatches="" className="flex flex-wrap items-center gap-2">
      {MAISON_PALETTE_ORDER.map((key) => {
        const p = MAISON_PALETTES[key];
        const selected = !usingCustom && choices.paletteKey === key;
        return (
          <button
            key={key}
            type="button"
            data-maison-palette={key}
            data-testid={`maison-palette-${key}`}
            aria-label={locale === "es" ? p.name.es : p.name.en}
            aria-pressed={selected}
            onClick={() => setPalette(key)}
            className={`relative h-[34px] w-[34px] min-h-11 min-w-11 rounded-full p-1 ${
              selected ? "ring-2 ring-admin-ink ring-offset-2" : ""
            }`}
          >
            <span
              className="block h-full w-full rounded-full"
              style={{
                background: `linear-gradient(135deg, ${p.section} 50%, ${p.accent} 50%)`,
              }}
            />
          </button>
        );
      })}
      {choices.customPalette ? (
        <button
          type="button"
          data-testid="maison-palette-custom"
          aria-label={
            locale === "es"
              ? choices.customPalette.name.es
              : choices.customPalette.name.en
          }
          aria-pressed={usingCustom}
          onClick={() =>
            onChange({
              useCustomPalette: true,
              status: "Choices saved",
              phoneSheet: null,
            })
          }
          className={`relative h-[34px] w-[34px] min-h-11 min-w-11 rounded-full p-1 ${
            usingCustom ? "ring-2 ring-admin-ink ring-offset-2" : ""
          }`}
        >
          <span
            className="block h-full w-full rounded-full"
            style={{
              background: `linear-gradient(135deg, ${choices.customPalette.fields.section} 50%, ${choices.customPalette.fields.accent} 50%)`,
            }}
          />
        </button>
      ) : null}
      <button
        type="button"
        data-testid="maison-custom-colors"
        onClick={openCustomColors}
        className="min-h-11 rounded-full border border-admin-border-soft px-3 text-[12.5px] font-semibold text-admin-ink"
      >
        ✎ {maisonSetupT(locale, "Custom colors")}
      </button>
    </div>
  );

  return (
    <section
      data-maison-theme-detail=""
      data-testid="maison-theme-detail"
      className="flex min-h-[70vh] flex-col font-admin-body"
    >
      {/* Desktop top bar */}
      <header className="hidden items-center gap-3 border-b border-admin-border-soft px-4 py-3 md:flex md:min-h-16">
        <button
          type="button"
          onClick={onBackToGallery}
          className="min-h-11 text-[13.5px] font-semibold text-admin-ink"
        >
          ‹ {maisonSetupT(locale, "Designs")}
        </button>
        <span aria-hidden className="h-6 w-px bg-admin-border-soft" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-admin-ink">
            {MAISON_BUILTIN_DESIGN.title}
          </p>
          <p className="truncate text-[12px] text-admin-ink-muted">{description}</p>
        </div>
        <span
          data-maison-status=""
          data-testid="maison-status-word"
          className="shrink-0 text-[12.5px] font-semibold text-emerald-900"
        >
          {maisonSetupT(locale, choices.status)}
        </span>
        <div className="flex rounded-lg border border-admin-border-soft p-0.5">
          {(["desktop", "phone"] as const).map((device) => (
            <button
              key={device}
              type="button"
              data-testid={`maison-device-${device}`}
              onClick={() => onChange({ previewDevice: device })}
              className={`min-h-11 rounded-md px-3 text-[12.5px] font-semibold ${
                choices.previewDevice === device
                  ? "bg-admin-ink text-white"
                  : "text-admin-ink"
              }`}
            >
              {maisonSetupT(locale, device === "desktop" ? "Desktop" : "Phone")}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={maisonSetupT(locale, "Close")}
          className="grid h-11 w-11 place-items-center text-[18px] text-admin-ink"
        >
          ✕
        </button>
      </header>

      {/* Phone compact header */}
      <header className="flex min-h-14 items-center gap-2 border-b border-admin-border-soft px-3 py-2 md:hidden">
        <button
          type="button"
          onClick={onBackToGallery}
          className="grid h-11 w-11 place-items-center text-[18px]"
          aria-label={maisonSetupT(locale, "Designs")}
        >
          ‹
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-admin-ink">
            {MAISON_BUILTIN_DESIGN.title}
          </p>
          <p className="truncate text-[11.5px] text-admin-ink-muted">
            {demoTitle} · {paletteName}
          </p>
        </div>
        <span data-maison-status="" className="text-[11.5px] font-semibold text-emerald-900">
          {maisonSetupT(locale, choices.status)}
        </span>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 md:p-4">
          {/* Demo strip — desktop */}
          <div
            data-maison-demo-strip=""
            className="hidden items-center gap-3 md:flex"
          >
            <span className="text-[12px] font-semibold text-admin-ink-dim">
              {maisonSetupT(locale, "Demos · 1")}
            </span>
            <button
              type="button"
              data-testid="maison-demo-card"
              aria-pressed="true"
              className="flex w-[120px] flex-col overflow-hidden rounded-lg border-2 border-admin-ink bg-white"
            >
              <span
                className="block h-[74px] w-full"
                style={{
                  background: `linear-gradient(135deg, ${palette.section}, ${palette.accent})`,
                }}
              />
              <span className="flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold">
                {demoTitle}
                <span aria-hidden>✓</span>
              </span>
            </button>
          </div>

          {/* Phone segment above preview */}
          <div className="md:hidden">{segment}</div>

          <div className="min-h-0 flex-1 overflow-auto">{previewFrame}</div>
        </div>

        {/* Desktop right panel */}
        <aside className="hidden w-[360px] shrink-0 flex-col border-l border-admin-border-soft bg-white md:flex">
          <div className="flex-1 space-y-5 overflow-auto px-4 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-admin-ink-dim">
                {maisonSetupT(locale, "THEME")}
              </p>
              <p className="mt-1 text-[16px] font-semibold text-admin-ink">
                {MAISON_BUILTIN_DESIGN.title}
              </p>
              <p className="mt-0.5 text-[13px] text-admin-ink-muted">
                {maisonSetupT(locale, "Demo:")}{" "}
                <span className="font-semibold text-admin-ink">{demoTitle}</span>
              </p>
              <div className="mt-2">
                <MaisonTagChips locale={locale} />
              </div>
            </div>

            <div>
              <p className="mb-2 text-[13px] font-semibold text-admin-ink">
                {maisonSetupT(locale, "Show")}
              </p>
              {segment}
              <p className="mt-2 text-[12px] leading-snug text-admin-ink-muted">
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
                <p className="text-[13px] font-semibold text-admin-ink">
                  {maisonSetupT(locale, "Colors")}
                </p>
                {isDefaultPalette ? (
                  <span className="text-[12px] text-admin-ink-dim">
                    {maisonSetupT(locale, "Demo colors")}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPalette(MAISON_DEFAULT_PALETTE_KEY)}
                    className="text-[12px] font-semibold text-emerald-900"
                  >
                    {maisonSetupT(locale, "Use demo colors")}
                  </button>
                )}
              </div>
              {swatches}
              <p className="mt-2 text-[13px] font-semibold text-admin-ink">{paletteName}</p>
            </div>

            <div>
              <p className="mb-2 text-[13px] font-semibold text-admin-ink">
                {maisonSetupT(locale, "Personalise")}
              </p>
              <button
                type="button"
                data-testid="maison-import-entry"
                onClick={() => setImportOpen(true)}
                className="flex min-h-12 w-full items-center justify-between rounded-xl border border-admin-border-soft px-3 text-left text-[13px] font-semibold text-admin-ink"
              >
                {locale === "es"
                  ? `Importar contenido inicial · ${MAISON_STARTER_COUNTS.total} disponibles ›`
                  : `Import starter content · ${MAISON_STARTER_COUNTS.total} available ›`}
              </button>
              <p className="mt-1.5 text-[12px] text-admin-ink-dim">
                {maisonSetupT(locale, "Optional. Imported items are saved as drafts.")}
              </p>
            </div>
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
              className="min-h-12 w-full rounded-xl bg-emerald-900 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {maisonSetupT(locale, "Use this design")}
            </button>
          </div>
        </aside>
      </div>

      {/* Phone bottom bar */}
      <div className="flex items-center gap-2 border-t border-admin-border-soft bg-white px-3 py-2 md:hidden">
        <button
          type="button"
          data-testid="maison-phone-demos"
          onClick={() => openSheet("demos")}
          className="min-h-12 shrink-0 rounded-xl border border-admin-border-soft px-3 text-[14px] font-semibold text-admin-ink max-[379px]:px-[9px] max-[379px]:text-[14px]"
        >
          {maisonSetupT(locale, "Demos · 1")}
        </button>
        <button
          type="button"
          data-testid="maison-phone-colors"
          onClick={() => openSheet("colors")}
          className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl border border-admin-border-soft px-3 text-[14px] font-semibold text-admin-ink max-[379px]:px-[9px]"
        >
          <span
            className="inline-block h-3.5 w-3.5 rounded-full"
            style={{
              background: `linear-gradient(135deg, ${palette.section} 50%, ${palette.accent} 50%)`,
            }}
          />
          {maisonSetupT(locale, "Colors")}
        </button>
        <button
          type="button"
          data-testid="maison-use-design-phone"
          onClick={handleUseDesign}
          disabled={pending}
          className="min-h-12 min-w-0 flex-1 truncate rounded-xl bg-emerald-900 px-3 text-[14px] font-semibold text-white disabled:opacity-50"
        >
          {maisonSetupT(locale, "Use this design")}
        </button>
      </div>

      {/* One sheet at a time (W34) */}
      {choices.phoneSheet ? (
        <div
          className="fixed inset-0 z-[70] flex items-end bg-black/30 md:hidden"
          data-maison-phone-sheet={choices.phoneSheet}
          onClick={() => onChange({ phoneSheet: null })}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[85vh] w-full overflow-auto rounded-t-2xl bg-white px-4 pb-6 pt-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-black/15" />
            {choices.phoneSheet === "demos" ? (
              <>
                <h2 className="text-[16px] font-semibold text-admin-ink">
                  {maisonSetupT(locale, "Demos · 1")}
                </h2>
                <p className="mt-1 text-[13px] text-admin-ink-muted">{description}</p>
                <div className="mt-2">
                  <MaisonTagChips locale={locale} />
                </div>
                <p className="mt-3 text-[12.5px] text-admin-ink-dim">
                  {maisonSetupT(
                    locale,
                    "Switching demos changes sample photos, text and prices — not your saved site.",
                  )}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="overflow-hidden rounded-lg border-2 border-admin-ink text-left"
                    onClick={() => onChange({ phoneSheet: null })}
                  >
                    <span
                      className="block h-16 w-full"
                      style={{
                        background: `linear-gradient(135deg, ${palette.section}, ${palette.accent})`,
                      }}
                    />
                    <span className="block px-2 py-1.5 text-[12px] font-semibold">
                      {demoTitle} ✓
                    </span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-[16px] font-semibold text-admin-ink">
                  {maisonSetupT(locale, "Colors")}
                </h2>
                <ul className="mt-3 space-y-1">
                  {MAISON_PALETTE_ORDER.map((key) => {
                    const p = MAISON_PALETTES[key];
                    const selected = !usingCustom && choices.paletteKey === key;
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => setPalette(key)}
                          className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-admin-surface-alt"
                        >
                          <span
                            className="h-9 w-9 shrink-0 rounded-full"
                            style={{
                              background: `linear-gradient(135deg, ${p.section} 50%, ${p.accent} 50%)`,
                            }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-semibold text-admin-ink">
                              {locale === "es" ? p.name.es : p.name.en}
                            </span>
                            {key === MAISON_DEFAULT_PALETTE_KEY ? (
                              <span className="text-[11.5px] text-admin-ink-dim">
                                {maisonSetupT(locale, "Demo colors")}
                              </span>
                            ) : null}
                          </span>
                          {selected ? <span aria-hidden>✓</span> : null}
                        </button>
                      </li>
                    );
                  })}
                  {choices.customPalette ? (
                    <li>
                      <button
                        type="button"
                        data-testid="maison-phone-my-colors"
                        onClick={() =>
                          onChange({
                            useCustomPalette: true,
                            status: "Choices saved",
                            phoneSheet: null,
                          })
                        }
                        className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-admin-surface-alt"
                      >
                        <span
                          className="h-9 w-9 shrink-0 rounded-full"
                          style={{
                            background: `linear-gradient(135deg, ${choices.customPalette.fields.section} 50%, ${choices.customPalette.fields.accent} 50%)`,
                          }}
                        />
                        <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-admin-ink">
                          {locale === "es"
                            ? choices.customPalette.name.es
                            : choices.customPalette.name.en}
                        </span>
                        {usingCustom ? <span aria-hidden>✓</span> : null}
                      </button>
                    </li>
                  ) : null}
                </ul>
                <button
                  type="button"
                  data-testid="maison-phone-custom-colors"
                  className="mt-2 flex min-h-12 w-full items-center rounded-xl border border-admin-border-soft px-3 text-[13.5px] font-semibold"
                  onClick={openCustomColors}
                >
                  {maisonSetupT(locale, "Custom colors")} ›
                </button>
                {!isDefaultPalette || usingCustom ? (
                  <button
                    type="button"
                    className="mt-2 min-h-11 w-full text-[13px] font-semibold text-emerald-900"
                    onClick={() => setPalette(MAISON_DEFAULT_PALETTE_KEY)}
                  >
                    {maisonSetupT(locale, "Use demo colors")}
                  </button>
                ) : null}
                <p className="mt-3 text-[12px] text-admin-ink-dim">
                  {maisonSetupT(locale, "Only colors change. Photos, content and layout stay.")}
                </p>
              </>
            )}
          </div>
        </div>
      ) : null}

      {importOpen ? (
        <ImportStarterPanel
          locale={locale}
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
          onClose={() => setCustomOpen(false)}
          onSaved={handleCustomSaved}
        />
      ) : null}
    </section>
  );
}
