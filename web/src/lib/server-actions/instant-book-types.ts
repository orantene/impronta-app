/**
 * Client-safe instant-book payload/result types.
 *
 * Kept OUT of `instant-book-action.ts` (`"use server"`) so catalog / booking
 * client islands can import types without pulling the server-action module
 * graph into a vanity Max SSR path.
 */

import type { OfferingTaskBrief } from "@/lib/talent/offering-task-brief";

export type InstantBookFormPayload = {
  talentProfileId: string;
  tenantId: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  eventDate?: string | null;
  eventLocation?: string | null;
  /** TUL-436: the client's place for services delivered there; the server re-validates it against the offering. */
  serviceAddress?: { address?: string | null; note?: string | null } | null;
  sourcePage?: string | null;
  offeringId?: string | null;
  payInPerson?: boolean;
  variantId?: string | null;
  addOnIds?: string[];
  /** Gridline G9b: task-picker brief (task + editable note). Clamped server-side. */
  brief?: OfferingTaskBrief | null;
  quantity?: number;
  reservation?: { startsAt: string; endsAt: string; timezone: string } | null;
  captchaToken?: string | null;
  honeypot?: string | null;
  /** The language the guest is browsing in (the booking sheet's locale). TUL-93. */
  locale?: string | null;
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
