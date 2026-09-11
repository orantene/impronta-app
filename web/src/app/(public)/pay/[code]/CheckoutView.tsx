"use client";

import { useState } from "react";

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
  const total = (props.amountCents / 100).toFixed(2);

  if (phase === "paid") {
    return (
      <main className="mx-auto min-h-screen max-w-[390px] px-4 py-8 text-admin-ink">
        <h1 className="text-[22px] font-semibold">{t("public.thread.pay")}</h1>
        <p className="mt-3 text-[16px]">{total} {props.currency}</p>
        {props.receiptHref ? (
          <a className="mt-6 inline-flex h-12 items-center font-semibold text-admin-brand" href={props.receiptHref}>
            {t("public.thread.pay")}
          </a>
        ) : null}
        {props.threadHref ? (
          <a className="mt-4 block text-[15px] text-admin-brand" href={props.threadHref}>
            {t("public.thread.title")}
          </a>
        ) : null}
      </main>
    );
  }

  if (phase === "expired" || phase === "cancelled" || phase === "unknown" || phase === "declined") {
    return (
      <main className="mx-auto min-h-screen max-w-[390px] px-4 py-8 text-admin-ink">
        <h1 className="text-[22px] font-semibold">{t("public.thread.pay")}</h1>
        <p className="mt-3 text-[15px]">{phase}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-[390px] px-4 py-8 text-admin-ink">
      <h1 className="text-[22px] font-semibold">{t("public.thread.pay")}</h1>
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
      <p className="mt-4 text-[20px] font-semibold tabular-nums">
        {total} {props.currency}
      </p>
      {props.holdUntil ? <p className="mt-2 text-[13px] text-admin-ink-muted">{props.holdUntil}</p> : null}
      <p className="mt-1 text-[13px] text-admin-ink-muted">{props.expiresAt}</p>
      {phase === "processing" ? <p className="mt-6 text-[15px]">processing</p> : null}
      <div className="mt-6 flex flex-col gap-3">
        {props.stripeUrl ? (
          <a className="inline-flex h-14 items-center justify-center rounded-[14px] bg-admin-brand font-semibold text-admin-card" href={props.stripeUrl}>
            {t("public.thread.pay")}
          </a>
        ) : (
          <a
            className="inline-flex h-14 items-center justify-center rounded-[14px] bg-admin-brand font-semibold text-admin-card"
            href={`/pay/${props.code}?confirm=mock`}
            onClick={() => setPhase("processing")}
          >
            {t("public.thread.pay")}
          </a>
        )}
      </div>
    </main>
  );
}
