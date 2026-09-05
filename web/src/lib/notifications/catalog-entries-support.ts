import "server-only";

import * as React from "react";
import TicketCreatedAlert from "../../../emails/support/TicketCreatedAlert";
import TicketReplyAlert from "../../../emails/support/TicketReplyAlert";
import TicketEscalatedAlert from "../../../emails/support/TicketEscalatedAlert";
import AgentReply from "../../../emails/support/AgentReply";
import MessageReceived from "../../../emails/support/MessageReceived";
import TicketResolved from "../../../emails/support/TicketResolved";
import AutoCloseWarning from "../../../emails/support/AutoCloseWarning";
import TicketFixed from "../../../emails/support/TicketFixed";
import FeatureRequestAlert from "../../../emails/support/FeatureRequestAlert";
import FeatureRequestUpdate from "../../../emails/support/FeatureRequestUpdate";
import WeeklyDigest from "../../../emails/support/WeeklyDigest";
import type { AudienceContext, AudienceMember, CatalogEntry, NotificationEvent } from "./types";
import { eventGuestContact, eventUser, platformAdmins, str } from "./catalog-audiences";
import { supportRequesterReplyPath } from "@/lib/support/support-reply-path";
import { appPageUrl, pageUrl } from "./catalog-render";

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
  let tenantName: string | null = null;
  const tenantId = str(event.payload.tenantId) ?? event.tenantId;
  if (tenantId) {
    const { data } = await ctx.admin
      .from("agencies")
      .select("slug, display_name")
      .eq("id", tenantId)
      .maybeSingle();
    tenantSlug = tenantSlug ?? data?.slug ?? null;
    tenantName = typeof data?.display_name === "string" ? data.display_name : null;
  }
  let replyPath = supportRequesterReplyPath(surface, ticketId);
  if (surface === "guest") {
    replyPath = supportRequesterReplyPath("guest", ticketId);
  } else if (surface === "client") {
    replyPath = tenantSlug ? `/${tenantSlug}/client?support=${ticketId}` : `/client?support=${ticketId}`;
  } else if (surface === "workspace") {
    replyPath = tenantSlug ? `/${tenantSlug}/admin?support=${ticketId}` : `/admin?support=${ticketId}`;
  }

  // "Maya at Impronta" beats "A user" in the owner's alert. Best-effort.
  let requesterLabel: string | null = null;
  const requesterUserId = str(event.payload.requesterUserId);
  if (requesterUserId) {
    const { data: profile } = await ctx.admin
      .from("profiles")
      .select("display_name")
      .eq("id", requesterUserId)
      .maybeSingle();
    const name = typeof profile?.display_name === "string" ? profile.display_name.trim() : "";
    const at = tenantName ?? tenantSlug;
    if (name) requesterLabel = at ? `${name} at ${at}` : name;
  }

  return {
    tenantSlug,
    replyPath,
    requesterLabel,
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
    // A chase is distinguishable from the first alert in the SUBJECT LINE, so
    // the inbox is triageable without opening anything. Four identical
    // "Urgent: ticket #24 needs you" rows read as a broken system; "Still
    // waiting: #24 (2 days)" reads as one case getting older.
    subject: (event) =>
      event.payload.isReAlert === true
        ? `Still waiting: ticket #${num(event, "ticketNumber")}${
            str(event.payload.waitedLabel) ? ` (${str(event.payload.waitedLabel)})` : ""
          }`
        : `Ticket #${num(event, "ticketNumber")} needs you`,
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(TicketEscalatedAlert, {
        ticketNumber: num(event, "ticketNumber"),
        subject: str(event.payload.subject) ?? "",
        requesterLabel: str(event.payload.requesterLabel) ?? "A user",
        phone: str(event.payload.contactPhone),
        workspace: str(event.payload.tenantName),
        excerpt: str(event.payload.excerpt),
        waited: str(event.payload.waitedLabel),
        isReAlert: event.payload.isReAlert === true,
        reAlertNumber: typeof event.payload.reAlertNumber === "number" ? event.payload.reAlertNumber : undefined,
        reAlertOf: typeof event.payload.reAlertOf === "number" ? event.payload.reAlertOf : undefined,
        adminUrl: pageUrl(brand, str(event.payload.adminPath) ?? "/platform/admin/support"),
        brand,
        unsubscribeUrl,
        categoryLabel: "platform alerts",
      }),
  },
  whatsapp: {
    // Absolute app-host URL — a relative path is not tappable in WhatsApp.
    render: (event) =>
      `Tulala #${num(event, "ticketNumber")} needs you: ${str(event.payload.subject) ?? "support ticket"}. ${str(event.payload.contactPhone) ? `Phone ${str(event.payload.contactPhone)}. ` : ""}Open ${appPageUrl(str(event.payload.adminPath) ?? `/platform/admin/support?ticket=${str(event.payload.ticketId) ?? ""}`)}`,
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

const AGENT_REPLY_GUEST: CatalogEntry = {
  id: "support.message.agent.guest",
  category: "messages",
  defaultChannels: ["email"],
  required: false,
  triggers: ["support.message.agent.guest"],
  hydrate: hydrateSupportLinks,
  resolveAudience: eventGuestContact("guest"),
  email: {
    templateId: "support.message.agent",
    subject: (event) =>
      `Oran replied - ${str(event.payload.subject) ?? "your ticket"} [Tulala #${num(event, "ticketNumber")}]`,
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(AgentReply, {
        ticketNumber: num(event, "ticketNumber"),
        subject: str(event.payload.subject) ?? "",
        replyUrl: pageUrl(brand, str(event.payload.replyPath) ?? "/contact"),
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

const TICKET_RESOLVED_GUEST: CatalogEntry = {
  id: "support.ticket.resolved.guest",
  category: "messages",
  defaultChannels: ["email"],
  required: false,
  triggers: ["support.ticket.resolved.guest"],
  hydrate: hydrateSupportLinks,
  resolveAudience: eventGuestContact("guest"),
  email: {
    templateId: "support.ticket.resolved",
    subject: (event) =>
      `Resolved: ${str(event.payload.subject) ?? "your ticket"} [Tulala #${num(event, "ticketNumber")}]`,
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(TicketResolved, {
        ticketNumber: num(event, "ticketNumber"),
        subject: str(event.payload.subject) ?? "",
        replyUrl: pageUrl(brand, str(event.payload.replyPath) ?? "/contact"),
        brand,
        unsubscribeUrl,
        categoryLabel: "messages",
      }),
  },
};

const GUEST_CONTACT_CONFIRM: CatalogEntry = {
  id: "support.guest.contact.confirm",
  category: "messages",
  defaultChannels: ["email"],
  required: false,
  triggers: ["support.guest.contact.confirm"],
  hydrate: hydrateSupportLinks,
  resolveAudience: eventGuestContact("guest"),
  email: {
    templateId: "support.message.received",
    // Was "We saved your email for ticket #N", rendered with AgentReply — so
    // the mail opened "<agent> replied" and "There is a new reply on your
    // ticket" when nobody had replied. A false receipt sends the reader
    // looking for an answer that does not exist.
    subject: (event) => `We have your message (#${num(event, "ticketNumber")})`,
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(MessageReceived, {
        ticketNumber: num(event, "ticketNumber"),
        subject: str(event.payload.subject) ?? "",
        replyUrl: pageUrl(brand, str(event.payload.replyPath) ?? "/contact"),
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
      React.createElement(TicketReplyAlert, {
        ticketNumber: num(event, "ticketNumber"),
        subject: str(event.payload.subject) ?? "",
        requesterLabel: str(event.payload.requesterLabel) ?? "The requester",
        preview: str(event.payload.preview) ?? "",
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

const AUTOCLOSE_GUEST: CatalogEntry = {
  id: "support.ticket.autoclose.guest",
  category: "messages",
  defaultChannels: ["email"],
  required: false,
  triggers: ["support.ticket.autoclose.guest"],
  hydrate: hydrateSupportLinks,
  resolveAudience: eventGuestContact("guest"),
  email: {
    templateId: "support.ticket.autoclose",
    subject: (event) => `Still need help on #${num(event, "ticketNumber")}?`,
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(AutoCloseWarning, {
        ticketNumber: num(event, "ticketNumber"),
        subject: str(event.payload.subject) ?? "",
        replyUrl: pageUrl(brand, str(event.payload.replyPath) ?? "/contact"),
        brand,
        unsubscribeUrl,
        categoryLabel: "messages",
      }),
  },
};

const TICKET_FIXED_GUEST: CatalogEntry = {
  id: "support.ticket.fixed.guest",
  category: "messages",
  defaultChannels: ["email"],
  required: false,
  triggers: ["support.ticket.fixed.guest"],
  hydrate: hydrateSupportLinks,
  resolveAudience: eventGuestContact("guest"),
  email: {
    templateId: "support.ticket.fixed",
    subject: (event) =>
      `The issue you reported is fixed [Tulala #${num(event, "ticketNumber")}]`,
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(TicketFixed, {
        ticketNumber: num(event, "ticketNumber"),
        subject: str(event.payload.subject) ?? "",
        note: str(event.payload.note) ?? undefined,
        replyUrl: pageUrl(brand, str(event.payload.replyPath) ?? "/contact"),
        brand,
        unsubscribeUrl,
        categoryLabel: "messages",
      }),
  },
};

const FEATURE_REQUEST_CREATED: CatalogEntry = {
  id: "support.feature_request.created.platform",
  category: "platform_alerts",
  defaultChannels: ["email", "in_app", "push"],
  required: false,
  triggers: ["support.feature_request.created"],
  hydrate: hydrateSupportLinks,
  resolveAudience: platformAdmins,
  in_app: {
    kind: "ticket",
    surface: "workspace",
    title: (event) => `New idea #${num(event, "requestNumber")}`,
    body: (event) => str(event.payload.title) ?? "A customer asked for something.",
    targetPayload: (event) => ({ requestId: str(event.payload.requestId) }),
  },
  email: {
    templateId: "support.feature_request.created",
    subject: (event) =>
      `New idea #${num(event, "requestNumber")} - ${str(event.payload.title) ?? "feature request"}`,
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(FeatureRequestAlert, {
        requestNumber: num(event, "requestNumber"),
        title: str(event.payload.title) ?? "",
        body: str(event.payload.body) ?? "",
        requesterLabel: str(event.payload.requesterLabel) ?? "A customer",
        phone: str(event.payload.contactPhone),
        adminUrl: pageUrl(
          brand,
          str(event.payload.adminPath) ?? "/platform/admin/support?view=ideas",
        ),
        brand,
        unsubscribeUrl,
        categoryLabel: "platform alerts",
      }),
  },
};

const FEATURE_REQUEST_UPDATED: CatalogEntry = {
  id: "support.feature_request.updated.requester",
  category: "messages",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["support.feature_request.updated"],
  hydrate: hydrateSupportLinks,
  resolveAudience: eventUser("workspace_member"),
  in_app: {
    kind: "ticket",
    surface: "workspace",
    title: (event) => `Your idea is ${str(event.payload.status) ?? "updated"}`,
    body: (event) => str(event.payload.title),
    targetPayload: (event) => ({ requestId: str(event.payload.requestId) }),
  },
  email: {
    templateId: "support.feature_request.updated",
    subject: (event) =>
      `Your idea #${num(event, "requestNumber")} is ${str(event.payload.status) ?? "updated"}`,
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(FeatureRequestUpdate, {
        requestNumber: num(event, "requestNumber"),
        title: str(event.payload.title) ?? "",
        statusLabel: (str(event.payload.status) ?? "updated").replace(/_/g, " "),
        ownerNote: str(event.payload.ownerNote),
        replyUrl: pageUrl(brand, str(event.payload.replyPath) ?? "/"),
        brand,
        unsubscribeUrl,
        categoryLabel: "messages",
      }),
  },
};

export const SUPPORT_CATALOG_ENTRIES: CatalogEntry[] = [
  FEATURE_REQUEST_CREATED,
  FEATURE_REQUEST_UPDATED,
  TICKET_CREATED,
  TICKET_ESCALATED,
  AGENT_REPLY,
  AGENT_REPLY_GUEST,
  TICKET_RESOLVED,
  TICKET_RESOLVED_GUEST,
  GUEST_CONTACT_CONFIRM,
  REQUESTER_REPLY_WATCH,
  AUTOCLOSE,
  AUTOCLOSE_GUEST,
  PROPOSED_EXPIRED,
  TICKET_FIXED,
  TICKET_FIXED_GUEST,
  WEEKLY_DIGEST,
];
