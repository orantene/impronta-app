import "server-only";

import * as React from "react";
import ClientOrderReady from "../../../emails/client/OrderReady";
import type { CatalogEntry, NotificationEvent } from "./types";
import { str, workspaceAdmins } from "./catalog-audiences";

function guestReady(event: NotificationEvent) {
  const email = str(event.payload.guestEmail);
  if (!email) return Promise.resolve([]);
  return Promise.resolve([
    {
      kind: "guest" as const,
      email,
      displayName: str(event.payload.guestName),
      role: "guest" as const,
    },
  ]);
}

const PREP_READY_GUEST: CatalogEntry = {
  id: "prep.order_ready.guest",
  category: "bookings",
  defaultChannels: ["email"],
  required: false,
  triggers: ["prep.order_ready"],
  resolveAudience: guestReady,
  email: {
    templateId: "client.order_ready",
    subject: (event) => str(event.payload.subject) ?? "Your order is ready",
    render: ({ event, brand, unsubscribeUrl }) => {
      const lines = Array.isArray(event.payload.lines)
        ? (event.payload.lines as unknown[]).filter((l): l is string => typeof l === "string")
        : [];
      return React.createElement(ClientOrderReady, {
        heading: str(event.payload.heading) ?? "Your order is ready.",
        lines,
        brand,
        unsubscribeUrl,
        categoryLabel: "order",
      });
    },
  },
};

const PREP_READY_STAFF: CatalogEntry = {
  id: "prep.order_ready.staff",
  category: "workspace_activity",
  defaultChannels: ["in_app"],
  required: false,
  triggers: ["prep.order_ready"],
  resolveAudience: workspaceAdmins,
  in_app: {
    kind: "ticket",
    surface: "workspace",
    title: (event) => str(event.payload.staffTitle) ?? "Order ready",
    body: (event) => str(event.payload.staffBody) ?? "A ticket is ready for handoff.",
  },
};

export const PREP_CATALOG_ENTRIES: CatalogEntry[] = [PREP_READY_GUEST, PREP_READY_STAFF];
