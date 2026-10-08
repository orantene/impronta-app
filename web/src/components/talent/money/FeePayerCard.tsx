"use client";

/**
 * "Who pays the card fee" setting (talent Money + Messages settings drawer),
 * plus the one-time tip that offers to flip it.
 *
 * Tip dismissal is localStorage-only (try/catch): there is no existing
 * per-user dismissals table that fits without a migration. Cost: it shows
 * once per browser, not once per account.
 */

import { useEffect, useState } from "react";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { getFeePayer, getFeePreviewConfig, setFeePayer } from "@/lib/billing/fee-payer-actions";
import type { FeePreviewPlatformConfig } from "@/lib/billing/platform-processing-mode";
import {
  DEFAULT_FEE_PAYER,
  formatFeeMoney,
  previewFeeLines,
  type FeePayer,
} from "@/lib/billing/fee-payer-setting";

const TIP_KEY = "tulala.tip.fee-payer.v1";

function tipDismissed(): boolean {
  try {
    return window.localStorage.getItem(TIP_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberTipDismissed(): void {
  try {
    window.localStorage.setItem(TIP_KEY, "1");
  } catch {
    /* private mode: the tip may show again, which is harmless */
  }
}

function useFeePayer() {
  const [feePayer, setLocal] = useState<FeePayer>(DEFAULT_FEE_PAYER);
  const [error, setError] = useState(false);
  useEffect(() => {
    let off = false;
    void getFeePayer()
      .then((v) => {
        if (!off) setLocal(v);
      })
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, []);
  async function change(next: FeePayer): Promise<boolean> {
    const prev = feePayer;
    setLocal(next);
    setError(false);
    try {
      const res = await setFeePayer(next);
      if (!res.ok) throw new Error(res.error);
      return true;
    } catch {
      setLocal(prev);
      setError(true);
      return false;
    }
  }
  return { feePayer, change, error };
}

/**
 * `showTip={false}` where the selector is already on screen next to the tip
 * (Money page): the promo only repeats the choice below it (QA DS-50).
 */
export function FeePayerCard({ currency, showTip: tipAllowed = true }: { currency: string; showTip?: boolean }) {
  const t = useDashboardText().t;
  const { feePayer, change, error } = useFeePayer();
  const [tipOpen, setTipOpen] = useState(false);
  const [platformConfig, setPlatformConfig] = useState<FeePreviewPlatformConfig | null>(null);

  useEffect(() => {
    setTipOpen(!tipDismissed());
  }, []);

  useEffect(() => {
    let off = false;
    setPlatformConfig(null);
    void getFeePreviewConfig(currency)
      .then((cfg) => {
        if (!off) setPlatformConfig(cfg);
      })
      .catch(() => {
        if (!off) setPlatformConfig(null);
      });
    return () => {
      off = true;
    };
  }, [currency]);

  const mx = currency.toUpperCase() === "MXN";
  const base = mx ? 1000 : 100;
  // Never invent 150 bps / local rates while config is loading or missing.
  const lines = platformConfig
    ? previewFeeLines({
        price: base,
        currency,
        feePayer,
        takeBps: platformConfig.takeBps,
        processorFeeRates: platformConfig.processorFeeRates,
        takeFloorCents: platformConfig.takeFloorCents,
      })
    : null;
  const price = formatFeeMoney(base * 100, currency);
  const preview = lines
    ? t(
        feePayer === "client"
          ? "A {price} booking: your client pays about {client}, you receive {you}"
          : "A {price} booking: your client pays about {client}, you receive about {you}",
      )
        .replace("{price}", price)
        .replace("{client}", formatFeeMoney(lines.clientTotalMinor, currency))
        .replace("{you}", formatFeeMoney(lines.sellerReceivesMinor, currency))
    : t("Loading fee estimate…");

  const option = (id: FeePayer, label: string, hint: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={feePayer === id}
      onClick={() => void change(id)}
      className={`min-h-[44px] flex-1 rounded-[12px] border px-4 py-3 text-left font-admin-body ${
        feePayer === id
          ? "border-[var(--tc-action)] bg-[var(--tc-soft)] text-[var(--tc-ink)]"
          : "border-[var(--tc-border)] bg-white text-[var(--tc-ink)]"
      }`}
    >
      <span className={`block text-[14px] ${feePayer === id ? "font-semibold" : "font-medium"}`}>{label}</span>
      <span className="mt-0.5 block text-[12.5px] text-[var(--tc-muted)]">
        {hint}
      </span>
    </button>
  );

  const showTip = tipAllowed && tipOpen && feePayer === "seller";

  return (
    <section
      data-testid="fee-payer-card"
      className="mb-4 rounded-[12px] border border-admin-border-soft bg-white p-4"
    >
      {showTip ? (
        <div
          role="note"
          data-testid="fee-payer-tip"
          className="mb-3 flex items-start gap-3 rounded-[10px] border border-[var(--tc-border)] bg-[var(--tc-soft)] px-3 py-2.5"
        >
          <div className="min-w-0 flex-1">
            <p className="font-admin-body text-[13.5px] font-semibold text-admin-ink">
              {t("Want to keep 100% of your price? Let clients cover the card fee")}
            </p>
            <button
              type="button"
              className="mt-2 inline-flex h-9 items-center rounded-full border border-[var(--tc-action)] bg-[var(--tc-action)] px-4 font-admin-body text-[13px] font-semibold text-white hover:bg-[var(--tc-action-hover)]"
              onClick={() => {
                void change("client").then((ok) => {
                  if (ok) {
                    rememberTipDismissed();
                    setTipOpen(false);
                  }
                });
              }}
            >
              {t("Let clients cover it")}
            </button>
          </div>
          <button
            type="button"
            aria-label={t("Dismiss tip")}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[16px] text-admin-ink-muted"
            onClick={() => {
              rememberTipDismissed();
              setTipOpen(false);
            }}
          >
            ×
          </button>
        </div>
      ) : null}
      <h3 className="font-admin-body text-[14px] font-semibold text-admin-ink">{t("Who pays the card fee")}</h3>
      <div role="radiogroup" aria-label={t("Who pays the card fee")} className="mt-2 flex flex-col gap-2 sm:flex-row">
        {option("seller", t("I pay it"), t("Card processing is taken from your price, at cost."))}
        {option(
          "client",
          t("My client pays it"),
          t("Your client adds the card fee at checkout and you receive 100% of your price."),
        )}
      </div>
      <p data-testid="fee-payer-preview" className="mt-3 font-admin-body text-[13.5px] text-admin-ink">
        {preview}
      </p>
      <p className="mt-1 font-admin-body text-[12px] text-admin-ink-muted">
        {t("This is an estimate. Fees are non-refundable.")}
      </p>
      {error ? (
        <p role="alert" className="mt-1 font-admin-body text-[12px] text-admin-critical">
          {t("Could not save. Try again.")}
        </p>
      ) : null}
    </section>
  );
}
