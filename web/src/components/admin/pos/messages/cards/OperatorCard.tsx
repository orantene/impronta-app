"use client";

import { POS_PILL, POS_PILL_SLATE, POS_SURFACE } from "@/components/admin/pos/pos-classes";
import type { CardRenderModel } from "@/lib/messaging/cards";
import type { ThreadMessage } from "@/lib/messaging/types";
import { cn } from "@/lib/utils";

export function OperatorCard(props: { readonly message: ThreadMessage; readonly model: CardRenderModel }) {
  const mine = Boolean(props.message.senderUserId);
  const structured = props.model.kind !== "text";
  return (
    <article
      className={cn(POS_SURFACE, "max-w-[520px] px-4 py-3", mine ? "ml-auto" : "")}
      data-card-kind={props.model.kind}
      data-card-state={props.model.state}
    >
      {props.message.internal ? (
        <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-admin-ink-muted">{props.model.title}</p>
      ) : structured ? (
        <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-admin-ink-muted">{props.model.title}</p>
      ) : null}
      {structured ? <span className={cn(POS_PILL, POS_PILL_SLATE, "mt-1")}>{props.model.state}</span> : null}
      <CardBody model={props.model} body={props.message.body} />
      {props.model.actions.length > 0 ? (
        <p className="mt-2 text-[12px] text-admin-ink-muted">{props.model.actions.join(" · ")}</p>
      ) : null}
      {props.message.delivery ? (
        <p className="mt-2 text-[12px] text-admin-ink-muted">
          {props.message.delivery.channel} · {props.message.delivery.state}
        </p>
      ) : null}
    </article>
  );
}

function CardBody(props: { model: CardRenderModel; body: string }) {
  const payload = props.model.payload;
  if (props.model.kind === "menu_options" && Array.isArray(payload.labels)) {
    return (
      <ul className="mt-2 space-y-1 text-[15px]">
        {(payload.labels as unknown[]).map((label, index) => {
          const prices = Array.isArray(payload.pricesCents) ? payload.pricesCents : [];
          const price = typeof prices[index] === "number" ? (prices[index] as number) / 100 : null;
          return (
            <li key={`${String(label)}-${index}`} className="flex justify-between gap-3">
              <span>{String(label)}</span>
              {price != null ? <span className="tabular-nums">{price.toFixed(0)}</span> : null}
            </li>
          );
        })}
      </ul>
    );
  }
  return <p className="mt-1 whitespace-pre-wrap text-[15px] text-admin-ink">{props.body || props.model.summary}</p>;
}
