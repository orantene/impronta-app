"use client";

import { useState, useTransition } from "react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { requestWhatsAppPairingCode, startWhatsAppPairing } from "@/lib/channels/pairing-actions";
import type { WhatsAppConnectionPublic } from "@/lib/channels/types";

function QrBox({ payload }: { payload: string }) {
  return (
    <div className="flex h-[220px] w-[220px] items-center justify-center rounded-[16px] border border-admin-border bg-admin-card p-3">
      <pre className="m-0 max-h-full max-w-full overflow-hidden break-all text-[9px] leading-[1.2] text-admin-ink">
        {payload}
      </pre>
    </div>
  );
}

export function PairingPanel({ connection }: { connection: WhatsAppConnectionPublic }) {
  const t = useT();
  const [consented, setConsented] = useState(Boolean(connection.pairingQr || connection.pairingCode));
  const [phone, setPhone] = useState("");
  const [codeMode, setCodeMode] = useState(Boolean(connection.pairingCode));
  const [pending, start] = useTransition();

  const showSecret = consented && (connection.pairingQr || connection.pairingCode || connection.state === "pairing");

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-auto px-8 py-6">
      <div>
        <h2 className="m-0 text-[22px] font-semibold text-admin-ink">{t("dashboard.channels.pair.title")}</h2>
        <p className="mt-2 max-w-[420px] text-[14px] leading-[1.5] text-admin-ink-muted">
          {t("dashboard.channels.pair.lede")}
        </p>
      </div>
      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        <li className="flex gap-3 text-[14px] text-admin-ink">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-admin-border text-[12px]">1</span>
          <span>{t("dashboard.channels.pair.step1")}</span>
        </li>
        <li className="flex gap-3 text-[14px] text-admin-ink">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-admin-border text-[12px]">2</span>
          <span>{t("dashboard.channels.pair.step2")}</span>
        </li>
        <li className="flex gap-3 text-[14px] text-admin-ink">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-admin-border text-[12px]">3</span>
          <span>{t("dashboard.channels.pair.step3")}</span>
        </li>
      </ol>
      <div className="flex flex-col items-center gap-3">
        {showSecret && connection.pairingQr ? <QrBox payload={connection.pairingQr} /> : null}
        {showSecret && connection.pairingCode ? (
          <p className="m-0 font-admin-body text-[28px] tracking-[0.2em] text-admin-ink">{connection.pairingCode}</p>
        ) : null}
        {showSecret && !connection.pairingQr && !connection.pairingCode ? (
          <p className="m-0 text-[13px] text-admin-ink-muted">{t("dashboard.channels.pair.waiting")}</p>
        ) : null}
        {showSecret && connection.pairingExpiresAt ? (
          <p className="m-0 text-[12px] text-admin-ink-dim">{t("dashboard.channels.pair.refresh")}</p>
        ) : null}
        {consented && !codeMode ? (
          <button
            type="button"
            className="text-[13px] font-semibold text-admin-brand"
            onClick={() => setCodeMode(true)}
          >
            {t("dashboard.channels.pair.useCode")}
          </button>
        ) : null}
        {consented && codeMode ? (
          <form
            className="flex w-full max-w-[280px] flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              start(async () => {
                await requestWhatsAppPairingCode({ phone });
              });
            }}
          >
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={t("dashboard.channels.pair.phonePlaceholder")}
              className="h-10 rounded-[10px] border border-admin-border px-3 text-[14px]"
              aria-label={t("dashboard.channels.pair.phonePlaceholder")}
            />
            <button
              type="submit"
              disabled={pending}
              className="h-10 rounded-[10px] bg-admin-brand text-[13px] font-semibold text-white"
            >
              {t("dashboard.channels.pair.requestCode")}
            </button>
          </form>
        ) : null}
      </div>
      <label className="mt-auto flex items-start gap-3 rounded-[14px] bg-admin-surface-alt p-4 text-[13px] leading-[1.5] text-admin-ink-muted">
        <input
          type="checkbox"
          checked={consented}
          onChange={(event) => {
            const next = event.target.checked;
            setConsented(next);
            if (next) start(async () => { await startWhatsAppPairing({ consented: true }); });
          }}
          className="mt-1"
        />
        <span>
          <span className="block text-admin-ink-muted">{t("dashboard.channels.pair.consentLegal")}</span>
          <span className="mt-2 block font-semibold text-admin-ink">{t("dashboard.channels.pair.consent")}</span>
        </span>
      </label>
      {connection.lastError && !connection.lastError.startsWith("pairing_code:") ? (
        <p className="m-0 text-[13px] text-admin-red">
          {interpolate(t("dashboard.channels.pair.error"), { error: connection.lastError })}
        </p>
      ) : null}
    </div>
  );
}
