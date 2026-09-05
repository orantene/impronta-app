/**
 * The DIRECTORY half of launch readiness: what a talent profile needs before
 * being advertised to search.
 *
 * WRITTEN WITHOUT DIRECTORY. They have been silent to two messages and are on
 * two broken-writer fixes, and the CEO said not to wait. So every criterion
 * below is marked `verifiedWithDirectory: false` and is derived from measured
 * numbers in their own audit and sitemap work rather than from my judgement.
 * When they read this, the flags flip or the criteria change; do not treat
 * this file as agreed.
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
 * `profile-publish-requirements.ts`. 51 have no bio, 42 no language, 28 no
 * photos, 27 no home base, and 87 of 92 have a completeness score of zero.
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
 * talent would read, aligned to the four things profiles measurably fail on,
 * so nobody has to invent a fifth.
 */

export type ProfileReadinessKey = "bio" | "language" | "photos" | "home-base";

export type ProfileReadinessCriterion = {
  key: ProfileReadinessKey;
  /**
   * How many of the 78 publicly listed profiles failed this on 2026-09-01.
   * Recorded so the list stays ordered by real failure rather than by taste,
   * and so a later audit can show whether any of this moved.
   */
  failingAtAudit: number;
  /** False until Directory has read and agreed the wording and the rule. */
  verifiedWithDirectory: boolean;
  en: { label: string; stillNeeds: string };
  es: { label: string; stillNeeds: string };
};

export const PROFILE_READINESS_CRITERIA: readonly ProfileReadinessCriterion[] = [
  {
    key: "bio",
    failingAtAudit: 51,
    verifiedWithDirectory: false,
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
    failingAtAudit: 42,
    verifiedWithDirectory: false,
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
    failingAtAudit: 28,
    verifiedWithDirectory: false,
    en: {
      label: "At least one photograph",
      stillNeeds:
        "Add a photograph. A profile without one gets skipped in a grid of profiles that have them, whatever the words say.",
    },
    es: {
      label: "Al menos una foto",
      stillNeeds:
        "Agrega una foto. Un perfil sin foto se pasa de largo en una lista donde los demás sí tienen, por muy bueno que sea el texto.",
    },
  },
  {
    key: "home-base",
    failingAtAudit: 27,
    verifiedWithDirectory: false,
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
];

/** Criteria no one at Directory has signed off yet. Empty is the goal. */
export function unverifiedWithDirectory(): ProfileReadinessCriterion[] {
  return PROFILE_READINESS_CRITERIA.filter((c) => !c.verifiedWithDirectory);
}
