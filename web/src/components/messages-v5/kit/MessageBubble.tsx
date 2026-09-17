/**
 * MessageBubble (grouping first / middle / last, delivery state, quote,
 * internal-note tint, voice), SystemLine, DaySeparator, UnreadDivider.
 * Boards D01 `msg`/`note`/`sys`, M02 `mxb`.
 */

import type { ThreadMessage } from "@/lib/messaging/types";

import type { KitCopy } from "./copy";
import { Btn, Icon, type IconName } from "./primitives";

export type DeliveryState = "queued" | "sending" | "sent" | "delivered" | "read" | "failed";
export type BubblePosition = "single" | "first" | "middle" | "last";

export type MessageBubbleProps = {
  readonly message: Pick<ThreadMessage, "id" | "body" | "internal" | "kind" | "deletedAt" | "editedAt">;
  readonly mine: boolean;
  readonly copy: KitCopy;
  /** "Valentina · 10:41 AM · web chat" or "You · 4:20 PM". Built by the screen; the bubble does not format dates. */
  readonly meta?: string | null;
  readonly position?: BubblePosition;
  readonly delivery?: DeliveryState | null;
  readonly quote?: { readonly author: string; readonly text: string } | null;
  readonly voice?: { readonly durationLabel: string; readonly transcript?: string | null } | null;
  readonly variant?: "desktop" | "mobile";
  readonly onRetry?: () => void;
};

export function MessageBubble({ message, mine, copy, meta, position = "single", delivery, quote, voice, variant = "desktop", onRetry }: MessageBubbleProps) {
  const note = message.internal || message.kind === "internal_note";
  const grouped = position === "middle" || position === "last";
  const cls = [variant === "mobile" ? "mx-msg" : "msg", mine || note ? "me" : "", note ? "note" : "", position, grouped ? "grouped" : ""].filter(Boolean).join(" ");
  const deleted = !!message.deletedAt;
  const metaParts: string[] = [];
  if (note) metaParts.push(copy.stream.internalNote);
  if (meta) metaParts.push(meta);
  if (delivery) metaParts.push(copy.stream.delivery[delivery]);
  if (message.editedAt && !deleted) metaParts.push(copy.stream.edited);
  const showMeta = position === "single" || position === "last" || delivery === "failed";

  return (
    <div className={cls} data-message={message.id} data-position={position} data-delivery={delivery ?? undefined}>
      <div className="b">
        {quote ? (
          <div className="q">
            {copy.stream.replyingTo} {quote.author}: {quote.text}
          </div>
        ) : null}
        {note ? <Icon name="lock" size={12} /> : null}
        {deleted ? (
          <i>{copy.stream.removed}</i>
        ) : voice ? (
          <span className="voice">
            <Icon name="play" size={14} />
            <span className="bar" aria-hidden="true" />
            <span>{voice.durationLabel}</span>
            <span className="sr">{copy.stream.voice}</span>
            {voice.transcript ? <span>{voice.transcript}</span> : null}
          </span>
        ) : (
          message.body
        )}
      </div>
      {showMeta && metaParts.length ? (
        <div className={`m${delivery === "failed" ? " failed" : ""}`}>
          {metaParts.join(" · ")}
          {delivery === "failed" && onRetry ? (
            <Btn size="xs" onClick={onRetry}>
              {copy.stream.retry}
            </Btn>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SystemLine({ text, icon = "check", variant = "desktop" }: { text: string; icon?: IconName; variant?: "desktop" | "mobile" }) {
  return (
    <div className={variant === "mobile" ? "mx-sys" : "sys"} data-system-line>
      <Icon name={icon} size={variant === "mobile" ? 13 : 12} />
      {text}
    </div>
  );
}

export function DaySeparator({ label, variant = "desktop" }: { label: string; variant?: "desktop" | "mobile" }) {
  return (
    <div className={variant === "mobile" ? "mx-day" : "day"} data-day-separator>
      {label}
    </div>
  );
}

export function UnreadDivider({ count, copy, variant = "desktop" }: { count: number; copy: KitCopy; variant?: "desktop" | "mobile" }) {
  if (count <= 0) return null;
  return (
    <div className={variant === "mobile" ? "mx-unread" : "unread-div"} data-unread-divider>
      {copy.stream.newCount.replace("{count}", String(count))}
    </div>
  );
}
