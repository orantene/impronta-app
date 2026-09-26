"use client";

/**
 * Custom colors editor (W60–W65) — four fields, live preview, advisory contrast,
 * suggestion preview, save as My colors, phone keyboard strip.
 */

import { useMemo, useState } from "react";
import {
  buildMaisonCustomPalette,
  evaluateMaisonCustomContrast,
  isCompleteCustomFields,
  normalizeMaisonHex,
  type MaisonCustomColorFields,
  type MaisonCustomPaletteStored,
} from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";

type FieldKey = keyof MaisonCustomColorFields;

const FIELD_META: {
  key: FieldKey;
  labelEn: string;
  labelEs: string;
}[] = [
  { key: "page", labelEn: "Page background", labelEs: "Fondo de página" },
  { key: "text", labelEn: "Text", labelEs: "Texto" },
  { key: "accent", labelEn: "Buttons and accents", labelEs: "Botones y acentos" },
  { key: "section", labelEn: "Section background", labelEs: "Fondo de sección" },
];

type Props = {
  locale: MaisonSetupLocale;
  initialFields: MaisonCustomColorFields;
  initialName?: string;
  /** Live token push while editing (W61). */
  onPreviewFields: (fields: MaisonCustomColorFields) => void;
  onClose: () => void;
  onSaved: (palette: MaisonCustomPaletteStored) => void;
};

