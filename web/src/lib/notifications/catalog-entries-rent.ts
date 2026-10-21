import "server-only";

import * as React from "react";
import RentPlanMemberResponse from "../../../emails/workspace/RentPlanMemberResponse";
import RentAutopayNotice from "../../../emails/workspace/RentAutopayNotice";
import type { CatalogEntry } from "./types";
import { eventUser, str, workspaceOwner } from "./catalog-audiences";
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

/**
 * TUL-1601: the MEMBER (the renting talent, `event.userId`) is told when an automatic monthly rent charge fails,
 * or when automatic payments stop. Dispatched by the rent subscription webhook; eventId = Stripe id + kind.
 */
function autopayEntry(kind: "failed" | "canceled"): CatalogEntry {
  const event = kind === "failed" ? "rent.autopay_failed" : "rent.autopay_canceled";
  const isEs = (l: string | null | undefined) => (l ?? "").toLowerCase().startsWith("es");
  const title = (es: boolean) =>
    kind === "failed"
      ? es ? "Tu pago automático de renta no se completó" : "Your automatic rent payment did not go through"
      : es ? "Los pagos automáticos de renta están desactivados" : "Automatic rent payments are off";
  return {
    id: `${event}.talent`,
    category: "billing",
    defaultChannels: ["email", "in_app"],
    required: kind === "failed",
    triggers: [event],
    resolveAudience: eventUser("talent"),
    in_app: {
      kind: "system",
      surface: "talent",
      title: (_e, recipient) => title(isEs(recipient.locale)),
      body: (_e, recipient) => (isEs(recipient.locale) ? "Revisa tu renta de estación." : "Check your station rent."),
    },
    email: {
      templateId: event,
      subject: (_e, recipient) => title(isEs(recipient.locale)),
      render: ({ event: e, recipient, brand, unsubscribeUrl }) =>
        React.createElement(RentAutopayNotice, {
          kind,
          recipientName: recipient.displayName,
          workspaceName: str(e.payload.workspaceName),
          period: str(e.payload.period),
          rentUrl: str(e.payload.rentUrl) ?? pageUrl(brand, "/talent/rent-proposals"),
          brand,
          unsubscribeUrl,
          categoryLabel: "billing",
        }),
    },
  };
}

/** TUL-1611: the workspace OWNER is told (bell) when a member's automatic rent charge is disputed with the bank. */
const AUTOPAY_DISPUTED: CatalogEntry = {
  id: "rent.autopay_disputed.workspace",
  category: "billing",
  defaultChannels: ["in_app"],
  required: true,
  triggers: ["rent.autopay_disputed"],
  resolveAudience: workspaceOwner,
  in_app: {
    kind: "system",
    surface: "workspace",
    title: (e, recipient) => {
      const es = (recipient.locale ?? "").toLowerCase().startsWith("es");
      const period = str(e.payload.period) ?? "";
      return es ? `Disputa bancaria en la renta de ${period}` : `Bank dispute on the ${period} rent`;
    },
    body: (_e, recipient) =>
      (recipient.locale ?? "").toLowerCase().startsWith("es")
        ? "Un miembro disputó un cobro automático de renta. Si la disputa se pierde, o si hay un reembolso, tu estudio devuelve la parte de ese cobro que recibió. Tulala no absorbe esa pérdida."
        : "A member disputed an automatic rent charge. If the dispute is lost, or the charge is refunded, your studio returns the part of it that you received. Tulala does not absorb that loss.",
  },
};

export const RENT_CATALOG_ENTRIES: CatalogEntry[] = [rentEntry("declined"), rentEntry("ended"), autopayEntry("failed"), autopayEntry("canceled"), AUTOPAY_DISPUTED];
