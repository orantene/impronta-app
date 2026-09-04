import "server-only";

import * as React from "react";
import ClientTableReserved from "../../../emails/client/TableReserved";
import type { AudienceContext, CatalogEntry, NotificationEvent } from "./types";
import { str } from "./catalog-audiences";
import { buildConfirmation, type ConfirmationLocale } from "@/lib/reservations";
import { resolveTenantTimezone } from "@/lib/spaces/venues";
import { logServerError } from "@/lib/server/safe-error";

/**
 * A TABLE reservation's confirmation.
 *
 * IF YOU ARE HERE BECAUSE YOU FOUND TWO RESERVATION CATALOGS AND ASSUMED ONE IS
 * A DUPLICATE: they are not. Do not merge them. Read the next paragraph.
 *
 * WHY THIS IS A SEPARATE FILE FROM `catalog-entries-reservation.ts`. That one
 * rides the INQUIRY SPINE — `loadInquiryView`, `event.inquiryId` — because it
 * serves the appointments product, where a "reservation" is a request that
 * becomes a conversation. A table booking is an ORDER plus an ADMISSION and has
 * no inquiry at all, so every audience resolver and hydrator over there returns
 * nothing for it. Two products, one word; that collision is why the plan says
 * never to name a table booking after the word "reservation" in code. This file
 * is the cheapest bill that collision will ever send; merging the two would be
 * the expensive one, because the resolvers are incompatible rather than merely
 * different and the failure is a confirmation that silently never sends.
 *
 * THE COPY LIVES IN `lib/reservations/confirmation.ts` AND IS TESTED THERE.
 * This file resolves the venue's timezone and hands it over. The email and the
 * `/r/<code>` receipt must both call `buildConfirmation`, or a guest gets two
 * different cancellation deadlines from two surfaces that both look official.
 */

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function localeOf(v: unknown): ConfirmationLocale {
  return v === "es" ? "es" : "en";
}

/**
 * Resolve the venue's clock and build the confirmation body.
 *
 * A hydrator that throws degrades to the bare event, so a failure here would
 * silently send an email with no body rather than none at all. Both failure
 * paths therefore set `confirmationFailed`, and the template refuses to render
 * on it — a confirmation naming no time is worse than a retry.
 */
async function hydrateTableReservation(
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<Record<string, unknown>> {
  const startsAtIso = str(event.payload.startsAt);
  const venueId = str(event.payload.venueId);
  if (!startsAtIso || !event.tenantId) return { confirmationFailed: true };

  const startsAt = new Date(startsAtIso);
  if (Number.isNaN(startsAt.getTime())) return { confirmationFailed: true };

  try {
    const tz = await resolveTenantTimezone(event.tenantId, venueId ?? undefined);
    // No fallback to UTC. buildConfirmation refuses an unresolvable zone for the
    // same reason: a confirmation naming the wrong hour is worse than one that
    // did not send, because the guest acts on it and arrives to a shut door.
    if (!tz?.timezone) return { confirmationFailed: true };

    const content = buildConfirmation({
      locale: localeOf(event.payload.locale),
      venueName: str(event.payload.venueName) ?? "",
      timeZone: tz.timezone,
      guestName: str(event.payload.guestName),
      partySize: num(event.payload.partySize, 1),
      startsAt,
      collectedCents: num(event.payload.collectedCents, 0),
      cardOnFile: event.payload.cardOnFile === true,
      freeCancelHours: num(event.payload.freeCancelHours, 2),
      graceMinutes: num(event.payload.graceMinutes, 15),
      addressLine: str(event.payload.addressLine),
    });
    if (!content) return { confirmationFailed: true };

    return {
      confirmationFailed: false,
      confirmationSubject: content.subject,
      confirmationHeading: content.heading,
      confirmationLines: content.lines,
    };
  } catch (err) {
    logServerError("notifications.hydrateTableReservation", err);
    return { confirmationFailed: true };
  }
}

/**
 * The guest, by email, with no account.
 *
 * A table booking's whole point is that it works without one, so there is no
 * user id to resolve and `guest:<email>` is the dedupe identity.
 */
async function tableGuest(event: NotificationEvent): Promise<
  Array<{ kind: "guest"; email: string; displayName?: string | null; role?: "guest" }>
> {
  const email = str(event.payload.guestEmail);
  if (!email) return [];
  return [
    { kind: "guest", email, displayName: str(event.payload.guestName), role: "guest" },
  ];
}

const TABLE_RESERVED_GUEST: CatalogEntry = {
  id: "reservation.table.confirmed",
  category: "inquiry_updates",
  defaultChannels: ["email"],
  required: false,
  triggers: ["reservation.table.confirmed"],
  hydrate: hydrateTableReservation,
  resolveAudience: tableGuest,
  email: {
    templateId: "client.table_reserved",
    subject: (event) =>
      str(event.payload.confirmationSubject) ?? "Your table is booked",
    render: ({ event, brand, unsubscribeUrl }) => {
      const lines = Array.isArray(event.payload.confirmationLines)
        ? (event.payload.confirmationLines as unknown[]).filter(
            (l): l is string => typeof l === "string",
          )
        : [];
      return React.createElement(ClientTableReserved, {
        heading: str(event.payload.confirmationHeading) ?? "You are booked.",
        lines,
        brand,
        unsubscribeUrl,
        categoryLabel: "reservation",
      });
    },
  },
};

export const TABLE_RESERVATION_CATALOG_ENTRIES: CatalogEntry[] = [TABLE_RESERVED_GUEST];