export function CustomColorsPanel({
  locale,
  initialFields,
  initialName,
  onPreviewFields,
  onClose,
  onSaved,
}: Props) {
  const [fields, setFields] = useState<MaisonCustomColorFields>(initialFields);
  const [hexDraft, setHexDraft] = useState<Record<FieldKey, string>>({
    page: initialFields.page,
    text: initialFields.text,
    accent: initialFields.accent,
    section: initialFields.section,
  });
  const [name, setName] = useState(
    initialName ??
      (locale === "es" ? "Mis colores" : "My colors"),
  );
  const [previewSuggestion, setPreviewSuggestion] = useState(false);
  const [focusedField, setFocusedField] = useState<FieldKey | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const advisory = useMemo(() => evaluateMaisonCustomContrast(fields), [fields]);

  const displayAccent =
    previewSuggestion && advisory.suggestionAccent
      ? advisory.suggestionAccent
      : fields.accent;

  const pushPreview = (next: MaisonCustomColorFields) => {
    onPreviewFields(next);
  };

  const setField = (key: FieldKey, raw: string) => {
    setHexDraft((d) => ({ ...d, [key]: raw }));
    const normalized = normalizeMaisonHex(raw);
    if (!normalized) return;
    const next = { ...fields, [key]: normalized };
    setFields(next);
    setPreviewSuggestion(false);
    pushPreview(next);
  };

  const handlePreviewSuggestion = () => {
    if (!advisory.suggestionAccent) return;
    setPreviewSuggestion(true);
    pushPreview({ ...fields, accent: advisory.suggestionAccent });
  };

  const handleUseAdjustment = () => {
    if (!advisory.suggestionAccent) return;
    const next = { ...fields, accent: advisory.suggestionAccent };
    setFields(next);
    setHexDraft((d) => ({ ...d, accent: advisory.suggestionAccent! }));
    setPreviewSuggestion(false);
    pushPreview(next);
  };

  const handleKeepColor = () => {
    setPreviewSuggestion(false);
    pushPreview(fields);
  };

  const handleSave = () => {
    if (!isCompleteCustomFields(fields)) return;
    const en = name.trim() || "My colors";
    const es =
      locale === "es" ? en : en === "My colors" ? "Mis colores" : en;
    const palette = buildMaisonCustomPalette(fields, { en, es });
    onSaved(palette);
    setToast(
      locale === "es" ? `Guardado como ${palette.name.es}` : `Saved as ${palette.name.en}`,
    );
  };

  const keyboardOpen = focusedField !== null;

  return (
    <div
      data-testid="maison-custom-colors-panel"
      data-maison-custom-colors=""
      data-maison-kbd={keyboardOpen ? "open" : "closed"}
      className="fixed inset-0 z-[80] flex justify-end bg-black/30"
    >
      <div
        className={`flex h-full w-full flex-col bg-white shadow-xl md:max-w-[420px] ${
          keyboardOpen ? "md:max-w-[420px]" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="maison-custom-colors-title"
      >
        {/* Phone keyboard strip preview (W65) */}
        {keyboardOpen ? (
          <div
            data-testid="maison-custom-kbd-strip"
            className="shrink-0 border-b border-admin-border-soft bg-admin-surface-alt px-4 py-3 md:hidden"
          >
            <div className="flex h-14 items-center gap-3 rounded-xl border border-admin-border-soft bg-white px-3">
              <span
                className="h-8 w-8 shrink-0 rounded-full"
                style={{
                  background: `linear-gradient(135deg, ${fields.section} 50%, ${displayAccent} 50%)`,
                }}
              />
              <span className="truncate text-[13px] font-semibold text-admin-ink">
                {locale === "es" ? "Vista previa" : "Preview"}
              </span>
            </div>
          </div>
        ) : null}

        <header className="border-b border-admin-border-soft px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 text-[13px] font-semibold text-admin-ink-muted"
          >
            {maisonSetupT(locale, "Close")}
          </button>
          <h2
            id="maison-custom-colors-title"
            className="mt-1 text-[18px] font-semibold text-admin-ink"
            data-testid="maison-custom-colors-heading"
          >
            {maisonSetupT(locale, "Custom colors")}
          </h2>
          <p className="mt-0.5 text-[13px] text-admin-ink-muted">
            {maisonSetupT(
              locale,
              "Only colors change. Photos, content and layout stay.",
            )}
          </p>
        </header>

        <div className="flex-1 space-y-4 overflow-auto px-4 py-4">
          {FIELD_META.map((meta) => (
            <label
              key={meta.key}
              data-testid={`maison-custom-field-${meta.key}`}
              className="flex min-h-11 items-center gap-3"
            >
              <span
                className="h-10 w-10 shrink-0 rounded-full border border-admin-border-soft"
                style={{ background: fields[meta.key] }}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-admin-ink">
                  {locale === "es" ? meta.labelEs : meta.labelEn}
                </span>
                <input
                  type="text"
                  inputMode="text"
                  enterKeyHint="done"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  value={hexDraft[meta.key]}
                  onChange={(e) => setField(meta.key, e.target.value)}
                  onFocus={() => setFocusedField(meta.key)}
                  onBlur={() => setFocusedField(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  data-testid={`maison-custom-hex-${meta.key}`}
                  className="mt-0.5 w-full min-h-11 rounded-lg border border-admin-border-soft px-2 font-mono text-[13px] uppercase text-admin-ink"
                />
              </span>
              <input
                type="color"
                value={normalizeMaisonHex(fields[meta.key]) ?? "#000000"}
                onChange={(e) => setField(meta.key, e.target.value)}
                aria-label={locale === "es" ? meta.labelEs : meta.labelEn}
                className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border border-admin-border-soft bg-transparent p-0"
              />
            </label>
          ))}

          {/* Contrast advisory (W62–W63) — never blocks */}
          <div
            data-testid="maison-contrast-advisory"
            data-advisory-ok={advisory.ok ? "true" : "false"}
            className="rounded-xl border border-admin-border-soft px-3 py-3"
          >
            {advisory.ok ? (
              <p
                data-testid="maison-contrast-readable"
                className="text-[13px] font-semibold text-emerald-900"
              >
                ✓ {locale === "es" ? "El texto se lee bien" : "Text is readable"}
              </p>
            ) : advisory.messageKey ? (
              <>
                <p className="text-[13px] font-semibold text-admin-ink">
                  {advisory.messageKey === "adjust_button_contrast"
                    ? locale === "es"
                      ? "Ajustar contraste del botón"
                      : "Adjust button contrast"
                    : locale === "es"
                      ? "Ajustar contraste del texto"
                      : "Adjust text contrast"}
                </p>
                <p className="mt-1 text-[12.5px] text-admin-ink-muted">
                  {locale === "es" ? advisory.messageEs : advisory.messageEn}
                </p>
                {advisory.suggestionAccent ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className="inline-block h-6 w-6 rounded-full border border-admin-border-soft"
                      style={{ background: advisory.suggestionAccent }}
                      aria-hidden
                    />
                    <span className="font-mono text-[12px] text-admin-ink">
                      {advisory.suggestionAccent}
                    </span>
                    <button
                      type="button"
                      data-testid="maison-contrast-preview-suggestion"
                      onClick={handlePreviewSuggestion}
                      className="min-h-11 rounded-full border border-admin-border-soft px-3 text-[12.5px] font-semibold"
                    >
                      {locale === "es" ? "Vista previa" : "Preview suggestion"}
                    </button>
                  </div>
                ) : null}
                {previewSuggestion && advisory.suggestionAccent ? (
                  <div
                    data-testid="maison-contrast-previewing"
                    className="mt-3 rounded-lg bg-admin-surface-alt px-3 py-2 text-[12px] text-admin-ink"
                  >
                    {locale === "es"
                      ? `Vista previa · Acento ${fields.accent} → ${advisory.suggestionAccent}. No se aplica hasta que elijas.`
                      : `Previewing the suggestion · Accent ${fields.accent} → ${advisory.suggestionAccent}. Not applied until you choose.`}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        data-testid="maison-contrast-use-adjustment"
                        onClick={handleUseAdjustment}
                        className="min-h-11 rounded-xl bg-emerald-900 px-3 text-[12.5px] font-semibold text-white"
                      >
                        {locale === "es"
                          ? "Usar este ajuste"
                          : "Use this adjustment"}
                      </button>
                      <button
                        type="button"
                        data-testid="maison-contrast-keep-color"
                        onClick={handleKeepColor}
                        className="min-h-11 rounded-xl border border-admin-border-soft px-3 text-[12.5px] font-semibold"
                      >
                        {locale === "es" ? "Conservar mi color" : "Keep my color"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <button
              type="button"
              data-testid="maison-contrast-details-toggle"
              className="mt-2 min-h-11 text-[12px] font-semibold text-admin-ink-dim"
              onClick={() => setDetailsOpen((o) => !o)}
            >
              {locale === "es" ? "Detalles de contraste" : "Contrast details"}{" "}
              {detailsOpen ? "▴" : "▾"}
            </button>
            {detailsOpen ? (
              <p
                data-testid="maison-contrast-details"
                className="mt-1 text-[12px] text-admin-ink-dim"
              >
                {locale === "es" ? "Texto en página" : "Text on page"}{" "}
                {advisory.textOnPage?.toFixed(1) ?? "—"}:1 ·{" "}
                {locale === "es" ? "Texto del botón" : "Button text"}{" "}
                {advisory.buttonContrast?.toFixed(1) ?? "—"}:1
              </p>
            ) : null}
          </div>

          <label className="block">
            <span className="text-[12px] font-semibold text-admin-ink">
              {locale === "es" ? "Nombre de la paleta" : "Palette name"}
            </span>
            <input
              type="text"
              data-testid="maison-custom-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full min-h-11 rounded-lg border border-admin-border-soft px-3 text-[13px]"
            />
          </label>
        </div>

        <footer className="sticky bottom-0 border-t border-admin-border-soft bg-white px-4 py-3">
          {toast ? (
            <p
              data-testid="maison-custom-toast"
              className="mb-2 text-[12px] font-semibold text-emerald-900"
            >
              {toast}
            </p>
          ) : null}
          <button
            type="button"
            data-testid="maison-custom-save"
            disabled={!isCompleteCustomFields(fields)}
            onClick={handleSave}
            className="min-h-12 w-full rounded-xl bg-emerald-900 text-[14px] font-semibold text-white disabled:opacity-40"
          >
            {locale === "es" ? "Guardar colores" : "Save colors"}
          </button>
        </footer>
      </div>
    </div>
  );
}
