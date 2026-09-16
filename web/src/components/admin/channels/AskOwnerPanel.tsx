"use client";

import { useState, useTransition } from "react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { askOwnerToConnectWhatsApp } from "@/lib/channels/pairing-actions";

export function AskOwnerPanel({ ownerFirstName }: { ownerFirstName: string | null }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const name = ownerFirstName || t("dashboard.channels.ownerFallback");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-10 text-center">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-admin-success-soft text-admin-success">
        <span className="text-[28px] leading-none">◎</span>
      </span>
      <h2 className="m-0 text-[22px] font-semibold text-admin-ink">{t("dashboard.channels.ask.title")}</h2>
      <p className="m-0 max-w-[360px] text-[14px] leading-[1.5] text-admin-ink-muted">
        {interpolate(t("dashboard.channels.ask.body"), { name })}
      </p>
      <button
        type="button"
        disabled={pending || done}
        onClick={() =>
          start(async () => {
            const result = await askOwnerToConnectWhatsApp();
            if (result.ok) setDone(true);
          })
        }
        className="inline-flex h-11 items-center rounded-full bg-admin-brand px-5 text-[14px] font-semibold text-white disabled:opacity-60"
      >
        {done
          ? t("dashboard.channels.ask.sent")
          : interpolate(t("dashboard.channels.ask.cta"), { name })}
      </button>
      <p className="m-0 text-[12px] text-admin-ink-dim">{t("dashboard.channels.ask.otherChannels")}</p>
    </div>
  );
}
