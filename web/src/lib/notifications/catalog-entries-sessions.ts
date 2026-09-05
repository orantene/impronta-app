import "server-only";

import * as React from "react";
import ClientSessionReminder from "../../../emails/client/SessionReminder";
import type { CatalogEntry, NotificationEvent } from "./types";
import { str } from "./catalog-audiences";

/**
 * The day-before reminder for a session — a class, a show, a departure.
 *
 * EMAIL ONLY, TO A GUEST, BY EMAIL ADDRESS. A class member usually has no
 * account: they bought a seat with an email and that is the whole point. So
 * there is no user id to resolve, `guest:<email>` is the dedupe identity, and
 * there is deliberately **no `in_app` block** — an in-app notification for
 * somebody who never signs in is a notification nobody reads.
 *
 * THE COPY IS NOT IN HERE. `buildSessionReminder` produces the subject, heading
 * and lines in the VENUE's clock with the zone named, and the cron puts them on
 * the payload. This renders what it was given. A template that formatted its own
 * time would be a second place the venue's clock could be got wrong, and it
 * would be got wrong in the direction nobody sees until a customer misses a
 * class.
 *
 * IF THE COPY IS MISSING, NOTHING SENDS. The cron refuses to emit an event it
 * could not build copy for — no zone, no reminder — so a payload without a
 * heading is a bug rather than a case to paper over with a default. The subject
 * falls back only so a malformed event cannot render an email with an empty
 * subject line; it is not an expected path.
 */

const SESSION_REMINDER_GUEST: CatalogEntry = {
  id: "session.reminder.client",
  category: "inquiry_updates",
  defaultChannels: ["email"],
  required: false,
  triggers: ["session.reminder"],
  resolveAudience: async (event: NotificationEvent) => {
    const email = str(event.payload.holderEmail);
    if (!email) return [];
    return [
      {
        kind: "guest" as const,
        email,
        displayName: str(event.payload.holderName),
        role: "guest" as const,
      },
    ];
  },
  email: {
    templateId: "client.session_reminder",
    subject: (event) => str(event.payload.subject) ?? "Your class is tomorrow",
    render: ({ event, brand, unsubscribeUrl }) => {
      const lines = Array.isArray(event.payload.lines)
        ? (event.payload.lines as unknown[]).filter((l): l is string => typeof l === "string")
        : [];
      return React.createElement(ClientSessionReminder, {
        heading: str(event.payload.heading) ?? "Your class is tomorrow.",
        lines,
        brand,
        unsubscribeUrl,
        categoryLabel: "reminder",
      });
    },
  },
};

export const SESSION_CATALOG_ENTRIES: CatalogEntry[] = [SESSION_REMINDER_GUEST];
