"use client";

/**
 * NewThreadLinkBanner — the customer's own thread link (`/c/t/<token>`),
 * right after `New conversation` creates one.
 *
 * D-145: `messagingStartConversation` mints the token this link is built
 * from, but `MessagesShell` used to drop it on the floor — nothing on the
 * main screen ever handed a customer their `/c/t/<token>` link, which was
 * reachable only by signing a token with the server secret by hand. This is
 * the door: Copy link, Send via WhatsApp, or Dismiss.
 *
 * A pure, isolated component ON PURPOSE — `MessagesShell` composes a whole
 * page of live data through server actions and cannot be rendered end to
 * end without a browser; this piece is presentational only, so its render
 * test (`NewThreadLinkBanner.render.test.tsx`) needs neither.
 */

import { cn } from "@/lib/utils";
import { POS_SECONDARY_ACTION } from "@/components/admin/pos/pos-classes";

export type NewThreadLinkBannerCopy = {
  readonly title: string;
  readonly copyLink: string;
  readonly copied: string;
  readonly send: string;
  readonly dismiss: string;
  readonly unavailable: string;
};

export type NewThreadLinkBannerProps = {
  /** Null when the server had no `GUEST_COOKIE_SECRET` to sign a token with. */
  readonly url: string | null;
  readonly copied: boolean;
  readonly onCopy: () => void;
  readonly onDismiss: () => void;
  readonly copy: NewThreadLinkBannerCopy;
  readonly className?: string;
};

export function NewThreadLinkBanner(props: NewThreadLinkBannerProps) {
  const { copy, url } = props;
  return (
    <div
      className={cn(
        "mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-[10px] border border-admin-border bg-admin-card px-3 py-2",
        props.className,
      )}
      data-pos-new-thread-link=""
    >
      <span className="text-[13px] font-semibold text-admin-ink-muted">{copy.title}</span>
      {url ? (
        <>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            data-pos-new-thread-link-url=""
            className="flex-1 truncate text-[13px] font-semibold text-admin-ink underline"
          >
            {url}
          </a>
          <button type="button" data-pos-new-thread-link-copy="" className={POS_SECONDARY_ACTION} onClick={props.onCopy}>
            {props.copied ? copy.copied : copy.copyLink}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            data-pos-new-thread-link-send=""
            className={POS_SECONDARY_ACTION}
          >
            {copy.send}
          </a>
        </>
      ) : (
        <span className="flex-1 text-[13px] text-admin-ink-muted">{copy.unavailable}</span>
      )}
      <button type="button" data-pos-new-thread-link-dismiss="" className={POS_SECONDARY_ACTION} onClick={props.onDismiss}>
        {copy.dismiss}
      </button>
    </div>
  );
}
