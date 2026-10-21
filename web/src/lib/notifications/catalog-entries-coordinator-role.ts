import "server-only";

import type { CatalogEntry } from "./types";
import { eventUser, str } from "./catalog-audiences";
import { roleMessage } from "../coordinator/event-board";

/**
 * TUL-1470: a coordinator put one person on a role of a multi-person job. The person gets ONLY
 * their own part (role, call time, event) in their own language, as a bell. No email (the
 * message is short and personal), and never the other roles, the client or any money.
 * Dispatched by `producers/coordinator-role-notify.ts`.
 */
export const COORDINATOR_ROLE_CATALOG_ENTRIES: CatalogEntry[] = [
  {
    id: "coordinator.role_assigned.talent",
    category: "roster_activity",
    defaultChannels: ["in_app"],
    required: false,
    triggers: ["coordinator.role_assigned"],
    resolveAudience: eventUser("talent"),
    in_app: {
      kind: "system",
      surface: "talent",
      title: (e, recipient) =>
        (recipient.locale ?? "").toLowerCase().startsWith("es")
          ? `Tu rol en ${str(e.payload.eventTitle) ?? "un trabajo"}`
          : `Your role in ${str(e.payload.eventTitle) ?? "a job"}`,
      body: (e, recipient) =>
        roleMessage({
          role: { role: str(e.payload.role) ?? "" },
          person: { locale: recipient.locale ?? "en" },
          eventTitle: str(e.payload.eventTitle) ?? "",
          startsAt: str(e.payload.startsAt),
          timeZone: str(e.payload.timeZone) ?? "UTC",
        }),
    },
  },
];
