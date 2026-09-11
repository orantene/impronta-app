"use client";

import { useMemo, useState } from "react";

import { POS_INPUT, POS_NOTE, POS_PRIMARY_ACTION } from "@/components/admin/pos/pos-classes";
import { useT } from "@/i18n/use-t";
import type { CardRenderModel } from "@/lib/messaging/cards";
import { messagingIssueVisitorCode } from "@/lib/server-actions/messaging-engine";
import type { ThreadMessage } from "@/lib/messaging/types";

import { CustomerCard } from "./CustomerCards";

export function CustomerThread(props: {
  readonly token: string;
  readonly messages: readonly (ThreadMessage & { render: CardRenderModel })[];
  readonly talentView?: boolean;
  readonly smsOnly?: boolean;
}) {
  const t = useT();
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const title = useMemo(() => t("public.thread.title"), [t]);

  return (
    <main className="mx-auto min-h-screen max-w-[390px] bg-admin-surface px-4 py-6 text-admin-ink" data-pos-messages="customer">
      <h1 className="text-[22px] font-semibold">{title}</h1>
      {props.talentView ? <p className={POS_NOTE}>{t("public.thread.talentView")}</p> : null}
      {props.smsOnly ? <p className={POS_NOTE}>{t("public.thread.smsPlain")}</p> : null}
      {props.messages.length === 0 ? (
        <p className="mt-6 text-[15px] text-admin-ink-muted">{t("public.thread.empty")}</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {props.messages.map((message) => (
            <li key={message.id}>
              {props.smsOnly ? (
                <p className="text-[15px]">{message.render.smsText || message.body}</p>
              ) : (
                <CustomerCard
                  token={props.token}
                  kind={message.render.kind}
                  model={message.render}
                  body={message.body}
                  onStatus={setStatus}
                />
              )}
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
          className={POS_INPUT}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          inputMode="tel"
          aria-label={t("public.thread.continue")}
        />
        <button type="submit" className={POS_PRIMARY_ACTION}>
          {t("public.thread.continue")}
        </button>
        {status ? <p className="text-[14px] text-admin-ink-muted">{status}</p> : null}
      </form>
    </main>
  );
}
