"use client";

/**
 * PaymentsProvidersCard — Settings › Payments & providers as the W21 board
 * draws it: the header, the "Used in" line, Stripe beside Mercado Pago ·
 * Point with their verified capabilities, then the method table for the one
 * location.
 *
 * READ-ONLY, ON PURPOSE. Every provider here is configured through
 * environment variables the platform manages (money.md §3 confirms POS card
 * collection is the platform Stripe account, never a per-workspace key), so
 * there is nothing this screen could let a workspace edit truthfully. The
 * board's Save and Connect account are drawn DISABLED with their reason
 * (D-POS-58), never as buttons that silently do nothing.
 *
 * NEVER SHOWS A SECRET. `getPaymentProviderStatus` returns booleans and a
 * closed reason code — see `lib/payments/provider-status.ts`. "Test mode"
 * therefore says the keys stay on the platform rather than guessing.
 *
 * EVERY ROW OF THE METHOD TABLE IS A FACT OF THE ENGINE, not of the board:
 * cash needs an open shift (`lib/pos/shift.ts`); the reader row follows
 * `stripe_terminal`; online card follows `stripe_checkout`; a payment link
 * has no table (D-POS-42); a recorded bank transfer is not a tender
 * `settleAtDoor` knows (`paidVia: "cash" | "card"`); credit is an
 * entitlement, not a tender; two methods on one sale is `collection.split`.
 *
 * A REFUSAL IS TRANSLATED HERE, AND A DEAD LOAD HAS A WAY OUT (W59).
 */

import { useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import { getPaymentProviderStatus } from "@/lib/server-actions/payment-providers";
import {
  CLIENT_LOAD_REFUSAL,
  type ClientLoadRefusal,
  type PaymentProviderRefusal,
} from "@/lib/settings/refusals";
import type { ProviderId, ProviderStatus } from "@/lib/payments/provider-status";
import {
  ActionButton,
  CouldNotLoad,
  FactRow,
  GridHead,
  GridRow,
  LoadingLines,
  Note,
  SettingsCard,
  SettingsHeader,
  StatePill,
  UsedIn,
} from "./settings-ui";

const K = "dashboard.adminWorkspace.paymentsProviders";

/** A server refusal, or the one failure that never reaches the server at all. */
type CardRefusal = PaymentProviderRefusal | ClientLoadRefusal;

const METHOD_COLS = "grid-cols-[1.3fr_110px_1.6fr]";

type MethodRow = { id: string; on: boolean; rule: string };

export function PaymentsProvidersCard({ workspaceName }: { workspaceName: string }) {
  const t = useT();
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [refusal, setRefusal] = useState<CardRefusal | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setRefusal(null);
    void getPaymentProviderStatus()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setProviders(res.providers);
        else setRefusal(res.reason);
      })
      .catch(() => {
        if (!cancelled) setRefusal(CLIENT_LOAD_REFUSAL);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const status = (id: ProviderId): ProviderStatus | undefined => providers?.find((p) => p.id === id);
  const online = status("stripe_checkout");
  const reader = status("stripe_terminal");
  const stripeConnected = Boolean(online?.configured);

  const methods: MethodRow[] = [
    { id: "cash", on: true, rule: t(`${K}.methods.cashRule`) },
    { id: "cardReader", on: Boolean(reader?.configured), rule: t(`${K}.methods.cardReaderRule`) },
    { id: "cardOnline", on: stripeConnected, rule: t(`${K}.methods.cardOnlineRule`) },
    { id: "paymentLink", on: false, rule: t(`${K}.methods.paymentLinkRule`) },
    { id: "bankTransfer", on: false, rule: t(`${K}.methods.bankTransferRule`) },
    { id: "credit", on: false, rule: t(`${K}.methods.creditRule`) },
    { id: "twoMethods", on: true, rule: t(`${K}.methods.twoMethodsRule`) },
  ];

  return (
    <div data-testid="payments-providers-card" className="flex flex-col gap-[14px]">
      <SettingsHeader
        title={t(`${K}.label`)}
        subtitle={t(`${K}.headerSubtitle`)}
        actions={
          <ActionButton tone="primary" reason={t(`${K}.notWired.save`)} testId="payments-providers-save">
            {t(`${K}.save`)}
          </ActionButton>
        }
      />
      <div className="flex flex-col gap-[4px]">
        <UsedIn
          count={6}
          label={t(`${K}.usedIn`)}
          parts={[
            { where: t(`${K}.usedInPos`), what: t(`${K}.usedInPosList`) },
            { where: t(`${K}.usedInWeb`), what: t(`${K}.usedInWebList`) },
          ]}
        />
        <span className="text-[11.5px] text-admin-ink-dim">{t(`${K}.usedInNote`)}</span>
      </div>

      {refusal ? (
        <CouldNotLoad
          testId="payments-providers-load-failed"
          message={t(`${K}.errors.${refusal}`)}
          retryLabel={t(`${K}.retry`)}
          onRetry={() => setReloadToken((n) => n + 1)}
        />
      ) : providers === null ? (
        <SettingsCard>
          <LoadingLines label={t(`${K}.loading`)} />
        </SettingsCard>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-2">
            <SettingsCard testId="provider-card-stripe">
              <div className="flex items-center gap-[8px]">
                <span className="flex-1 text-admin-13 font-semibold text-admin-ink">{t(`${K}.stripe.title`)}</span>
                {stripeConnected ? (
                  <StatePill tone="green" state="connected">{t(`${K}.statusConnected`)}</StatePill>
                ) : (
                  <StatePill tone="coral" state="not-connected">{t(`${K}.statusNotConnected`)}</StatePill>
                )}
              </div>
              <div className="flex flex-col">
                <FactRow label={t(`${K}.stripe.seller`)}>{workspaceName} · USD</FactRow>
                <FactRow label={t(`${K}.stripe.online`)}>
                  {stripeConnected ? t(`${K}.stripe.onlineYes`) : t(`${K}.reasons.${online?.reason ?? "missing_secret_key"}`)}
                </FactRow>
                <FactRow label={t(`${K}.stripe.reader`)}>{t(`${K}.stripe.reader_${reader?.reason ?? "missing_secret_key"}`)}</FactRow>
                <FactRow label={t(`${K}.stripe.refunds`)}>{t(`${K}.stripe.refundsValue`)}</FactRow>
                <FactRow label={t(`${K}.stripe.links`)} muted>{t(`${K}.stripe.linksValue`)}</FactRow>
                <FactRow label={t(`${K}.stripe.testMode`)} muted>{t(`${K}.stripe.testModeValue`)}</FactRow>
              </div>
            </SettingsCard>

            <SettingsCard testId="provider-card-mercado-pago">
              <div className="flex items-center gap-[8px]">
                <span className="flex-1 text-admin-13 font-semibold text-admin-ink">{t(`${K}.mercadoPago.title`)}</span>
                <StatePill tone="coral" state="not-connected">{t(`${K}.statusNotConnected`)}</StatePill>
              </div>
              <div className="flex flex-col">
                <FactRow label={t(`${K}.mercadoPago.reader`)} muted>{t(`${K}.mercadoPago.readerValue`)}</FactRow>
                <FactRow label={t(`${K}.mercadoPago.capabilities`)}>{t(`${K}.mercadoPago.capabilitiesValue`)}</FactRow>
                <FactRow label={t(`${K}.mercadoPago.unknown`)}>{t(`${K}.mercadoPago.unknownValue`)}</FactRow>
                <FactRow label={t(`${K}.mercadoPago.sandbox`)}>{t(`${K}.mercadoPago.sandboxValue`)}</FactRow>
              </div>
              <ActionButton reason={t(`${K}.notWired.connect`)} testId="payments-providers-connect" className="w-full">
                {t(`${K}.mercadoPago.connect`)}
              </ActionButton>
            </SettingsCard>
          </div>

          <section data-testid="payment-methods-table" className="rounded-[14px] border border-admin-border bg-admin-card">
            <GridHead cols={METHOD_COLS} columns={[t(`${K}.methods.colMethod`), t(`${K}.methods.colLocation`), t(`${K}.methods.colRules`)]} />
            {methods.map((m) => (
              <GridRow key={m.id} cols={METHOD_COLS} testId={`payment-method-${m.id}`}>
                <span className="font-semibold text-admin-ink">{t(`${K}.methods.${m.id}`)}</span>
                <span>
                  {m.on ? (
                    <StatePill tone="green" state="on">{t(`${K}.methods.on`)}</StatePill>
                  ) : (
                    <StatePill tone="slate" state="off">{t(`${K}.methods.off`)}</StatePill>
                  )}
                </span>
                <span className="text-admin-ink-muted">{m.rule}</span>
              </GridRow>
            ))}
          </section>
        </>
      )}

      <Note>{t(`${K}.secretsNote`)}</Note>
    </div>
  );
}
