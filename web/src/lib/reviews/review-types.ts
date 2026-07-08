/**
 * Shared plain types for the client→talent reviews / ratings feature.
 *
 * This module exports ONLY types — it is safe to import from "use server"
 * action modules, public pages, and client components alike.
 *
 * Contract owner: Agent 1. Kept identical across all agents in this wave.
 */

export type TalentReview = {
  id: string;
  talentProfileId: string;
  bookingId: string | null;
  clientUserId: string;
  clientName: string | null;
  rating: number;
  body: string | null;
  status: "published" | "hidden";
  createdAt: string;
};

export type TalentRatingSummary = {
  average: number;
  count: number;
  /** 0-100 STANDING "would book again" signal from verified reviews; null when unknown. */
  wouldBookAgainPct?: number | null;
};

/**
 * An INVITED testimonial — a quote attested/imported by agency staff about a
 * talent. Walled off from verified booking reviews: the optional `rating` is
 * DISPLAY-ONLY and MUST NEVER be blended into a talent's star average or any
 * STANDING signal. Rendered in a clearly-labeled block distinct from reviews.
 */
export type Testimonial = {
  id: string;
  authorName: string | null;
  authorRole: string | null;
  body: string;
  /** Display-only, per-card. Never aggregated. Null when not provided. */
  rating: number | null;
  createdAt: string;
};

/** How a testimonial entered the system (provenance, informational only). */
export type TestimonialSource = "requested" | "imported" | "manual";

export type ReviewableBooking = {
  bookingId: string;
  talentProfileId: string;
  talentName: string | null;
  eventTitle: string | null;
  eventDate: string | null;
  /**
   * The caller-client's existing review of this talent on this booking, with the
   * full STANDING signal so the form prefills in edit mode. `publishedAt` anchors
   * the DB-enforced 48h client edit window (the form shows a countdown + locks
   * read-only when elapsed). Null when no review exists yet.
   */
  existingReview:
    | {
        rating: number;
        body: string | null;
        wouldBookAgain: boolean | null;
        attrProfessionalism: number | null;
        attrSkill: number | null;
        attrCommunication: number | null;
        attrReliability: number | null;
        traits: string[] | null;
        privateNote: string | null;
        anon: boolean;
        publishedAt: string | null;
      }
    | null;
};

// ---------------------------------------------------------------------------
// Two-sided reviews (W8): talent → client direction + shared helpers.
// ---------------------------------------------------------------------------

/** Which side a review is ABOUT. */
export type ReviewSubjectKind = "talent" | "client";

/**
 * A talent → client review. NOT public (clients have no public page). Visible to
 * the author (talent), the subject (client), tenant staff, platform admin.
 */
export type ClientReview = {
  id: string;
  tenantId: string;
  bookingId: string | null;
  authorUserId: string;
  authorName: string | null;
  clientUserId: string;
  rating: number;
  body: string | null;
  status: "published" | "hidden";
  createdAt: string;
};

/** Generic average + count, used for client-side aggregates computed on read. */
export type RatingSummary = {
  average: number;
  count: number;
};

/**
 * A booking a talent can leave a CLIENT review on — the counterparty client +
 * any existing client review by this talent.
 */
export type ReviewableCounterparty = {
  bookingId: string;
  clientUserId: string;
  clientName: string | null;
  eventTitle: string | null;
  eventDate: string | null;
  existingReview: { rating: number; body: string | null } | null;
};
