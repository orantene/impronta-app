import "server-only";

import type { CatalogEntry } from "./types";
import { str, workspaceManagersPlus } from "./catalog-audiences";

/**
 * TUL-1469: a talent raised a price and a service they list in this workspace now falls below the
 * workspace's minimum (the database stamps `floor_breached_at` and stops selling it). A bell to the
 * workspace Manager+ so someone can renegotiate; no email (it is a to-do, not a message).
 * Dispatched directly by `producers/listing-below-minimum-notify.ts`; the eventId carries the
 * listing and the breach time so a retry is deduped.
 */
const isEs = (l: string | null | undefined) => (l ?? "").toLowerCase().startsWith("es");

export const HUB_LISTING_CATALOG_ENTRIES: CatalogEntry[] = [
  {
    id: "hub.listing_below_minimum.workspace",
    category: "roster_activity",
    defaultChannels: ["in_app"],
    required: false,
    triggers: ["hub.listing_below_minimum"],
    resolveAudience: workspaceManagersPlus,
    in_app: {
      kind: "system",
      surface: "workspace",
      title: (e, recipient) => {
        const es = isEs(recipient.locale);
        const who = str(e.payload.talentName) ?? (es ? "Una persona de tu equipo" : "Someone on your team");
        const what = str(e.payload.serviceTitle) ?? (es ? "un servicio" : "a service");
        return es ? `${who} subió el precio de ${what}` : `${who} raised the price of ${what}`;
      },
      body: (_e, recipient) =>
        isEs(recipient.locale)
          ? "Ahora queda por debajo de tu precio mínimo y dejó de venderse. Revisa el servicio compartido."
          : "It is now below your minimum price and stopped selling. Review the shared service.",
    },
  },
];
