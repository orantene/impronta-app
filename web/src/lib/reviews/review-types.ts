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
};

export type ReviewableBooking = {
  bookingId: string;
  talentProfileId: string;
  talentName: string | null;
  eventTitle: string | null;
  eventDate: string | null;
  existingReview: { rating: number; body: string | null } | null;
};
