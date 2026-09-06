/**
 * The DIRECTORY half of launch readiness: what a talent profile needs before
 * being advertised to search.
 *
 * VERIFIED WITH DIRECTORY, 2026-09-06. Written first without them and shipped
 * with every criterion flagged unverified; they then re-measured production
 * rather than endorsing the five-day-old audit table, confirmed the four and
 * their order, added a fifth, and gave the thresholds the publish gate already
 * uses. The flags below are true because of that ruling, not because time
 * passed.
 *
 * The thresholds are Directory's, from `buildCorePublishRequirements` in
 * `lib/field-engine/profile-publish-requirements.ts`, which is the floor the
 * product actually enforces. Where their bar was stricter than mine, theirs is
 * encoded: a bio is 30 characters, not merely present.
 *
 * ## Why this half is now urgent, and it is not the same reason as the site half
 *
 * PR #1814 fixed a real bug: `sitemap.ts` emitted `/t/<code>` profile pages but
 * gated on `talent_sites.status = "published"`, a different object. Measured:
 * 5 microsite rows, 0 published, 79 profiles passing the public gate, and
 * therefore 0 of 77 live profile pages advertised. That was the right fix and
 * it took the sitemap from 0 to 77.
 *
 * The directory audit measured the other half of the picture on 2026-09-01:
 * of 78 publicly listed profiles, exactly ONE meets the publish floor in
 * `profile-publish-requirements.ts`. Directory re-measured on 2026-09-06
 * across 79 listed profiles and it is still exactly ONE: 51 fail the bio bar,
 * 43 language, 28 photos, 27 home base, 4 primary type, 0 stage name.
 *
 * Put together: we have just gone from advertising none of our thin profiles
 * to advertising all of them. That is not an argument against #1814, which
 * fixed a genuine bug on a product whose directory exists to get people found.
 * It is the reason the floor now matters more than it did last week, and the
 * audit's Finding 2 named it before either of us: the LISTING gate and the
 * PUBLISH gate are different, and only the listing gate is enforced.
 *
 * ## Scope
 *
 * Copy and criteria only, exactly like `criteria.ts` for sites. No gating, no
 * database reads, no change to `profile-publish-requirements.ts`, which is
 * Directory's file and the actual enforcement point. This is the vocabulary a
 * talent would read, aligned to the five things profiles measurably fail on.
 *
 * ## If you implement a checker against these, read this first
 *
 * Directory hit all three of these in production and passed them on:
 *   - The BIO LIVES IN TWO COLUMNS, `bio_i18n` (3 profiles) and `short_bio`
 *     (28). A first query reading only `bio_i18n->>'en'` reported 78 of 79
 *     failing; the truth is 51. Take max(length) across every locale in
 *     `bio_i18n` AND `short_bio`. A checker that reads one column condemns 27
 *     profiles that have a perfectly good bio, and looks authoritative doing
 *     it. Same shape as the four-stores-per-profile trap this area keeps
 *     hitting: a field's value is not in the one place its name suggests.
 *   - PHOTOS are `media_assets.owner_talent_profile_id`. There is no
 *     `talent_profile_id` column on that table.
 *   - HOME BASE is the `residence_city_id` FK, not `home_city_text`. #1772
 *     made the FK canonical because the free text held "Mexico", "mexico" and
 *     "México" as three values and paired "Buenos Aires" with "Mexico".
 */

export type ProfileReadinessKey =
  | "bio"
  | "language"
  | "photos"
  | "home-base"
  | "primary-type";

export type ProfileReadinessCriterion = {
  key: ProfileReadinessKey;
  /**
   * How many of the 78 publicly listed profiles failed this on 2026-09-01.
   * Recorded so the list stays ordered by real failure rather than by taste,
   * and so a later audit can show whether any of this moved.
   */
  failingAtAudit: number;
  /**
   * The bar, in Directory's words, from `buildCorePublishRequirements`. Kept
   * verbatim so this file and the publish gate cannot drift into two different
   * definitions of the same criterion while both look correct.
   */
  threshold: string;
  /**
   * True only where Directory has read and agreed the wording and the rule.
   * All five were agreed on 2026-09-06 against a fresh production measurement.
   */
  verifiedWithDirectory: boolean;
  /**
   * "required" = the profile does not work without it. "upgrade" = it makes the
   * profile better and nothing is broken without it.
   *
   * This is a field rather than a tone of voice because we already shipped a
   * ruling on one of them. J9 (#1770) rebuilt the empty talent card to a
   * ratified Creative canvas on the principle that structure and type carry
   * the credibility and the picture is an upgrade rather than a dependency.
   * A checklist that then tells a talent their profile is not ready without a
   * photograph contradicts a card we deliberately built to work without one.
   */
  weight: "required" | "upgrade";
  en: { label: string; stillNeeds: string };
  es: { label: string; stillNeeds: string };
};

