"use client";

/**
 * W68 — Colors-only publish on a live site: one combined step
 * (change review + publish). Desktop dialog 520px / phone sheet.
 */

import { MAISON_PALETTES, type MaisonPaletteKey } from "@/lib/talent-site/theme-catalog/maison/seed";
import type { MaisonCustomPaletteStored } from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";

export type MaisonColorSwatchRef = {
  paletteKey: MaisonPaletteKey | null;
  customPalette: MaisonCustomPaletteStored | null;
};

function swatchColors(ref: MaisonColorSwatchRef): { accent: string; section: string; label: string } {
  if (ref.customPalette) {
    return {
      accent: ref.customPalette.fields.accent,
      section: ref.customPalette.fields.section,
      label: ref.customPalette.name.en,
    };
  }
  const key = ref.paletteKey ?? "pink";
  const p = MAISON_PALETTES[key];
  return {
    accent: p.accent,
    section: p.section,
    label: p.name.en,
  };
}

type Props = {
  locale: MaisonSetupLocale;
  before: MaisonColorSwatchRef;
  after: MaisonColorSwatchRef;
  pending: boolean;
  error: string | null;
  onPublish: () => void;
  onKeepEditing: () => void;
};

export function PublishColorsDialog({
  locale,
  before,
  after,
  pending,
  error,
  onPublish,
  onKeepEditing,
}: Props) {
  const from = swatchColors(before);
  const to = swatchColors(after);
  const es = locale === "es";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 md:items-center"
      data-testid="maison-publish-colors-dialog"
      role="presentation"
      onClick={onKeepEditing}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="maison-publish-colors-title"
        className="w-full max-w-[520px] rounded-t-2xl bg-white px-5 pb-6 pt-4 shadow-lg md:rounded-2xl md:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-black/15 md:hidden" />
        <h2
          id="maison-publish-colors-title"
          className="text-[18px] font-semibold text-admin-ink"
        >
          {maisonSetupT(locale, "Publish new colors?")}
        </h2>
        <div className="mt-4 flex items-center gap-3">
          <Swatch accent={from.accent} section={from.section} label={from.label} />
          <span className="text-[13px] text-admin-ink-muted" aria-hidden>
            →
          </span>
          <Swatch accent={to.accent} section={to.section} label={to.label} />
        </div>
        <p className="mt-2 text-[13px] text-admin-ink-muted" data-testid="maison-colors-before-after">
          {from.label} → {to.label}
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-admin-ink-muted">
          {maisonSetupT(
            locale,
            "Only colors change. Your services, photos, text, sections and layout stay exactly as they are.",
          )}
        </p>
        {error ? (
          <p className="mt-3 text-[12px] text-red-800" data-testid="maison-publish-colors-error">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            data-testid="maison-publish-colors-confirm"
            disabled={pending}
            onClick={onPublish}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-emerald-900 px-4 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {pending
              ? maisonSetupT(locale, "Publishing…")
              : maisonSetupT(locale, "Publish changes")}
          </button>
          <button
            type="button"
            data-testid="maison-publish-colors-keep"
            disabled={pending}
            onClick={onKeepEditing}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-admin-border-soft px-4 text-[14px] font-semibold text-admin-ink disabled:opacity-50"
          >
            {maisonSetupT(locale, "Keep editing")}
          </button>
        </div>
        <p className="mt-3 text-[11px] text-admin-ink-dim">
          {es
            ? "Tu sitio en vivo no cambia hasta que publiques."
            : "Your live site stays as it is until you publish."}
        </p>
      </div>
    </div>
  );
}

function Swatch({
  accent,
  section,
  label,
}: {
  accent: string;
  section: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-10 w-10 rounded-full border border-admin-border-soft"
        style={{
          background: `linear-gradient(135deg, ${section} 45%, ${accent} 45%)`,
        }}
        title={label}
        aria-hidden
      />
      <span className="text-[13px] font-semibold text-admin-ink">{label}</span>
    </div>
  );
}
