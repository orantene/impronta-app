"use client";

/**
 * cr_gallery — Choose a design (W24–W26).
 * Chrome matches Theme Gallery PDF: Today · Choose a design · X. The body
 * is the P3 browse gallery (GalleryBrowseScreen): hero, search, filters,
 * suggested designs and demo cards (W75's no-search rule is superseded).
 */
import { useAdminShellOptional } from "@/components/admin/shell/internal/state";
import { GalleryBrowseScreen, type GalleryExploreOptions } from "./GalleryBrowseScreen";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";

type Props = {
  locale: MaisonSetupLocale;
  talentProfileId: string;
  /** P3: opts carry the matching demo and the search it came from (optional). */
  onExplore: (designSlug: string, opts?: GalleryExploreOptions) => void;
  /** PDF: ‹ Today — leave setup toward Today / presence. */
  onBack?: () => void;
  /** PDF: chrome close X. */
  onClose?: () => void;
  /** Override for "Suggested from your profile"; defaults to the shell's talent profile. */
  primaryTypeLabel?: string | null;
  /** P5: set when Change design is opened from a live site. */
  liveAddress?: string;
};

export function ChooseDesignScreen({
  locale,
  talentProfileId,
  onExplore,
  onBack,
  onClose,
  primaryTypeLabel,
  liveAddress,
}: Props) {
  const bridgeTalentSelfProfile = useAdminShellOptional()?.bridgeTalentSelfProfile ?? null;
  const tradeLabel =
    primaryTypeLabel !== undefined ? primaryTypeLabel : (bridgeTalentSelfProfile?.primaryTypeLabel ?? null);

  return (
    <section
      data-maison-choose-design=""
      data-testid="maison-choose-design"
      className="mx-auto w-full max-w-[1320px] px-4 pb-10 pt-2 font-admin-body"
    >
      {/* PDF cr_gallery chrome: Today | Choose a design / Your free website | X */}
      <header className="mb-5">
        <div className="flex min-h-12 items-center gap-2 border-b border-admin-border-soft pb-3">
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
      </header>

      <GalleryBrowseScreen
        locale={locale}
        talentProfileId={talentProfileId}
        onExplore={onExplore}
        primaryTypeLabel={tradeLabel}
        liveAddress={liveAddress}
        onBackToMyWebsite={onBack}
      />
    </section>
  );
}