export const PROFILE_READINESS_CRITERIA: readonly ProfileReadinessCriterion[] = [
  {
    key: "bio",
    threshold: "activeBioLength >= 30",
    weight: "required",
    failingAtAudit: 51,
    verifiedWithDirectory: true,
    en: {
      label: "A few sentences about you",
      stillNeeds:
        "Your profile has no description yet. Two or three sentences about what you do and who you do it for is enough, and it is the part a client reads first.",
    },
    es: {
      label: "Unas líneas sobre ti",
      stillNeeds:
        "Tu perfil todavía no tiene descripción. Dos o tres frases sobre lo que haces y para quién lo haces bastan, y es lo primero que lee un cliente.",
    },
  },
  {
    key: "language",
    threshold: "languageCount > 0",
    weight: "required",
    failingAtAudit: 43,
    verifiedWithDirectory: true,
    en: {
      label: "The languages you work in",
      stillNeeds:
        "Add the languages you can work in. Clients filter by this, so a profile without it is invisible to anyone who searches that way.",
    },
    es: {
      label: "Los idiomas en los que trabajas",
      stillNeeds:
        "Agrega los idiomas en los que puedes trabajar. Los clientes filtran por eso, así que un perfil sin idiomas es invisible para quien busca así.",
    },
  },
  {
    key: "photos",
    threshold: "totalPhotos >= 3",
    weight: "upgrade",
    /**
     * UNRESOLVED, AND DELIBERATELY RECORDED RATHER THAN DECIDED HERE.
     *
     * These two lines disagree with each other, and both are correct about
     * their own subject. The publish gate ENFORCES three photographs. J9
     * (#1770) rebuilt the empty talent card to a Creative canvas the CEO
     * ratified, on the principle that structure and type carry the credibility
     * and the picture is an upgrade rather than a dependency; Directory asked
     * that this stay a warning and not a gate.
     *
     * So the product currently refuses to publish a profile that its own card
     * is built to display well. This file is marketing copy and cannot settle
     * that. It says "upgrade" because that is what a talent should be told by
     * a checklist, and it records the enforced bar as 3 so nobody reads this
     * as evidence the gate is looser than it is. Whoever owns the gate should
     * decide which one moves.
     */
    failingAtAudit: 28,
    verifiedWithDirectory: true,
    en: {
      label: "Photographs",
      stillNeeds:
        "Three photographs is the bar the profile is measured against, and it is the single fastest upgrade to this one. Add none and the card is still built to look right.",
    },
    es: {
      label: "Fotos",
      stillNeeds:
        "El perfil se mide contra tres fotos, y son la mejora más rápida para este. Si no subes ninguna, la tarjeta igual está hecha para verse bien.",
    },
  },
  {
    key: "home-base",
    threshold: "residence_city_id present",
    weight: "required",
    failingAtAudit: 27,
    /**
     * COUNT IS SOFT. The 27 was measured on the free-text home-country
     * field, which held "Mexico", "mexico" and "México" as three
     * different values across 53 rows, and a city label composed from
     * two independent free-text fields once put "Buenos Aires, Mexico"
     * on the live directory. #1772 makes residence_city_id -> locations
     * -> countries canonical. Anything that later ENFORCES this must
     * read the FK; a check against the text passes on a string that
     * means nothing. Raised by Directory, 2026-09-06.
     */
    verifiedWithDirectory: true,
    en: {
      label: "Where you are based",
      stillNeeds:
        "Say where you are based. Most searches are a kind of work plus a place, and without a location you are missing from all of them.",
    },
    es: {
      label: "Dónde estás basado",
      stillNeeds:
        "Di dónde estás basado. Casi todas las búsquedas son un tipo de trabajo más un lugar, y sin ubicación no apareces en ninguna.",
    },
  },
  {
    key: "primary-type",
    weight: "required",
    threshold: "primaryType present",
    /**
     * Added by Directory on 2026-09-06, not by the audit. It gates no
     * ADDITIONAL profile today — the original four and the full six both pass
     * exactly one of 79 — so it costs nothing now and closes a hole that opens
     * the moment somebody publishes without a type.
     */
    failingAtAudit: 4,
    verifiedWithDirectory: true,
    en: {
      label: "What you do",
      stillNeeds:
        "Pick what you do. Without it the profile cannot be filed under anything, so it never comes up when someone browses for that work.",
    },
    es: {
      label: "A qué te dedicas",
      stillNeeds:
        "Elige a qué te dedicas. Sin eso el perfil no se puede clasificar, así que no aparece cuando alguien busca ese trabajo.",
    },
  },
];

/** Criteria no one at Directory has signed off yet. Empty is the goal. */
export function unverifiedWithDirectory(): ProfileReadinessCriterion[] {
  return PROFILE_READINESS_CRITERIA.filter((c) => !c.verifiedWithDirectory);
}
