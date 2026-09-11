"use client";

import { useMemo, useState } from "react";

import { useT } from "@/i18n/use-t";
import { messagingGuestDraftAdd, messagingIssueVisitorCode } from "@/lib/server-actions/messaging-engine";
import type { CardRenderModel } from "@/lib/messaging/cards";
import type { ThreadMessage } from "@/lib/messaging/types";

export function CustomerThread(props: {
  readonly token: string;
  readonly messages: readonly (ThreadMessage & { render: CardRenderModel })[];
}) {
  const t = useT();
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const title = useMemo(() => t("public.thread.title"), [t]);

  return (
    <main className="mx-auto min-h-screen max-w-[390px] bg-admin-surface px-4 py-6 text-admin-ink">
      <h1 className="text-[22px] font-semibold">{title}</h1>
      {props.messages.length === 0 ? (
        <p className="mt-6 text-[15px] text-admin-ink-muted">{t("public.thread.empty")}</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {props.messages.map((message) => (
            <li
              key={message.id}
              className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card px-4 py-3"
              data-card-kind={message.render.kind}
            >
              <p className="text-[13px] font-semibold">{message.render.title}</p>
              <p className="mt-1 text-[15px]">{message.body || message.render.summary}</p>
              {message.render.kind === "payment_request" && typeof message.payload?.paymentLinkCode === "string" ? (
                <a className="mt-3 inline-flex h-12 items-center text-[15px] font-semibold text-admin-brand" href={`/pay/${message.payload.paymentLinkCode}`}>
                  {t("public.thread.pay")}
                </a>
              ) : null}
              {message.render.kind === "menu_options" && typeof message.payload?.offeringId === "string" ? (
                <button
                  type="button"
                  className="mt-3 text-[15px] font-semibold text-admin-brand"
                  onClick={() => {
                    const orderId = typeof message.payload?.orderId === "string" ? message.payload.orderId : "";
                    if (!orderId) return;
                    void messagingGuestDraftAdd({
                      token: props.token,
                      orderId,
                      offeringId: String(message.payload?.offeringId),
                      units: 1,
                      expectedVersion: Number(message.payload?.version ?? 1),
                    }).then((result) => {
                      if (!result.ok) setStatus(result.reason);
                    });
                  }}
                >
                  {t("public.thread.pay")}
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      <form
        className="mt-8 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void messagingIssueVisitorCode({ token: props.token, phone }).then((result) => {
            setStatus(result.ok ? t("public.thread.codeSent") : result.reason);
          });
        }}
      >
        <p className="text-[14px] font-semibold">{t("public.thread.continue")}</p>
        <input
          className="h-[52px] w-full rounded-[12px] border-[1.5px] border-admin-border bg-admin-card px-4"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          inputMode="tel"
        />
        <button type="submit" className="h-12 font-semibold text-admin-brand">
          {t("public.thread.continue")}
        </button>
        {status ? <p className="text-[13px] text-admin-ink-muted">{status}</p> : null}
      </form>
    </main>
  );
}
