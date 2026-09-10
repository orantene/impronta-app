/**
 * Message keys for the Projects surface, one literal per member.
 *
 * WHY LITERALS AND NOT A TEMPLATE. `t(`dashboard.projects.action.${id}`)` is
 * invisible to `message-key-usage.static.test`, which is exactly how a raw
 * dotted key reaches a screen: `createTranslator` returns the key itself when a
 * path misses, so the miss renders as text and every gate stays green. Written
 * out, each key is a string the guard can see in `src/`.
 *
 * These live here rather than in `page.tsx` because a Next.js page module is
 * only supposed to export its default and the framework's own config fields.
 */

import type { ProjectActionId, ProjectStatus } from "@/lib/projects/project-record";
import type { OrderStatus } from "@/lib/orders/order-status";

export const ACTION_KEY: Record<ProjectActionId, string> = {
  draft_agreement: "dashboard.projects.action.draft_agreement",
  send_agreement: "dashboard.projects.action.send_agreement",
  await_client: "dashboard.projects.action.await_client",
  assign_team: "dashboard.projects.action.assign_team",
  review_milestone: "dashboard.projects.action.review_milestone",
  chase_milestone: "dashboard.projects.action.chase_milestone",
  collect_balance: "dashboard.projects.action.collect_balance",
  close_project: "dashboard.projects.action.close_project",
  nothing: "dashboard.projects.action.nothing",
};

export const STATUS_KEY: Record<ProjectStatus, string> = {
  draft: "dashboard.projects.status.draft",
  tentative: "dashboard.projects.status.tentative",
  confirmed: "dashboard.projects.status.confirmed",
  in_progress: "dashboard.projects.status.in_progress",
  completed: "dashboard.projects.status.completed",
  cancelled: "dashboard.projects.status.cancelled",
  archived: "dashboard.projects.status.archived",
};

/**
 * An attached order's own status, in the Orders desk's words.
 *
 * BORROWED, NOT RESTATED. These are `dashboard.orders.status*`, the copy the
 * Orders desk already renders, so a project and the desk never call the same
 * state two different things. It matters more since Projects started deciding
 * what is owed on the status: an order contributing nothing to the due figure
 * must say why in the reader's own language, not print a raw enum label.
 */
export const ORDER_STATUS_KEY: Record<OrderStatus, string> = {
  draft: "dashboard.orders.statusDraft",
  quoted: "dashboard.orders.statusQuoted",
  pending_payment: "dashboard.orders.statusPendingPayment",
  paid: "dashboard.orders.statusPaid",
  fulfilled: "dashboard.orders.statusFulfilled",
  cancelled: "dashboard.orders.statusCancelled",
  refunded: "dashboard.orders.statusRefunded",
  partially_refunded: "dashboard.orders.statusPartiallyRefunded",
};
