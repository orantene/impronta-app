"use client";

/**
 * cr_gallery — Choose a design (W24–W26, W75).
 * One Maison card, live preview, no search/filters.
 */
import {
  MAISON_BUILTIN_DEMO,
  MAISON_BUILTIN_DESIGN,
} from "@/lib/talent-site/theme-catalog/maison/builtins";
import { MAISON_SEED } from "@/lib/talent-site/theme-catalog/maison/seed";
import { ThemeGalleryPreviewFrame } from "@/components/talent/site/theme-gallery/ThemeGalleryPreviewFrame";
import { useThemePreview } from "@/components/talent/site/theme-gallery/useThemePreview";
import { MaisonTagChips } from "./MaisonTagChips";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";

type Props = {
  locale: MaisonSetupLocale;
  talentProfileId: string;
  onExplore: () => void;
  onBack?: () => void;
};

export function ChooseDesignScreen({ locale, talentProfileId, onExplore, onBack }: Props) {
  const preview = useThemePreview({ talentProfileId, locale });
  const lookSlug = MAISON_BUILTIN_DEMO.buildPayload().default_look;
  const url = preview.src("maison", lookSlug);
  const demoTitle =
    locale === "es" ? MAISON_BUILTIN_DEMO.summary : MAISON_BUILTIN_DEMO.title;
  const description =
    locale === "es"
      ? MAISON_SEED.theme.description.es
      : MAISON_SEED.theme.description.en;

  return (
    <section
      data-maison-choose-design=""
      data-testid="maison-choose-design"
      className="mx-auto w-full max-w-[860px] px-4 pb-10 pt-4 font-admin-body"
    >
      <header className="mb-6">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="mb-2 min-h-11 text-[13px] font-semibold text-admin-ink-muted"
          >
            ← {maisonSetupT(locale, "Your free website")}
          </button>
        ) : null}
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-admin-ink-dim">
          {maisonSetupT(locale, "Your free website")}
        </p>
        <h1 className="mt-1 text-[22px] font-semibold text-admin-ink">
          {maisonSetupT(locale, "Choose a design")}
        </h1>
        <p className="mt-2 text-[15px] font-semibold text-admin-ink">
          {maisonSetupT(locale, "Find your website style")}
        </p>
        <p className="mt-0.5 text-[13.5px] text-admin-ink-muted">
          {maisonSetupT(locale, "Explore designs, then see them with your photos and services.")}
        </p>
      </header>

      {/* W75: deliberately no search input and no filter chips. */}
      <article
        data-maison-theme-card=""
        data-testid="maison-theme-card"
        className="w-full max-w-[820px] overflow-hidden rounded-2xl border border-admin-border-soft bg-white"
      >
        <button
          type="button"
          onClick={onExplore}
          className="block w-full text-left"
          aria-label={`${MAISON_BUILTIN_DESIGN.title} — ${maisonSetupT(locale, "Explore theme →")}`}
        >
          <ThemeGalleryPreviewFrame
            preview={preview}
            url={url}
            locale={locale}
            title={MAISON_BUILTIN_DESIGN.title}
          />
        </button>
        <div className="space-y-3 px-4 py-4 md:px-5">
          <div>
            <h2 className="text-[18px] font-semibold text-admin-ink">{MAISON_BUILTIN_DESIGN.title}</h2>
            <p className="mt-1 text-[13.5px] leading-snug text-admin-ink-muted">{description}</p>
          </div>
          <MaisonTagChips locale={locale} />
          <p className="text-[13px] text-admin-ink">
            {maisonSetupT(locale, "Featured demo:")}{" "}
            <span className="font-semibold">{demoTitle}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-admin-surface-alt px-2.5 py-1 text-[11.5px] font-semibold text-admin-ink">
              {maisonSetupT(locale, "1 demo")}
            </span>
            <button
              type="button"
              onClick={onExplore}
              data-testid="maison-explore-theme"
              className="min-h-11 text-[13.5px] font-semibold text-emerald-900"
            >
              {maisonSetupT(locale, "Explore theme →")}
            </button>
          </div>
        </div>
      </article>

      <p className="mt-4 max-w-[820px] text-[12.5px] leading-snug text-admin-ink-dim">
        {maisonSetupT(
          locale,
          "Maison is the first Tulala design. It works for any profession: you will see it with your own photos and services before choosing.",
        )}
      </p>
    </section>
  );
}
