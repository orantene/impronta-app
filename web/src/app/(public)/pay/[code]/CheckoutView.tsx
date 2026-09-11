"use client";

import { useState, type ReactNode } from "react";

import { POS_NOTE, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "@/components/admin/pos/pos-classes";
import { useT } from "@/i18n/use-t";

export type CheckoutViewProps = {
  readonly code: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly expiresAt: string;
  readonly status: "open" | "paid" | "expired" | "cancelled" | "unknown" | "declined" | "processing";
  readonly lines: readonly { label: string; units: number; unitCents: number }[];
  readonly holdUntil: string | null;
  readonly stripeUrl: string | null;
  readonly threadHref: string | null;
  readonly receiptHref: string | null;
};

export function CheckoutView(props: CheckoutViewProps) {
  const t = useT();
  const [phase, setPhase] = useState<CheckoutViewProps["status"]>(props.status);
  const total = `${props.currency} ${(props.amountCents / 100).toFixed(2)}`.trim();

  if (phase === "paid") {
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold">{t("public.thread.paid")}</h1>
        <p className="mt-3 text-[16px]">{total}</p>
        <p className={POS_NOTE}>{t("public.thread.keepSlot")}</p>
        {props.receiptHref ? (
          <a className={POS_PRIMARY_ACTION} href={props.receiptHref}>
            {t("public.thread.receipt")}
          </a>
        ) : null}
        {props.threadHref ? (
          <a className={POS_SECONDARY_ACTION} href={props.threadHref}>
            {t("public.thread.backToThread")}
          </a>
        ) : null}
      </Shell>
    );
  }

  if (phase === "processing") {
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold">{t("public.thread.processing")}</h1>
        <p className="mt-3">{total}</p>
      </Shell>
    );
  }

  if (phase === "declined") {
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold">{t("public.thread.declined")}</h1>
        <p className="mt-3">{total}</p>
      </Shell>
    );
  }

  if (phase === "expired") {
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold">{t("public.thread.expired")}</h1>
      </Shell>
    );
  }

  if (phase === "cancelled") {
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold">{t("public.thread.cancelled")}</h1>
      </Shell>
    );
  }

  if (phase === "unknown") {
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold">{t("public.thread.unknown")}</h1>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-[22px] font-semibold">{t("public.thread.pay")}</h1>
      <p className="mt-2 text-[13px] text-admin-ink-muted">{t("public.thread.payBy")}</p>
      <ol className="mt-4 space-y-2">
        {props.lines.map((line, index) => (
          <li key={`${line.label}-${index}`} className="flex justify-between text-[15px]">
            <span>
              {line.units} · {line.label}
            </span>
            <span className="tabular-nums">{((line.unitCents * line.units) / 100).toFixed(2)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[20px] font-semibold tabular-nums">{total}</p>
      {props.holdUntil ? <p className="mt-2 text-[13px] text-admin-ink-muted">{props.holdUntil}</p> : null}
      <p className="mt-1 text-[13px] text-admin-ink-muted">{props.expiresAt}</p>
      <p className={POS_NOTE}>{t("public.thread.keepSlot")}</p>
      <div className="mt-6 flex flex-col gap-3">
        {props.stripeUrl ? (
          <a className={POS_PRIMARY_ACTION} href={props.stripeUrl}>
            {t("public.thread.pay")}
          </a>
        ) : (
          <a className={POS_PRIMARY_ACTION} href={`/pay/${props.code}?confirm=mock`} onClick={() => setPhase("processing")}>
            {t("public.thread.pay")}
          </a>
        )}
      </div>
    </Shell>
  );
}

function Shell(props: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-[390px] flex-col gap-3 bg-admin-surface px-4 py-8 text-admin-ink" data-pos-messages="checkout">
      {props.children}
    </main>
  );
}
