/**
 * Client-safe instant-book payload/result types.
 *
 * Kept OUT of `instant-book-action.ts` (`"use server"`) so catalog / booking
 * client islands can import types without pulling the server-action module
 * graph into a vanity Max SSR path.
 */

export type InstantBookFormPayload = {
  talentProfileId: string;
  tenantId: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  eventDate?: string | null;
  eventLocation?: string | null;
  sourcePage?: string | null;
  offeringId?: string | null;
  payInPerson?: boolean;
  variantId?: string | null;
  addOnIds?: string[];
  quantity?: number;
  reservation?: { startsAt: string; endsAt: string; timezone: string } | null;
  captchaToken?: string | null;
  honeypot?: string | null;
};

export type InstantBookActionResult =
  | { ok: true; inquiryId: string; bookingId: string; redirectPath: string }
  | {
      ok: false;
      error: string;
      needsAuth?: boolean;
      upgrade?: boolean;
      slotTaken?: boolean;
    };
