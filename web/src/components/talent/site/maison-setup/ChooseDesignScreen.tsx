"use client";

/**
 * cr_gallery — Choose a design (W24–W26, W75).
 * Maison plus the flag-gated collection designs, each with a live preview
 * of the talent's own content. No search/filters.
 * Chrome matches Theme Gallery PDF: Today · Choose a design · X, then hero.
 */
import {
  MAISON_BUILTIN_DEMO,
  MAISON_BUILTIN_DESIGN,
} from "@/lib/talent-site/theme-catalog/maison/builtins";
import { MAISON_SEED } from "@/lib/talent-site/theme-catalog/maison/seed";
import {
  COLLECTION_DESIGNS,
  COLLECTION_DESIGN_SUMMARY_ES,
} from "@/lib/talent-site/theme-catalog/collection/designs";
import { ThemeGalleryPreviewFrame } from "@/components/talent/site/theme-gallery/ThemeGalleryPreviewFrame";
import { useThemePreview } from "@/components/talent/site/theme-gallery/useThemePreview";
import { MaisonTagChips } from "./MaisonTagChips";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";

type Props = {
  locale: MaisonSetupLocale;
  talentProfileId: string;
  onExplore: (designSlug: string) => void;
  /** PDF: ‹ Today — leave setup toward Today / presence. */
  onBack?: () => void;
  /** PDF: chrome close X. */
  onClose?: () => void;
};

export function ChooseDesignScreen({
  locale,
  talentProfileId,
  onExplore,
  onBack,
  onClose,
}: Props) {
  const preview = useThemePreview({ talentProfileId, locale });
  const lookSlug = MAISON_BUILTIN_DEMO.buildPayload().default_look;
  const demoTitle =
    locale === "es" ? MAISON_BUILTIN_DEMO.summary : MAISON_BUILTIN_DEMO.title;
  const cards = [
    {
      slug: "maison",
      title: MAISON_BUILTIN_DESIGN.title,
      description:
        locale === "es"
          ? MAISON_SEED.theme.description.es
          : MAISON_SEED.theme.description.en,
    },
    ...COLLECTION_DESIGNS.map((d) => ({
      slug: d.slug,
      title: d.title,
      description:
        locale === "es"
          ? (COLLECTION_DESIGN_SUMMARY_ES[d.slug] ?? d.summary)
          : d.summary,
    })),
  ];

  return (
    <section
      data-maison-choose-design=""
      data-testid="maison-choose-design"
      className="mx-auto w-full max-w-[860px] px-4 pb-10 pt-2 font-admin-body"
    >
      {/* PDF cr_gallery chrome: Today | Choose a design / Your free website | X */}
      <header className="mb-5">
        <div className="mb-5 flex min-h-12 items-center gap-2 border-b border-admin-border-soft pb-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              data-testid="maison-gallery-back"
              className="min-h-11 shrink-0 text-[13.5px] font-semibold text-admin-ink"
            >
              ‹ {maisonSetupT(locale, "Today")}
            </button>
          ) : (
            <span className="w-16 shrink-0" aria-hidden />
          )}
          <div className="min-w-0 flex-1 text-center">
            <h1 className="text-[15px] font-semibold text-admin-ink">
              {maisonSetupT(locale, "Choose a design")}
            </h1>
            <p className="text-[11.5px] text-admin-ink-dim">
              {maisonSetupT(locale, "Your free website")}
            </p>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              data-testid="maison-gallery-close"
              aria-label={maisonSetupT(locale, "Close")}
              className="grid h-11 w-11 shrink-0 place-items-center text-[18px] text-admin-ink"
            >
              ✕
            </button>
          ) : (
            <span className="w-11 shrink-0" aria-hidden />
          )}
        </div>
        <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-admin-ink md:text-[28px]">
          {maisonSetupT(locale, "Find your website style")}
        </h2>
        <p className="mt-1.5 text-[13.5px] text-admin-ink-muted">
          {maisonSetupT(
            locale,
            "Explore designs, then see them with your photos and services.",
          )}
        </p>
      </header>

      {/* W75: deliberately no search input and no filter chips. */}
      <div className="space-y-5">
      {cards.map((card) => (
      <article
        key={card.slug}
        data-design-slug={card.slug}
        data-maison-theme-card=""
        data-testid={card.slug === "maison" ? "maison-theme-card" : `design-card-${card.slug}`}
        className="w-full max-w-[820px] overflow-hidden rounded-2xl border border-admin-border-soft bg-white"
      >
        <button
          type="button"
          onClick={() => onExplore(card.slug)}
          className="block w-full text-left"
          aria-label={`${card.title} — ${maisonSetupT(locale, "Explore theme →")}`}
        >
          <ThemeGalleryPreviewFrame
            preview={preview}
            url={preview.src(card.slug, lookSlug)}
            locale={locale}
            title={card.title}
          />
        </button>
        <div className="space-y-3 px-4 py-4 md:px-5">
          <div>
            <h2 className="text-[18px] font-semibold text-admin-ink">
              {card.title}
            </h2>
            <p className="mt-1 text-[13.5px] leading-snug text-admin-ink-muted">
              {card.description}
            </p>
          </div>
          <MaisonTagChips locale={locale} />
          <p className="text-[13px] text-admin-ink">
            {maisonSetupT(locale, "Featured demo:")}{" "}
            <span className="font-semibold">{demoTitle}</span>
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-admin-surface-alt px-2.5 py-1 text-[11.5px] font-semibold text-admin-ink">
              {maisonSetupT(locale, "1 demo")}
            </span>
            <button
              type="button"
              onClick={() => onExplore(card.slug)}
              data-testid={card.slug === "maison" ? "maison-explore-theme" : `design-explore-${card.slug}`}
              className="min-h-11 text-[13.5px] font-semibold text-admin-ink underline-offset-2 hover:underline"
            >
              {maisonSetupT(locale, "Explore theme →")}
            </button>
          </div>
        </div>
      </article>
      ))}
      </div>

      <p className="mt-4 max-w-[820px] text-[12.5px] leading-snug text-admin-ink-dim">
        {maisonSetupT(
          locale,
          "Every design works for any profession: you will see it with your own photos and services before choosing.",
        )}
      </p>
    </section>
  );
}
