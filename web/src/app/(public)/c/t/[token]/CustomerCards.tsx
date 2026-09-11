"use client";

import { POS_NOTE, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION, POS_SURFACE } from "@/components/admin/pos/pos-classes";
import { useT } from "@/i18n/use-t";
import type { CardRenderModel } from "@/lib/messaging/cards";
import { messagingGuestDraftAdd } from "@/lib/server-actions/messaging-engine";
import { cn } from "@/lib/utils";

export function CustomerCard(props: {
  readonly token: string;
  readonly kind: string;
  readonly model: CardRenderModel;
  readonly body: string;
  readonly onStatus: (value: string) => void;
}) {
  const t = useT();
  const payload = props.model.payload;
  const kind = props.kind;

  if (kind === "menu_options") {
    const labels = Array.isArray(payload.labels) ? payload.labels : [];
    const prices = Array.isArray(payload.pricesCents) ? payload.pricesCents : [];
    return (
      <article className={cn(POS_SURFACE, "px-4 py-3")} data-card-kind="menu_options">
        <p className="text-[13px] font-semibold">{props.model.title}</p>
        <ul className="mt-2 space-y-2">
          {labels.map((label, index) => (
            <li key={`${String(label)}-${index}`} className="flex items-center justify-between gap-2">
              <span>{String(label)}</span>
              <span className="tabular-nums">{typeof prices[index] === "number" ? (Number(prices[index]) / 100).toFixed(0) : ""}</span>
              <button
                type="button"
                className={POS_SECONDARY_ACTION}
                onClick={() => addDraft(props, String(payload.offeringIds && Array.isArray(payload.offeringIds) ? payload.offeringIds[index] : payload.offeringId))}
              >
                {t("public.thread.choose")}
              </button>
            </li>
          ))}
        </ul>
      </article>
    );
  }

  if (kind === "item_config") {
    return (
      <article className={cn(POS_SURFACE, "px-4 py-3")} data-card-kind="item_config">
        <p className="font-semibold">{props.model.title}</p>
        <p className="mt-1 text-[15px]">{props.model.summary}</p>
        <button type="button" className={cn(POS_PRIMARY_ACTION, "mt-3")} onClick={() => addDraft(props, String(payload.offeringId ?? ""))}>
          {t("public.thread.configure")}
        </button>
      </article>
    );
  }

  if (kind === "basket" || kind === "payment_request") {
    const code = typeof payload.paymentLinkCode === "string" ? payload.paymentLinkCode : null;
    return (
      <article className={cn(POS_SURFACE, "px-4 py-3")} data-card-kind={kind}>
        <p className="font-semibold">{props.model.title}</p>
        <p className="mt-1 text-[15px]">{props.body || props.model.summary}</p>
        <p className={cn(POS_NOTE, "mt-2")}>{t("public.thread.keepSlot")}</p>
        {code ? (
          <a className={cn(POS_PRIMARY_ACTION, "mt-3")} href={`/pay/${code}`}>
            {t("public.thread.pay")}
          </a>
        ) : null}
      </article>
    );
  }

  if (kind === "class_card") {
    return (
      <article className={cn(POS_SURFACE, "px-4 py-3")} data-card-kind="class_card">
        <p className="font-semibold">{props.model.title}</p>
        <p className="mt-1">{props.model.summary}</p>
        {payload.waitlist ? <p className={cn(POS_NOTE, "mt-2")}>{t("public.thread.waitlist")}</p> : null}
      </article>
    );
  }

  if (kind === "tickets_card") {
    return (
      <article className={cn(POS_SURFACE, "px-4 py-3")} data-card-kind="tickets_card">
        <p className="font-semibold">{props.model.title}</p>
        <p className={cn(POS_NOTE, "mt-2")}>{t("public.thread.dateMismatch")}</p>
      </article>
    );
  }

  if (kind === "offer_review") {
    return (
      <article className={cn(POS_SURFACE, "px-4 py-3")} data-card-kind="offer_review">
        <p className="font-semibold">{props.model.title}</p>
        <p className="mt-1">{props.model.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={POS_PRIMARY_ACTION}>
            {t("public.thread.accept")}
          </button>
          <button type="button" className={POS_SECONDARY_ACTION}>
            {t("public.thread.changes")}
          </button>
          <button type="button" className={POS_SECONDARY_ACTION}>
            {t("public.thread.decline")}
          </button>
        </div>
      </article>
    );
  }

  if (kind === "order_confirmation" || kind === "appointment_confirmation") {
    return (
      <article className={cn(POS_SURFACE, "px-4 py-3")} data-card-kind={kind}>
        <p className="font-semibold">{props.model.title}</p>
        <p className="mt-1">{props.model.summary || props.body}</p>
      </article>
    );
  }

  return (
    <article className={cn(POS_SURFACE, "px-4 py-3")} data-card-kind={kind}>
      <p className="text-[13px] font-semibold">{props.model.title}</p>
      <p className="mt-1 text-[15px]">{props.body || props.model.summary}</p>
    </article>
  );
}

function addDraft(
  props: { token: string; model: CardRenderModel; onStatus: (value: string) => void },
  offeringId: string,
) {
  const orderId = typeof props.model.payload.orderId === "string" ? props.model.payload.orderId : "";
  if (!orderId || !offeringId) return;
  void messagingGuestDraftAdd({
    token: props.token,
    orderId,
    offeringId,
    units: 1,
    expectedVersion: Number(props.model.payload.version ?? 1),
  }).then((result) => {
    if (!result.ok) props.onStatus(result.reason);
  });
}
