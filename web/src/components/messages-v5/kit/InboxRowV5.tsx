/**
 * InboxRowV5: one row, two seconds (board D01 `inboxRow`, M01 `mxRow`).
 * Name and time, subject, preview, then one line: conversation state,
 * opportunity, and the one record that matters. Owner and channel are small
 * metadata on the right (desktop) or folded into the state line (mobile).
 */

import { localiseEngineLine } from "@/lib/messages-v5/engine-lines";
import type { InboxRow } from "@/lib/messaging/types";

import type { KitCopy } from "./copy";
import { Avatar, CHANNEL_ICON, Icon, Pill, formatWaiting, formatWhen } from "./primitives";
import { StateTags } from "./StateTags";

export type InboxRowV5Props = {
  readonly row: InboxRow;
  readonly copy: KitCopy;
  readonly selected?: boolean;
  readonly variant?: "desktop" | "mobile";
  readonly currentUserId?: string | null;
  readonly now?: Date;
  readonly locale?: string;
  readonly onOpen?: (id: string) => void;
  /** Talent seller mode: hide owner avatar / Unassigned (a solo talent has no team). */
  readonly seller?: boolean;
};

export function InboxRowV5({ row, copy, selected, variant = "desktop", currentUserId, now = new Date(), locale, onOpen, seller }: InboxRowV5Props) {
  const name = row.contactName.trim() || copy.inbox.visitor;
  const isVisitor = !row.contactName.trim();
  const state = { conversation: row.conversationState, opportunity: row.opportunityState, records: [] };
  const stamp = row.lastCustomerMessageAt ?? row.updatedAt;
  const needsReply = row.conversationState === "needs_reply";
  const when = needsReply && seller ? formatWaiting(stamp, now, locale) : formatWhen(stamp, now, locale);
  const unread = row.unread && row.unreadCount > 0;

  if (variant === "mobile") {
    return (
      <button
        type="button"
        className={`mx-row${unread ? " unread" : ""}${selected ? " on" : ""}${needsReply ? " needs" : ""}`}
        data-inbox-row={row.id}
        aria-current={selected ? "true" : undefined}
        onClick={onOpen ? () => onOpen(row.id) : undefined}
      >
        <Avatar name={isVisitor ? null : row.contactName} size="lg" />
        <span className="tx">
          <span className="l1">
            <b>{name}</b>
            <span className={needsReply && seller ? "wait-age" : undefined}>{when}</span>
          </span>
          <span className="l2">{row.subject}</span>
          <span className="l3">{localiseEngineLine(row.lastMessagePreview, copy)}</span>
          <span className="l4">
            <StateTags state={state} chips={row.recordChips} copy={copy} maxRecords={1} identityLevel={isVisitor ? "none" : undefined} />
            {unread ? <i className="cnt">{row.unreadCount}</i> : null}
          </span>
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`row-c${selected ? " on" : ""}${unread ? " unread" : ""}${needsReply ? " needs" : ""}`}
      data-inbox-row={row.id}
      aria-current={selected ? "true" : undefined}
      onClick={onOpen ? () => onOpen(row.id) : undefined}
    >
      <Avatar name={isVisitor ? null : row.contactName} />
      <span className="tx">
        <span className="nm">
          <span>{name}</span>
        </span>
        <span className="sub">{row.subject}</span>
        <span className="pv">{localiseEngineLine(row.lastMessagePreview, copy)}</span>
        <span className="tags">
          <StateTags state={state} chips={row.recordChips} copy={copy} maxRecords={1} identityLevel={isVisitor ? "none" : undefined} />
        </span>
      </span>
      <span className="meta">
        <span className={`when${needsReply && seller ? " wait-age" : ""}`} title={needsReply && seller ? when : undefined}>
          <Icon name={needsReply && seller ? "clock" : CHANNEL_ICON[row.channel]} size={12} />
          <span className="sr">{needsReply && seller ? when : copy.channel[row.channel]}</span>
          {when}
        </span>
        {unread ? <span className="cnt">{row.unreadCount}</span> : null}
        {seller ? null : row.ownerLabel ? (
          <Avatar name={row.ownerLabel} size="sm" me={!!currentUserId && row.ownerUserId === currentUserId} />
        ) : (
          <Pill tone="off">{copy.inbox.unassigned}</Pill>
        )}
      </span>
    </button>
  );
}
