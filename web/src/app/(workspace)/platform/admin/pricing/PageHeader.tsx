"use client";

/**
 * PageHeader — title row + (Stripe-account chip | FX preview strip)
 * grid for the /platform/admin/pricing dashboard.
 */

import { useTransition } from "react";
import type {
  StripeAccountInfo,
  FxPreview,
} from "@/lib/pricing/pricing-types";
import {
  formatUnitAmount,
  ECB_UNCOVERED_CURRENCIES,
} from "@/lib/pricing/pricing-types";
import { verifyStripeAccount } from "@/lib/server-actions/admin-product-pricing";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { HQ, F, FD } from "./_tokens";
import { Pill } from "./_primitives";

export function PageHeader({
  stripeAccount,
  fx,
}: {
  stripeAccount: StripeAccountInfo;
  fx: FxPreview;
}) {
  const [verifying, startVerify] = useTransition();
  const t = useT();
  return (
    <header style={{ marginBottom: 22 }}>
      <p
        style={{
          fontFamily: F,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: HQ.inkMuted,
          margin: "0 0 4px",
        }}
      >
        {t("dashboard.platform.pricing.eyebrow")}
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <h1
          style={{
            fontFamily: FD,
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: -0.4,
            color: HQ.ink,
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          {t("dashboard.platform.pricing.title")}
        </h1>
        <p
          style={{
            fontFamily: F,
            fontSize: 12.5,
            color: HQ.inkDim,
            margin: 0,
            lineHeight: 1.5,
            flex: 1,
            minWidth: 220,
          }}
        >
          {t("dashboard.platform.pricing.subtitle")}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 1fr) minmax(360px, 2fr)",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <StripeAccountChip
          info={stripeAccount}
          onVerify={() =>
            startVerify(async () => {
              await verifyStripeAccount();
            })
          }
          verifying={verifying}
        />
        <FxStrip fx={fx} />
      </div>
    </header>
  );
}

function StripeAccountChip({
  info,
  onVerify,
  verifying,
}: {
  info: StripeAccountInfo;
  onVerify: () => void;
  verifying: boolean;
}) {
  const t = useT();
  const ok = info.ok;
  const accent = ok
    ? info.chargesEnabled
      ? HQ.green
      : HQ.amber
    : HQ.red;
  // Heuristic warning: if the display name doesn't contain "tulala" we
  // surface a "looks wrong" hint. False positives are fine — better to
  // make the operator confirm than silently sync to the wrong account.
  const looksMisnamed =
    ok &&
    info.displayName &&
    !/tulala/i.test(info.displayName) &&
    !/tulala/i.test(info.businessName ?? "");

  return (
    <div
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        padding: "14px 16px",
        fontFamily: F,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: accent,
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: HQ.inkMuted,
          }}
        >
          {t("dashboard.platform.pricing.stripeAccount.label")}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onVerify}
          disabled={verifying}
          style={{
            background: "transparent",
            border: `1px solid ${HQ.borderHover}`,
            color: HQ.inkMuted,
            fontFamily: F,
            fontSize: 11,
            padding: "4px 9px",
            borderRadius: 6,
            cursor: verifying ? "wait" : "pointer",
            letterSpacing: 0.3,
          }}
        >
          {verifying
            ? t("dashboard.platform.pricing.stripeAccount.verifying")
            : t("dashboard.platform.pricing.stripeAccount.reverify")}
        </button>
      </div>

      {ok ? (
        <>
          <div style={{ fontSize: 14, color: HQ.ink, fontWeight: 500 }}>
            {info.displayName ??
              info.businessName ??
              t("dashboard.platform.pricing.stripeAccount.noDisplayName")}
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <code
              style={{
                fontSize: 11,
                color: HQ.inkMuted,
                background: HQ.cardSoft,
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              {info.accountId}
            </code>
            <Pill color={info.testMode ? HQ.amber : HQ.green}>
              {info.testMode
                ? t("dashboard.platform.pricing.stripeAccount.testMode")
                : t("dashboard.platform.pricing.stripeAccount.liveMode")}
            </Pill>
            {info.country && (
              <span style={{ fontSize: 11.5, color: HQ.inkMuted }}>
                {info.country}
              </span>
            )}
            <Pill color={info.chargesEnabled ? HQ.green : HQ.red}>
              {info.chargesEnabled
                ? t("dashboard.platform.pricing.stripeAccount.chargesOk")
                : t("dashboard.platform.pricing.stripeAccount.chargesOff")}
            </Pill>
          </div>
          {looksMisnamed && (
            <div
              style={{
                fontSize: 11.5,
                color: HQ.amber,
                lineHeight: 1.4,
                marginTop: 2,
              }}
            >
              ⚠{" "}
              {interpolate(
                t("dashboard.platform.pricing.stripeAccount.misnamed"),
                { accountId: info.accountId },
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ fontSize: 13.5, color: HQ.red }}>
            {info.reason === "no-key"
              ? t("dashboard.platform.pricing.stripeAccount.noKey")
              : info.error}
          </div>
          <div style={{ fontSize: 11.5, color: HQ.inkDim, lineHeight: 1.4 }}>
            {t("dashboard.platform.pricing.stripeAccount.dbOnlyHint")}
          </div>
        </>
      )}
    </div>
  );
}

function FxStrip({ fx }: { fx: FxPreview }) {
  const t = useT();
  const headlineUsd = 49; // visual reference — Studio monthly
  return (
    <div
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        padding: "14px 16px",
        fontFamily: F,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: HQ.inkMuted,
          }}
        >
          {interpolate(t("dashboard.platform.pricing.fx.header"), {
            amount: headlineUsd,
          })}
        </span>
        <span style={{ flex: 1 }} />
        {fx.ok && (
          <span style={{ fontSize: 10.5, color: HQ.inkDim }}>
            {interpolate(t("dashboard.platform.pricing.fx.ratesSource"), {
              date: fx.rateDate,
            })}
          </span>
        )}
      </div>

      {fx.ok ? (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {Object.entries(fx.rates).map(([code, rate]) => (
            <FxChip
              key={code}
              code={code}
              amount={formatUnitAmount(
                Math.round(headlineUsd * rate * 100),
                code,
              )}
            />
          ))}
          {ECB_UNCOVERED_CURRENCIES.map((code) => (
            <FxChip
              key={code}
              code={code}
              amount="—"
              tooltip={t("dashboard.platform.pricing.fx.uncoveredTooltip")}
            />
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: HQ.red }}>
          {interpolate(t("dashboard.platform.pricing.fx.unreachable"), {
            error: fx.error,
          })}
        </div>
      )}
    </div>
  );
}

function FxChip({
  code,
  amount,
  tooltip,
}: {
  code: string;
  amount: string;
  tooltip?: string;
}) {
  return (
    <div
      title={tooltip}
      style={{
        background: HQ.cardSoft,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 8,
        padding: "6px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        minWidth: 76,
        cursor: tooltip ? "help" : "default",
      }}
    >
      <span
        style={{
          fontSize: 9.5,
          color: HQ.inkDim,
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {code}
      </span>
      <span
        style={{
          fontSize: 13,
          color: HQ.ink,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {amount}
      </span>
    </div>
  );
}
