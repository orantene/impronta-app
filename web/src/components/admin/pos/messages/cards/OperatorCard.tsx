"use client";

import { POS_SURFACE } from "@/components/admin/pos/pos-classes";
import type { CardRenderModel } from "@/lib/messaging/cards";
import type { ThreadMessage } from "@/lib/messaging/types";
import { cn } from "@/lib/utils";

export function OperatorCard(props: { readonly message: ThreadMessage; readonly model: CardRenderModel }) {
  const mine = Boolean(props.message.senderUserId);
  return (
    <article
      className={cn(POS_SURFACE, "max-w-[520px] px-4 py-3", mine ? "ml-auto" : "")}
      data-card-kind={props.model.kind}
      data-card-state={props.model.state}
    >
      {props.message.internal ? (
        <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-admin-ink-muted">{props.model.title}</p>
      ) : (
        <p className="text-[13px] font-semibold">{props.model.title}</p>
      )}
      <p className="mt-1 whitespace-pre-wrap text-[15px] text-admin-ink">{props.message.body || props.model.summary}</p>
      {props.message.delivery ? (
        <p className="mt-2 text-[12px] text-admin-ink-muted">
          {props.message.delivery.channel} · {props.message.delivery.state}
        </p>
      ) : null}
    </article>
  );
}
