import "server-only";

import * as React from "react";
import TicketCreatedAlert from "../../../emails/support/TicketCreatedAlert";
import TicketEscalatedAlert from "../../../emails/support/TicketEscalatedAlert";
import AgentReply from "../../../emails/support/AgentReply";
import TicketResolved from "../../../emails/support/TicketResolved";
import AutoCloseWarning from "../../../emails/support/AutoCloseWarning";
import TicketFixed from "../../../emails/support/TicketFixed";
import WeeklyDigest from "../../../emails/support/WeeklyDigest";
import type { AudienceContext, AudienceMember, CatalogEntry, NotificationEvent } from "./types";
import { eventUser, platformAdmins, str } from "./catalog-audiences";
import { pageUrl } from "./catalog-render";

const SUPPORT_TICKET_DRAWER = "support-ticket";

function num(event: NotificationEvent, key: string): number {
  const v = event.payload[key];
  if (typeof v === "number") return v;
  if (typeof v === "string" && v !== "") return Number(v);
  return 0;
}

async function hydrateSupportLinks(
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<Record<string, unknown>> {
  const ticketId = str(event.payload.ticketId) ?? "";
  const surface = str(event.payload.surface);
  let tenantSlug = str(event.payload.tenantSlug);
  const tenantId = str(event.payload.tenantId) ?? event.tenantId;
  if (!tenantSlug && tenantId) {
    const { data } = await ctx.admin
      .from("agencies")
      .select("slug")
      .eq("id", tenantId)
      .maybeSingle();
    tenantSlug = data?.slug ?? null;
  }
  let replyPath = `/talent?support=${ticketId}`;
  if (surface === "client") {
    replyPath = tenantSlug ? `/${tenantSlug}/client?support=${ticketId}` : `/client?support=${ticketId}`;
  } else if (surface === "workspace") {
    replyPath = tenantSlug ? `/${tenantSlug}/admin?support=${ticketId}` : `/admin?support=${ticketId}`;
  }
  return {
    tenantSlug,
    replyPath,
    adminPath: `/platform/admin/support?ticket=${ticketId}`,
  };
}

const assigneeOrPlatformAdmins = async (
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  const assignee = str(event.payload.assigneeUserId) ?? str(event.userId);
  if (assignee) return [{ kind: "user", userId: assignee, role: "platform_admin" }];
  return platformAdmins(event, ctx);
};

const TICKET_CREATED: CatalogEntry = {
  id: "support.ticket.created.platform",
  category: "platform_alerts",
  defaultChannels: ["email", "in_app", "push"],
  required: false,
  triggers: ["support.ticket.created"],
  hydrate: hydrateSupportLinks,
  resolveAudience: platformAdmins,
  in_app: {
    kind: "ticket",
    surface: "workspace",
    title: (event) => `New support ticket #${num(event, "ticketNumber")}`,
    body: (event) => str(event.payload.subject) ?? "A workspace asked for help.",
    targetDrawer: SUPPORT_TICKET_DRAWER,
    targetPayload: (event) => ({ ticketId: str(event.payload.ticketId) }),
  },
  email: {
    templateId: "support.ticket.created",
    subject: (event) => `New support ticket #${num(event, "ticketNumber")}`,
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(TicketCreatedAlert, {
        ticketNumber: num(event, "ticketNumber"),
        subject: str(event.payload.subject) ?? "",
        requesterLabel: str(event.payload.requesterLabel) ?? "A user",
        adminUrl: pageUrl(brand, str(event.payload.adminPath) ?? "/platform/admin/support"),
        brand,
        unsubscribeUrl,
        categoryLabel: "platform alerts",
      }),
  },
};

const TICKET_ESCALATED: CatalogEntry = {
  id: "support.ticket.escalated.platform",
  category: "platform_alerts",
  defaultChannels: ["email", "in_app", "push", "whatsapp"],
  required: false,
  triggers: ["support.ticket.escalated"],
  hydrate: hydrateSupportLinks,
  resolveAudience: platformAdmins,
  in_app: {
    kind: "ticket",
    surface: "workspace",
    title: (event) => `Ticket #${num(event, "ticketNumber")} needs you`,
    body: (event) => str(event.payload.subject) ?? "Someone asked to talk to a human.",
    targetDrawer: SUPPORT_TICKET_DRAWER,
    targetPayload: (event) => ({ ticketId: str(event.payload.ticketId) }),
  },
  email: {
    templateId: "support.ticket.escalated",
    subject: (event) => `Urgent: ticket #${num(event, "ticketNumber")} needs you`,
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(TicketEscalatedAlert, {
        ticketNumber: num(event, "ticketNumber"),
        subject: str(event.payload.subject) ?? "",
        requesterLabel: str(event.payload.requesterLabel) ?? "A user",
        phone: str(event.payload.contactPhone),
        adminUrl: pageUrl(brand, str(event.payload.adminPath) ?? "/platform/admin/support"),
        brand,
        unsubscribeUrl,
        categoryLabel: "platform alerts",
      }),
  },
  whatsapp: {
    render: (event) =>
      `Tulala #${num(event, "ticketNumber")} needs you: ${str(event.payload.subject) ?? "support ticket"}. ${str(event.payload.contactPhone) ? `Phone ${str(event.payload.contactPhone)}. ` : ""}Open /platform/admin/support?ticket=${str(event.payload.ticketId) ?? ""}`,
  },
};

const AGENT_REPLY: CatalogEntry = {
  id: "support.message.agent.requester",
  category: "messages",
  defaultChannels: ["email", "in_app", "push"],
  required: false,
  triggers: ["support.message.agent"],
  hydrate: hydrateSupportLinks,
  resolveAudience: eventUser("workspace_member"),
  in_app: {
    kind: "ticket",
    surface: "workspace",
    title: (event) => `Oran replied - ${str(event.payload.subject) ?? "your ticket"}`,
    body: (event) => str(event.payload.preview),
    targetDrawer: SUPPORT_TICKET_DRAWER,
    targetPayload: (event) => ({ ticketId: str(event.payload.ticketId) }),
  },
  email: {
    templateId: "support.message.agent",
    subject: (event) =>
      `Oran replied - ${str(event.payload.subject) ?? "your ticket"} [Tulala #${num(event, "ticketNumber")}]`,
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(AgentReply, {
        ticketNumber: num(event, "ticketNumber"),
        subject: str(event.payload.subject) ?? "",
        replyUrl: pageUrl(brand, str(event.payload.replyPath) ?? "/admin"),
        brand,
        unsubscribeUrl,
        categoryLabel: "messages",
      }),
  },
};

const TICKET_RESOLVED: CatalogEntry = {
  id: "support.ticket.resolved.requester",
  category: "messages",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["support.ticket.resolved"],
  hydrate: hydrateSupportLinks,
  resolveAudience: eventUser("workspace_member"),
  in_app: {
    kind: "ticket",
    surface: "workspace",
    title: (event) => `Resolved: ${str(event.payload.subject) ?? "your ticket"}`,
    body: () => "Rate how it went if you have a moment.",
    targetDrawer: SUPPORT_TICKET_DRAWER,
    targetPayload: (event) => ({ ticketId: str(event.payload.ticketId) }),
  },
  email: {
    templateId: "support.ticket.resolved",
    subject: (event) =>
      `Resolved: ${str(event.payload.subject) ?? "your ticket"} [Tulala #${num(event, "ticketNumber")}]`,
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(TicketResolved, {
        ticketNumber: num(event, "ticketNumber"),
        subject: str(event.payload.subject) ?? "",
        replyUrl: pageUrl(brand, str(event.payload.replyPath) ?? "/admin"),
        brand,
        unsubscribeUrl,
        categoryLabel: "messages",
      }),
  },
};

const REQUESTER_REPLY_WATCH: CatalogEntry = {
  id: "support.ticket.reply.agentwatch",
  category: "platform_alerts",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["support.ticket.reply"],
  hydrate: hydrateSupportLinks,
  resolveAudience: assigneeOrPlatformAdmins,
  in_app: {
    kind: "ticket",
    surface: "workspace",
    title: (event) => `Reply on #${num(event, "ticketNumber")}`,
    body: (event) => str(event.payload.preview),
    targetDrawer: SUPPORT_TICKET_DRAWER,
    targetPayload: (event) => ({ ticketId: str(event.payload.ticketId) }),
  },
  email: {
    templateId: "support.ticket.reply",
    subject: (event) =>
      `New reply on #${num(event, "ticketNumber")} - ${str(event.payload.subject) ?? "ticket"}`,
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(TicketCreatedAlert, {
        ticketNumber: num(event, "ticketNumber"),
        subject: str(event.payload.subject) ?? "",
        requesterLabel: "The requester",
        adminUrl: pageUrl(brand, str(event.payload.adminPath) ?? "/platform/admin/support"),
        brand,
        unsubscribeUrl,
        categoryLabel: "platform alerts",
      }),
  },
};

const AUTOCLOSE: CatalogEntry = {
  id: "support.ticket.autoclose.requester",
  category: "messages",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["support.ticket.autoclose"],
  hydrate: hydrateSupportLinks,
  resolveAudience: eventUser("workspace_member"),
  in_app: {
    kind: "ticket",
    surface: "workspace",
    title: (event) => `Still need help on #${num(event, "ticketNumber")}?`,
    body: () => "Reply in the next two days or this ticket will close on its own.",
    targetDrawer: SUPPORT_TICKET_DRAWER,
    targetPayload: (event) => ({ ticketId: str(event.payload.ticketId) }),
  },
  email: {
    templateId: "support.ticket.autoclose",
    subject: (event) =>
      `Still need help on #${num(event, "ticketNumber")}?`,
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(AutoCloseWarning, {
        ticketNumber: num(event, "ticketNumber"),
        subject: str(event.payload.subject) ?? "",
        replyUrl: pageUrl(brand, str(event.payload.replyPath) ?? "/admin"),
        brand,
        unsubscribeUrl,
        categoryLabel: "messages",
      }),
  },
};

const PROPOSED_EXPIRED: CatalogEntry = {
  id: "support.proposed_action.expired.requester",
  category: "messages",
  defaultChannels: ["in_app"],
  required: false,
  triggers: ["support.proposed_action.expired"],
  hydrate: hydrateSupportLinks,
  resolveAudience: eventUser("workspace_member"),
  in_app: {
    kind: "ticket",
    surface: "workspace",
    title: (event) => `A proposed fix on #${num(event, "ticketNumber")} expired`,
    body: () => "The change was not approved in time and was cancelled.",
    targetDrawer: SUPPORT_TICKET_DRAWER,
    targetPayload: (event) => ({ ticketId: str(event.payload.ticketId) }),
  },
};

const TICKET_FIXED: CatalogEntry = {
  id: "support.ticket.fixed.requester",
  category: "messages",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["support.ticket.fixed"],
  hydrate: hydrateSupportLinks,
  resolveAudience: eventUser("workspace_member"),
  in_app: {
    kind: "ticket",
    surface: "workspace",
    title: () => "The issue you reported is fixed",
    body: (event) => str(event.payload.note) ?? str(event.payload.subject) ?? "A fix shipped for your ticket.",
    targetDrawer: SUPPORT_TICKET_DRAWER,
    targetPayload: (event) => ({ ticketId: str(event.payload.ticketId) }),
  },
  email: {
    templateId: "support.ticket.fixed",
    subject: (event) =>
      `The issue you reported is fixed [Tulala #${num(event, "ticketNumber")}]`,
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(TicketFixed, {
        ticketNumber: num(event, "ticketNumber"),
        subject: str(event.payload.subject) ?? "",
        note: str(event.payload.note) ?? undefined,
        replyUrl: pageUrl(brand, str(event.payload.replyPath) ?? "/admin"),
        brand,
        unsubscribeUrl,
        categoryLabel: "messages",
      }),
  },
};

const WEEKLY_DIGEST: CatalogEntry = {
  id: "support.weekly_digest.platform",
  category: "platform_alerts",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["support.weekly_digest"],
  resolveAudience: platformAdmins,
  in_app: {
    kind: "ticket",
    surface: "workspace",
    title: () => "Weekly support digest",
    body: (event) => str(event.payload.summary) ?? "This week's support summary is ready.",
  },
  email: {
    templateId: "support.weekly_digest",
    subject: () => "Weekly support digest",
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(WeeklyDigest, {
        summary: str(event.payload.summary) ?? "This week's support summary is ready.",
        adminUrl: pageUrl(brand, str(event.payload.adminPath) ?? "/platform/admin/support?view=insights"),
        brand,
        unsubscribeUrl,
        categoryLabel: "platform alerts",
      }),
  },
};

export const SUPPORT_CATALOG_ENTRIES: CatalogEntry[] = [
  TICKET_CREATED,
  TICKET_ESCALATED,
  AGENT_REPLY,
  TICKET_RESOLVED,
  REQUESTER_REPLY_WATCH,
  AUTOCLOSE,
  PROPOSED_EXPIRED,
  TICKET_FIXED,
  WEEKLY_DIGEST,
];
