import "server-only";

/**
 * messages-view.tsx — the server half of every mode's Messages view
 * (`docs/plans/program/engine/messaging.md`, seams 2 and 10).
 *
 * `page.tsx` decides the mode and hands over here for `?view=messages`; this
 * module reads what the view needs that the mode's own client would have
 * read (the counter's open sale for "Back to sale #N · $X · N lines", the
 * mode's rail labels) and renders `MessagesModeClient` inside the same
 * chrome. The rows themselves are the surface's own reads through
 * `messagingLoadInbox`, scoped to the workspace by the server action.
 */

import { chromeCopy, posModeLabel, railNavLabel } from "@/components/admin/pos/pos-copy";
import { classesRailCopy, classesRailNavLabel } from "@/components/admin/pos/classes-copy";
import { floorBoardCopy } from "@/components/admin/floor/floor-copy";
import { interpolate, withPluralization } from "@/i18n/interpolate";
import type { Translator } from "@/components/admin/pos/translator";
import { countMessagingUnread } from "@/lib/messaging/inbox";
import { findConversationForOrder } from "@/lib/messages-v5/pos-continuity";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { loadPosSale } from "@/lib/pos/draft";
import type { PosMode } from "@/lib/pos/modes";
import { messagingLoadInbox } from "@/lib/server-actions/messaging-engine";
import { getCachedActorSession } from "@/lib/server/request-cache";

import { PageRouteSyncer } from "../_page-route-syncer";

import { projectsModeCopy } from "./_projects/projects-copy";
import { saleReference } from "./counter-model";
import { doorCopy } from "./door-copy";
import { MessagesModeClient } from "./mode-clients";

type Admin = Parameters<typeof loadPosSale>[0];

/**
 * Seam 10: the rail's `messages` badge, read once per POS load for the
 * signed-in person. Nobody signed in (the route already refused) reads zero.
 */
export async function readMessagesUnread(admin: Admin, tenantId: string): Promise<number> {
  const actor = await getCachedActorSession();
  if (!actor.user) return 0;
  return countMessagingUnread(admin, { tenantId, locationSlug: "default", actorUserId: actor.user.id });
}

export async function messagesModeView(input: {
  admin: Admin;
  tr: Translator;
  locale: string;
  mode: PosMode;
  tenantId: string;
  /** L10: the shell needs both id and slug (`MessagesV5ShellProps`). */
  tenantSlug: string;
  /** This request's own `/…/admin/pos` path, so the return link keeps the host shape. */
  posPath: string;
  /** The counter's open sale from `?order=`, when there is one. */
  orderId: string | null;
  messagesUnread: number;
  /** The counter's rail labels (`railCopy`), already built by the route. */
  railLabels: Readonly<Record<string, string>>;
}) {
  const { admin, tr, mode, posPath } = input;
  const chrome = chromeCopy(tr);
  const openOrderId = input.orderId && /^[0-9a-f-]{36}$/i.test(input.orderId) ? input.orderId : null;
  const openSale = mode === "counter" && openOrderId ? await loadPosSale(admin, { tenantId: input.tenantId, orderId: openOrderId }) : null;
  const sale = openSale && openSale.ok ? openSale.sale : null;
  const actor = await getCachedActorSession();
  // L10 (D-MSG-172): the counter dock's "This client" view starts on the
  // conversation already linked to the open sale's order, when there is one.
  // `messagingLoadInbox` is the SAME reader the shell itself calls (no new
  // query); a sale with no thread yet, or the flag off, resolves to null and
  // the dock falls back to Inbox — never a new writer, never a blank refusal.
  const messagesV5 = process.env.NEXT_PUBLIC_MESSAGES_V5 === "1";
  let initialCustomerInquiryId: string | null = null;
  if (messagesV5 && mode === "counter" && sale) {
    const inboxRes = await messagingLoadInbox({ locationSlug: "default", filter: "all" });
    if (inboxRes.ok) initialCustomerInquiryId = findConversationForOrder(inboxRes.rows, sale.orderId);
  }
  const destinationLabels: Readonly<Record<string, string>> =
    mode === "counter"
      ? input.railLabels
      : mode === "door"
        ? doorCopy(tr).rail
        : mode === "floor"
          ? floorBoardCopy(tr).rail
          : mode === "classes"
            ? classesRailCopy(tr)
            : projectsModeCopy(tr).rail.destinations;
  const navLabel =
    mode === "counter"
      ? railNavLabel(tr)
      : mode === "door"
        ? tr("dashboard.pos.door.rail.label")
        : mode === "floor"
          ? floorBoardCopy(tr).railLabel
          : mode === "classes"
            ? classesRailNavLabel(tr)
            : projectsModeCopy(tr).rail.label;
  // "Back to sale #N · $X · N lines" on the counter with a sale open;
  // otherwise the mode's landing screen by name ("Back to Today").
  const returnLabel = sale
    ? withPluralization(tr, input.locale)("dashboard.pos.messages.backToSaleDetail", sale.lines.length, {
        ref: saleReference(sale.orderId),
        total: formatOrderMoney(sale.totalCents, sale.currency),
      })
    : interpolate(tr("dashboard.pos.messages.backTo"), {
        screen: mode === "classes" ? destinationLabels.today : posModeLabel(tr, mode),
      });
  const returnHref = `${posPath}?mode=${mode}${sale ? `&order=${encodeURIComponent(sale.orderId)}` : ""}`;
  const workspacePath = posPath.replace(/\/pos$/, "");
  return (
    <>
      <PageRouteSyncer page="pos" />
      <MessagesModeClient
        mode={mode}
        tenantId={input.tenantId}
        tenantSlug={input.tenantSlug}
        locationSlug="default"
        adminBasePath={workspacePath}
        returnHref={returnHref}
        returnLabel={returnLabel}
        messagesUnread={input.messagesUnread}
        workspacePath={workspacePath}
        currentUserId={actor.user?.id ?? null}
        openOrderId={sale ? sale.orderId : null}
        initialCustomerInquiryId={initialCustomerInquiryId}
        frame={{
          navLabel,
          destinationLabels,
          modeLabel: posModeLabel(tr, mode),
          modeEyebrow: chrome.modeEyebrow,
          lock: chrome.lock,
          lockUnavailable: chrome.lockUnavailable,
          workspace: chrome.workspace,
        }}
      />
    </>
  );
}
