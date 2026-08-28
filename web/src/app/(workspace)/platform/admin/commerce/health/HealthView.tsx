/**
 * HealthView — the Health tab of Commerce: "is our Stripe wiring correct?"
 *
 * Adapted from the standalone /platform/admin/stripe-health page it replaces.
 * Two things changed on the way in:
 *   1. The chrome is translated (title, intro, status words, check labels,
 *      re-run, checked-at). The per-check `detail` sentences are still English:
 *      they are composed inside `stripe-health.ts` as finished prose, and
 *      turning them into key+params is a separate refactor — see the
 *      TODO(i18n) on `HealthCheck.detail`.
 *   2. Re-running is a button (`router.refresh()`) rather than a page reload
 *      instruction, since the tab now lives inside a Suspense boundary that can
 *      re-stream on its own.
 *
 * Read-only and fail-soft: a check that cannot run reports "unknown" rather
 * than blanking the panel.
 */

import type { HealthStatus, StripeHealth } from "@/lib/pricing/stripe-health";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { HQ, F, FD } from "../_tokens";
import { RerunButton } from "./RerunButton";

const DOT: Record<HealthStatus, string> = {
  ok: "#3FB950",
  warn: "#D29922",
  fail: "#F85149",
  unknown: "rgba(245,242,235,0.35)",
};

const STATUS_KEY: Record<HealthStatus, string> = {
  ok: "dashboard.platform.commerce.health.status.ok",
  warn: "dashboard.platform.commerce.health.status.warn",
  fail: "dashboard.platform.commerce.health.status.fail",
  unknown: "dashboard.platform.commerce.health.status.unknown",
};

/** Check ids are stable in `stripe-health.ts`; the English `label` is fallback. */
const CHECK_LABEL_KEY: Record<string, string> = {
  account: "dashboard.platform.commerce.health.checks.account",
  prices: "dashboard.platform.commerce.health.checks.prices",
  webhooks: "dashboard.platform.commerce.health.checks.webhooks",
  connect: "dashboard.platform.commerce.health.checks.connect",
};

function worstOf(health: StripeHealth): HealthStatus {
  if (health.checks.some((c) => c.status === "fail")) return "fail";
  if (health.checks.some((c) => c.status === "warn")) return "warn";
  if (health.checks.some((c) => c.status === "unknown")) return "unknown";
  return "ok";
}

export async function HealthView({ health }: { health: StripeHealth }) {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const worst = worstOf(health);

  return (
    <div style={{ fontFamily: F, color: HQ.ink, maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: DOT[worst],
            display: "inline-block",
          }}
        />
        <h2 style={{ fontFamily: FD, fontSize: 18, fontWeight: 600, margin: 0 }}>
          {t("dashboard.platform.commerce.health.title")}
        </h2>
        <span style={{ flex: 1 }} />
        <RerunButton label={t("dashboard.platform.commerce.health.rerun")} />
      </div>

      <p
        style={{
          color: HQ.inkMuted,
          fontSize: 13,
          lineHeight: 1.6,
          marginTop: 8,
        }}
      >
        {t("dashboard.platform.commerce.health.intro")}
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginTop: 20,
        }}
      >
        {health.checks.map((check) => {
          const labelKey = CHECK_LABEL_KEY[check.id];
          const label = labelKey ? t(labelKey) : check.label;
          return (
            <section
              key={check.id}
              style={{
                background: HQ.card,
                border: `1px solid ${HQ.border}`,
                borderRadius: 12,
                padding: "14px 16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: DOT[check.status],
                    display: "inline-block",
                  }}
                />
                <h3
                  style={{
                    fontFamily: FD,
                    fontSize: 14,
                    fontWeight: 600,
                    margin: 0,
                  }}
                >
                  {label}
                </h3>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    color: DOT[check.status],
                  }}
                >
                  {t(STATUS_KEY[check.status])}
                </span>
              </div>
              <p
                style={{
                  color: HQ.inkMuted,
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  margin: "6px 0 0",
                }}
              >
                {check.detail}
              </p>
              {check.items && check.items.length > 0 && (
                <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
                  {check.items.map((item, index) => (
                    <li
                      key={`${check.id}-${index}-${item.name}`}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "baseline",
                        fontSize: 12,
                        padding: "3px 0",
                        color: HQ.inkMuted,
                      }}
                    >
                      <span aria-hidden style={{ color: DOT[item.status] }}>
                        •
                      </span>
                      <span style={{ color: HQ.ink, minWidth: 190 }}>
                        {item.name}
                      </span>
                      <span>{item.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <p style={{ color: HQ.inkDim, fontSize: 11, marginTop: 16 }}>
        {interpolate(t("dashboard.platform.commerce.health.checkedAt"), {
          when: new Date(health.fetchedAt).toLocaleString(locale),
        })}
      </p>
    </div>
  );
}
