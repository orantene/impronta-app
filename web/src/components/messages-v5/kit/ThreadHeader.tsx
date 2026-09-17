/**
 * ThreadHeader answers who, what, owner, state (board D01 `thHead`, M02 `mxThread`).
 * Desktop: back, avatar, name, identity pill, subject, channel, owner chip,
 * conversation state, Resolve / Reopen, more. Second row: opportunity + records.
 * Mobile: back, name, subject, "channel · owner", more; state row underneath.
 */

import type { Essentials, InquiryMessagingState, MessagingChannel, RecordChip } from "@/lib/messaging/types";

import type { KitCopy } from "./copy";
import { Avatar, Btn, ChannelTag, Icon } from "./primitives";
import { IdentityPill, StateTags } from "./StateTags";

export type ThreadHeaderProps = {
  readonly essentials: Pick<Essentials, "name" | "customer">;
  readonly state: InquiryMessagingState;
  readonly chips: readonly RecordChip[];
  readonly channel: MessagingChannel;
  readonly subject: string;
  readonly when?: string | null;
  readonly owner: { readonly label: string; readonly isMe: boolean } | null;
  readonly copy: KitCopy;
  readonly variant?: "desktop" | "mobile";
  /** Resolve / Reopen in flight. */
  readonly busy?: boolean;
  readonly onBack?: () => void;
  readonly onAssign?: () => void;
  readonly onResolve?: () => void;
  readonly onReopen?: () => void;
  readonly onMore?: () => void;
};

export function ThreadHeader({ essentials, state, chips, channel, subject, when, owner, copy, variant = "desktop", busy, onBack, onAssign, onResolve, onReopen, onMore }: ThreadHeaderProps) {
  const isVisitor = essentials.customer.identityLevel === "none" && !essentials.customer.name.trim();
  const name = essentials.name.trim() || (isVisitor ? copy.inbox.visitor : essentials.customer.name);
  const resolved = state.conversation === "resolved";

  if (variant === "mobile") {
    const meta = [copy.channel[channel], owner ? owner.label : copy.inbox.unassigned, essentials.customer.identityLevel === "none" ? copy.state.noIdentity : null]
      .filter(Boolean)
      .join(" · ");
    return (
      <header className="mx-th" data-thread-header="mobile">
        <div className="r">
          <button type="button" className="back" onClick={onBack} aria-label={copy.thread.back}>
            <Icon name="back" size={20} />
          </button>
          <div className="who">
            <b>{name}</b>
            <span className="subj">{subject}</span>
            <span className="meta">{meta}</span>
          </div>
          <button type="button" className="more" onClick={onMore} aria-label={copy.thread.more}>
            <Icon name="more" size={20} />
          </button>
        </div>
        <div className="st">
          <StateTags state={state} chips={chips} copy={copy} maxRecords={1} />
        </div>
      </header>
    );
  }

  return (
    <header className="th-head" data-thread-header="desktop">
      <div className="r1">
        <Btn size="round" variant="ghost" onClick={onBack} aria-label={copy.thread.back}>
          <Icon name="back" size={16} />
        </Btn>
        <Avatar name={isVisitor ? null : name} size="lg" />
        <div className="who">
          <b>{name}</b>
          <span>
            <IdentityPill level={essentials.customer.identityLevel} copy={copy} />
            <span className="subj">
              {subject}
              {when ? ` · ${when}` : ""}
            </span>
          </span>
        </div>
        <div className="acts">
          <ChannelTag channel={channel} copy={copy} />
          <button type="button" className="owner" onClick={onAssign} data-thread-owner>
            {owner ? (
              <>
                <Avatar name={owner.label} size="sm" me={owner.isMe} />
                {owner.label}
              </>
            ) : (
              <>
                <Avatar name={null} size="sm" />
                {copy.thread.assign}
              </>
            )}
            <Icon name="chev" size={13} />
          </button>
          <StateTags state={{ ...state, opportunity: null }} chips={[]} copy={copy} />
          {resolved ? (
            <Btn size="sm" busy={busy} onClick={onReopen} data-thread-reopen>
              {copy.thread.reopen}
            </Btn>
          ) : (
            <Btn size="sm" variant="secondary" busy={busy} onClick={onResolve} data-thread-resolve>
              {busy ? copy.thread.resolving : copy.thread.resolve}
            </Btn>
          )}
          <Btn size="round" variant="ghost" onClick={onMore} aria-label={copy.thread.more}>
            <Icon name="more" size={16} />
          </Btn>
        </div>
      </div>
      <div className="r2">
        <StateTags state={state} chips={chips} copy={copy} hideConversation />
      </div>
    </header>
  );
}
