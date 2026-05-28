import "server-only";

import * as React from "react";
import NewWorkspaceAlert from "../../../emails/platform/NewWorkspaceAlert";
import type { CatalogEntry } from "./types";

/**
 * The notification catalog — a code-driven registry, one entry per
 * notification type (spec §2.1). Templates are React components, audience
 * resolvers are TypeScript functions, channels are compile-time imports.
 *
 * Phase 2 ships a single self-test entry so the full pipeline (audience →
 * prefs → dedupe log → channel handlers) is exercised end-to-end without
 * touching real engine events. The full ~41-entry inventory (spec §6) is
 * populated in Phase 5 when engine events are wired through the dispatcher.
 *
 * To run the self-test manually once Phase 1 is applied:
 *   dispatchEventNotifications({
 *     type: "notification.selftest",
 *     tenantId: "<a real tenant id>",
 *     userId: "<your user id>",
 *     eventId: crypto.randomUUID(),
 *     payload: {},
 *   })
 */
const SELF_TEST: CatalogEntry = {
  id: "platform.notification_selftest",
  category: "platform_alerts",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["notification.selftest"],
  resolveAudience: async (event) => {
    if (!event.userId) return [];
    return [{ kind: "user", userId: event.userId, role: "platform_admin" }];
  },
  in_app: {
    kind: "system",
    surface: "workspace",
    title: () => "Notification engine self-test",
    body: () => "If you can see this, the in-app channel is wired correctly.",
  },
  email: {
    templateId: "platform.notification_selftest",
    subject: () => "Tulala notification engine — self-test",
    render: ({ event, brand }) =>
      React.createElement(NewWorkspaceAlert, {
        workspaceName: String(event.payload.workspaceName ?? "Self-test workspace"),
        ownerEmail: String(event.payload.ownerEmail ?? "selftest@tulala.digital"),
        planLabel: String(event.payload.planLabel ?? "Agency"),
        adminUrl: String(event.payload.adminUrl ?? "https://tulala.digital/platform/admin"),
        brand,
      }),
  },
};

export const NOTIFICATION_CATALOG: CatalogEntry[] = [SELF_TEST];

/** All catalog entries that subscribe to a given domain event type. */
export function findCatalogEntries(eventType: string): CatalogEntry[] {
  return NOTIFICATION_CATALOG.filter((entry) => entry.triggers.includes(eventType));
}
