import { pickLocale } from "@/lib/i18n/pick-locale";

import { PublicTalentEmbeds } from "@/components/talent/profile-extras/PublicTalentEmbeds";
import { PublicTalentPressBand } from "@/components/talent/profile-extras/PublicTalentPressBand";
import type {
  PublicTalentEmbed,
  PublicTalentPressItem,
} from "@/lib/talent/profile-embeds/types";

/**
 * The Pro/Portfolio social-and-video band and press band, wearing each profile
 * template's own section chrome.
 *
 * WHY ONE SHARED COMPONENT INSTEAD OF THREE INLINE BLOCKS
 * The Noir / Lumen / Atelier layouts each sit within a few lines of the 800-line
 * `max-lines` ceiling, and crossing it would enroll them in the size ratchet —
 * a different PR. Keeping the chrome here costs each layout one import and one
 * JSX line. LightProfileLayout renders the bands directly because it has a
 * translator prop (`t`) and the room to use it.
 *
 * Both bands self-hide when their list is empty, and both lists arrive already
 * tier-filtered and URL-validated from the repository — [] for a free talent.
 */
export function TalentExtrasBands({
  family,
  locale,
  embeds,
  press,
  nextNo,
}: {
  family: "noir" | "lumen" | "atelier";
  locale: string;
  embeds: PublicTalentEmbed[];
  press: PublicTalentPressItem[];
  /** Atelier only — its running section counter. */
  nextNo?: () => string | number;
}) {
  const labels = {
    embedsEyebrow: pickLocale(locale, { en: "Social", es: "Social" }),
    embedsTitle: pickLocale(locale, {
      en: "Social & video.",
      es: "Social y video.",
    }),
    pressEyebrow: pickLocale(locale, { en: "Press", es: "Prensa" }),
    pressTitle: pickLocale(locale, { en: "In the press.", es: "En la prensa." }),
  };

  const hasEmbeds = embeds.length > 0;
  const hasPress = press.length > 0;
  if (!hasEmbeds && !hasPress) return null;

  if (family === "noir") {
    return (
      <>
        {hasEmbeds ? (
          <section
            className="nf-wrap nf-section"
            data-profile-section="talent-embeds"
            data-nf-reveal
          >
            <div className="nf-sec-head">
              <div>
                <span className="nf-eyebrow">{labels.embedsEyebrow}</span>
                <h2>{labels.embedsTitle}</h2>
              </div>
            </div>
            <PublicTalentEmbeds items={embeds} heading="" />
          </section>
        ) : null}
        {hasPress ? (
          <section
            className="nf-wrap nf-section"
            data-profile-section="talent-press"
            data-nf-reveal
          >
            <div className="nf-sec-head">
              <div>
                <span className="nf-eyebrow">{labels.pressEyebrow}</span>
                <h2>{labels.pressTitle}</h2>
              </div>
            </div>
            <PublicTalentPressBand items={press} heading="" />
          </section>
        ) : null}
      </>
    );
  }

  if (family === "lumen") {
    return (
      <>
        {hasEmbeds ? (
          <section
            data-profile-section="talent-embeds"
            aria-labelledby="lm-embeds-heading"
          >
            <div className="lm-sec-head">
              <span className="lm-eyebrow">{labels.embedsEyebrow}</span>
              <h2 id="lm-embeds-heading">{labels.embedsTitle}</h2>
            </div>
            <PublicTalentEmbeds items={embeds} heading="" />
          </section>
        ) : null}
        {hasPress ? (
          <section
            data-profile-section="talent-press"
            aria-labelledby="lm-press-heading"
          >
            <div className="lm-sec-head">
              <span className="lm-eyebrow">{labels.pressEyebrow}</span>
              <h2 id="lm-press-heading">{labels.pressTitle}</h2>
            </div>
            <PublicTalentPressBand items={press} heading="" />
          </section>
        ) : null}
      </>
    );
  }

  return (
    <>
      {hasEmbeds ? (
        <section className="at-col at-section" data-profile-section="talent-embeds">
          <div className="at-head">
            {nextNo ? <span className="at-head__no">{nextNo()}</span> : null}
            <span className="at-head__dash" aria-hidden="true" />
            <span className="at-head__label">{labels.embedsEyebrow}</span>
          </div>
          <PublicTalentEmbeds items={embeds} heading="" />
        </section>
      ) : null}
      {hasPress ? (
        <section className="at-col at-section" data-profile-section="talent-press">
          <div className="at-head">
            {nextNo ? <span className="at-head__no">{nextNo()}</span> : null}
            <span className="at-head__dash" aria-hidden="true" />
            <span className="at-head__label">{labels.pressEyebrow}</span>
          </div>
          <PublicTalentPressBand items={press} heading="" />
        </section>
      ) : null}
    </>
  );
}
