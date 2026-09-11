"use client";

import { useEffect, useState, useTransition } from "react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { loadWhatsAppConnection, unlinkWhatsApp } from "@/lib/channels/pairing-actions";
import type { WhatsAppConnectionPublic } from "@/lib/channels/types";

export function ChannelsSettingsClient() {
  const t = useT();
  const [connection, setConnection] = useState<WhatsAppConnectionPublic | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    void loadWhatsAppConnection().then((result) => {
      if (result.ok && result.enabled) setConnection(result.connection);
    });
  }, []);

  return (
    <main className="mx-auto max-w-[720px] px-6 py-8 font-admin-body">
      <h1 className="m-0 text-[22px] font-semibold text-admin-ink">{t("dashboard.channels.settings.title")}</h1>
      <p className="mt-2 text-[14px] text-admin-ink-muted">{t("dashboard.channels.settings.lede")}</p>
      <section className="mt-6 rounded-[16px] border border-admin-border bg-admin-card p-5">
        <h2 className="m-0 text-[16px] font-semibold text-admin-ink">{t("dashboard.channels.settings.whatsapp")}</h2>
        {connection ? (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px] text-admin-ink-muted">
            <dt>{t("dashboard.channels.settings.state")}</dt>
            <dd className="m-0 text-admin-ink">{connection.state}</dd>
            <dt>{t("dashboard.channels.settings.phone")}</dt>
            <dd className="m-0 text-admin-ink">{connection.phoneE164 ?? "-"}</dd>
            <dt>{t("dashboard.channels.settings.paired")}</dt>
            <dd className="m-0 text-admin-ink">{connection.pairedAt ?? "-"}</dd>
            <dt>{t("dashboard.channels.settings.lastSeen")}</dt>
            <dd className="m-0 text-admin-ink">{connection.lastSeenAt ?? "-"}</dd>
          </dl>
        ) : (
          <p className="mt-3 text-[13px] text-admin-ink-muted">{t("dashboard.channels.settings.loading")}</p>
        )}
        {connection?.canPair ? (
          <button
            type="button"
            disabled={pending || connection.state === "disconnected"}
            onClick={() =>
              start(async () => {
                await unlinkWhatsApp();
                const next = await loadWhatsAppConnection();
                if (next.ok && next.enabled) setConnection(next.connection);
              })
            }
            className="mt-4 h-10 rounded-[10px] border border-admin-border px-4 text-[13px] font-semibold text-admin-ink"
          >
            {t("dashboard.channels.settings.unlink")}
          </button>
        ) : null}
      </section>
      <section className="mt-4 rounded-[16px] border border-admin-border bg-admin-card p-5">
        <h2 className="m-0 text-[16px] font-semibold text-admin-ink">{t("dashboard.channels.settings.other")}</h2>
        <p className="mt-2 text-[13px] text-admin-ink-muted">
          {interpolate(t("dashboard.channels.settings.otherBody"), { reply: t("dashboard.channels.settings.whoCanReply") })}
        </p>
      </section>
    </main>
  );
}
