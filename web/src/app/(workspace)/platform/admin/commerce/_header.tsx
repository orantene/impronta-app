/**
 * _header.tsx — Commerce title + tab strip.
 *
 * Server component on purpose: the strip is plain `<Link>` chips over `?tab=`,
 * so it paints in the first byte of the response and stays interactive while
 * the tab body streams in behind a Suspense boundary. That matters most on the
 * Health tab, which pings Stripe live and can take seconds.
 *
 * The underline chip styling is the HQ house style lifted from the old
 * PricingDashboard tab strip, converted from a <button> to an <a>.
 */

import Link from "next/link";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { HQ, F, FD } from "./_tokens";
import { COMMERCE_TABS, commerceTabHref, type CommerceTab } from "./_registry";

export async function CommerceHeader({ activeTab }: { activeTab: CommerceTab }) {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  return (
    <header style={{ marginBottom: 20 }}>
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
        {t("dashboard.platform.commerce.eyebrow")}
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
          {t("dashboard.platform.commerce.title")}
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
          {t("dashboard.platform.commerce.subtitle")}
        </p>
      </div>

      <nav
        aria-label={t("dashboard.platform.commerce.tabsAriaLabel")}
        style={{
          display: "flex",
          gap: 2,
          borderBottom: `1px solid ${HQ.border}`,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        {COMMERCE_TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <Link
              key={tab.id}
              href={commerceTabHref(tab.id)}
              aria-current={active ? "page" : undefined}
              style={{
                padding: "10px 14px",
                fontFamily: F,
                fontSize: 13.5,
                fontWeight: active ? 600 : 400,
                color: active ? HQ.ink : HQ.inkMuted,
                textDecoration: "none",
                borderBottom: active
                  ? `2px solid ${HQ.ink}`
                  : "2px solid transparent",
                marginBottom: -1,
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              {t(tab.labelKey)}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
