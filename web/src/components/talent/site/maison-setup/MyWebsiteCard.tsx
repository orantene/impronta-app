"use client";

/**
 * My website card after publish (W40) — Live · address · View / Change / Design options.
 * Design options body is PR8; button is present with honest deferral.
 */

import Link from "next/link";
import { MAISON_PALETTES, type MaisonPaletteKey } from "@/lib/talent-site/theme-catalog/maison/seed";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";

type Props = {
  locale: MaisonSetupLocale;
  publicSiteUrl: string | null;
  siteSlug: string | null;
  themeLookSlug: string | null;
  contentModeLabel?: "mine" | "demo";
  onChangeDesign: () => void;
};

function lookToPalette(lookSlug: string | null): MaisonPaletteKey | null {
  if (!lookSlug?.startsWith("maison-")) return null;
  const key = lookSlug.slice("maison-".length);
  return key in MAISON_PALETTES ? (key as MaisonPaletteKey) : null;
}

export function MyWebsiteCard({
  locale,
  publicSiteUrl,
  siteSlug,
  themeLookSlug,
  contentModeLabel = "mine",
  onChangeDesign,
}: Props) {
  const paletteKey = lookToPalette(themeLookSlug);
  const paletteName = paletteKey
    ? MAISON_PALETTES[paletteKey].name[locale === "es" ? "es" : "en"]
    : locale === "es"
      ? "Colores"
      : "Colors";
  const content =
    contentModeLabel === "mine"
      ? locale === "es"
        ? "Tu contenido"
        : "Your content"
      : locale === "es"
        ? "Contenido demo"
        : "Demo content";
  const summary = `Maison · ${paletteName} · ${content}`;
  const address = siteSlug ? `${siteSlug}.tulala.digital` : publicSiteUrl ?? "—";

  return (
    <section
      data-testid="maison-my-website-card"
      data-maison-my-website=""
      className="overflow-hidden rounded-2xl border border-admin-border-soft bg-white"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-admin-border-soft px-4 py-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-admin-ink-dim">
            {maisonSetupT(locale, "My website")}
          </p>
          <p className="mt-1 flex items-center gap-2 text-[14px] font-semibold text-admin-ink">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-600" aria-hidden />
            <span data-testid="maison-live-pill">● Live</span>
          </p>
          <p
            data-testid="maison-live-address"
            className="mt-1 text-[16px] font-bold text-admin-ink"
          >
            {address}
          </p>
          <p data-testid="maison-live-summary" className="mt-0.5 text-[13px] text-admin-ink-muted">
            {summary}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 px-4 py-3">
        {publicSiteUrl ? (
          <Link
            href={publicSiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="maison-view-website"
            className="inline-flex min-h-11 items-center rounded-xl bg-emerald-900 px-4 text-[13px] font-semibold text-white"
          >
            {maisonSetupT(locale, "View website")}
          </Link>
        ) : null}
        <button
          type="button"
          data-testid="maison-change-design"
          onClick={onChangeDesign}
          className="inline-flex min-h-11 items-center rounded-xl border border-admin-border-soft px-4 text-[13px] font-semibold text-admin-ink"
        >
          {maisonSetupT(locale, "Change design")}
        </button>
        <button
          type="button"
          data-testid="maison-design-options"
          onClick={() =>
            window.alert(maisonSetupT(locale, "Design options open in a later step."))
          }
          className="inline-flex min-h-11 items-center rounded-xl border border-admin-border-soft px-4 text-[13px] font-semibold text-admin-ink"
        >
          {maisonSetupT(locale, "Design options")}
        </button>
      </div>
    </section>
  );
}
