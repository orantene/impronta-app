/**
 * MaisonContent — the OPTIONAL editorial block of the Maison template.
 *
 * The template renders from the SAME props every other profile template gets
 * (LightProfileLayoutProps: name, aboutText, storefrontOfferings, galleryItems,
 * resolvedSkills, livesIn …). This block only carries the handful of editorial
 * strings a service professional's landing page wants that the talent profile
 * has no column for today.
 *
 * v2 (2026-09-23) follows the shortened architecture: hero → the artist →
 * services → results → appointment + FAQ → closing. The old featured-services,
 * signature-band, benefit-band and booking-steps fields are gone with the
 * sections they fed; their information now lives in the hero, the category note
 * and the appointment facts, so nothing was lost but the repetition.
 *
 * Every field is optional and every one has a derived fallback, so a profile
 * that has authored none of it still renders a complete page — see
 * `resolveMaisonContent` in MaisonProfileLayout.tsx.
 *
 * Where each field WILL come from once the capability lands is recorded in
 * docs/mockups/jor-beauty-profile-2026-09-22.md.
 */

import type { MaisonShot } from "./MaisonGallery";
import type { MaisonContactChannels } from "./MaisonContact";

export type MaisonFaqItem = {
  q: string;
  a: string;
  /**
   * An ordered answer. "How do I book?" is a QUESTION, so it belongs in the
   * accordion rather than in a parallel block beside it — but its answer is a
   * sequence, so it renders as numbered steps instead of a paragraph.
   */
  steps?: { title: string; detail: string }[];
};

export type MaisonContent = {
  /**
   * The talent's own brand mark, when she has one. Falls back to the
   * typographic wordmark, so a profile without a logo is never broken.
   */
  wordmarkImageUrl?: string | null;
  /** Intrinsic width/height of that mark, for a layout-shift-free render. */
  wordmarkImageRatio?: number | null;

  /** Small line above the headline. Falls back to the city. */
  heroKicker?: string | null;
  /** Headline, split so the accent half can be set in display italic. */
  heroTitle?: string | null;
  heroTitleAccent?: string | null;
  /** Hero paragraph. Falls back to the first paragraph of the public bio. */
  heroLead?: string | null;
  /** Dominant hero image. Falls back to bannerUrl → first gallery item. */
  heroImageUrl?: string | null;
  /** Smaller inset that overlaps the dominant image. Hidden when absent. */
  heroInsetUrl?: string | null;
  /** Short facts under the hero actions ("7 años de experiencia"). Derived from skills when absent. */
  heroFacts?: string[];

  /** Words for the moving band under the hero. Derived from categories when absent. */
  marquee?: string[];

  /** "Hola, soy Jorgelina" — the artist band directly under the hero. */
  artist?: {
    greeting: string;
    /** Two strong paragraphs. The rest goes in `more`. */
    paragraphs: string[];
    moreLabel?: string | null;
    more?: string[];
  } | null;

  /** Ordered menu tabs with an optional per-category note. */
  menuCategories?: { id: string; label: string; note?: string | null }[];
  /** One honest line under the services heading (e.g. the currency statement). */
  menuNote?: string | null;

  /** Curated results. Falls back to the profile's gallery items, uncaptioned. */
  gallery?: MaisonShot[];
  /** Shown under the gallery — e.g. that the images are illustrative. */
  galleryNote?: string | null;

  /** Practical appointment information, as icon + label + value rows. */
  visiting?: {
    /**
     * An AREA map — neighbourhood level, no precise pin. Optional on purpose:
     * a talent working from a private studio can leave it off entirely, and
     * the band simply renders without it.
     */
    map?: { imageUrl: string; caption: string; attribution?: string | null } | null;
    facts: {
      label: string;
      value: string;
      /** Picks the row's icon. Unknown/absent falls back to a neutral dot. */
      icon?: "place" | "studio" | "days" | "clock" | "languages" | "heart";
    }[];
  } | null;

  /**
   * Reachable channels. Maps onto `talent_profiles.phone` and the
   * `talent_integration_items` rows flagged `public_profile_enabled`; an
   * absent channel renders nothing rather than a dead button.
   */
  contact?: MaisonContactChannels | null;

  /** One short line above the FAQ accordion. */
  faqIntro?: string | null;
  faq?: MaisonFaqItem[];

  /** Closing invitation. */
  closing?: { title: string; titleAccent?: string | null; body: string } | null;
};
