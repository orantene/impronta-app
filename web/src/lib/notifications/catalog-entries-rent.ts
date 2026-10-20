import "server-only";

import * as React from "react";
import RentPlanMemberResponse from "../../../emails/workspace/RentPlanMemberResponse";
import type { CatalogEntry } from "./types";
import { str, workspaceOwner } from "./catalog-audiences";
import { pageUrl } from "./catalog-render";

/**
 * TUL-1448: a member declined a proposed station rent, or ended an active plan. Email + bell to
 * the workspace OWNER (the one who proposes rent). Dispatched directly by the rent producers
 * (`producers/rent-notify.ts`); the eventId carries plan id + outcome so a retry is deduped.
 */
function rentEntry(outcome: "declined" | "ended"): CatalogEntry {
  const event = outcome === "declined" ? "rent.plan_declined" : "rent.plan_ended_by_member";
  const templateId = outcome === "declined" ? "rent.plan_declined" : "rent.plan_ended";
  const isEs = (l: string | null | undefined) => (l ?? "").toLowerCase().startsWith("es");
  const who = (p: Record<string, unknown>, es: boolean) => str(p.memberName) ?? (es ? "Un miembro" : "A member");
  return {
    id: `${event}.workspace`,
    category: "roster_activity",
    defaultChannels: ["email", "in_app"],
    required: false,
    triggers: [event],
    resolveAudience: workspaceOwner,
    in_app: {
      kind: "system",
      surface: "workspace",
      title: (e, recipient) => {
        const es = isEs(recipient.locale);
        const w = who(e.payload, es);
        if (outcome === "declined") return es ? `${w} rechazó la renta del puesto` : `${w} declined the station rent`;
        return es ? `${w} terminó su renta del puesto` : `${w} ended their station rent`;
      },
      body: (_e, recipient) => {
        const es = isEs(recipient.locale);
        return es ? "Revisa la tarjeta de renta de puestos." : "Review the Station rent card.";
      },
    },
    email: {
      templateId,
      subject: (e, recipient) => {
        const es = isEs(recipient.locale);
        const w = who(e.payload, es);
        if (outcome === "declined") return es ? `${w} rechazó la renta del puesto` : `${w} declined the station rent`;
        return es ? `${w} terminó su renta del puesto` : `${w} ended their station rent`;
      },
      render: ({ event: e, recipient, brand, unsubscribeUrl }) =>
        React.createElement(RentPlanMemberResponse, {
          outcome,
          recipientName: recipient.displayName,
          memberName: str(e.payload.memberName),
          rentUrl: str(e.payload.rentUrl) ?? pageUrl(brand, "/admin/settings/rent"),
          brand,
          unsubscribeUrl,
          categoryLabel: "roster",
        }),
    },
  };
}

export const RENT_CATALOG_ENTRIES: CatalogEntry[] = [rentEntry("declined"), rentEntry("ended")];
