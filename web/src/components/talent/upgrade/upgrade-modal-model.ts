/**
 * TUL-829 · In-app upgrade modal model (pure, client-safe, no React).
 *
 * Every talent paywall (locked Apps, custom domain, builder sections, premium
 * templates, embeds, press, media kit, SEO) opens ONE modal through
 * `openUpgrade({ feature, from })` instead of bouncing the talent to Settings
 * or a compare drawer. This module owns everything the modal shows that is
 * not markup: which plan unlocks the feature, its catalog price for the
 * chosen interval, the benefits list, the ES/EN copy, and the href the single
 * primary button goes to.
 *
 * PRICES ARE READ, NEVER COMPUTED. Monthly and yearly amounts come straight
 * from `PLAN_CATALOG` (the same source the compare drawer prints). The catalog
 * prices talent plans in USD only, so the modal shows USD and no converted
 * MXN figure: a converted price would be price math nobody bills against.
 *
 * CHECKOUT IS NOT HERE. `buildUpgradeCheckoutHref` is the mock entry point
 * (`/pricing?plan=&interval=&from=`) until TUL-830 ships a real talent
 * checkout; `start-upgrade-checkout.ts` is the one adapter it will swap.
 */

import { PLAN_CATALOG, type PlanKey } from "@/lib/access/plan-catalog";
import {
  TALENT_PAID_TIER_LABEL,
  TALENT_PAID_TIER_LABEL_ES,
} from "@/lib/access/talent-tier-label";

export type UpgradeLocale = "es" | "en";
export type UpgradeInterval = "m" | "y";

/** Paywalled talent features the modal knows how to frame. */
export const UPGRADE_FEATURES = [
  "apps",
  "custom-domain",
  "extra-sections",
  "template-picker",
  "media-embeds",
  "press-band",
  "media-kit",
  "seo-controls",
  "generic",
] as const;
export type UpgradeFeature = (typeof UPGRADE_FEATURES)[number];

export type UpgradeRequest = {
  feature: UpgradeFeature;
  /** Surface that opened the modal (analytics + `from` query param). */
  from: string;
};

/** The one paid talent plan (Pro fold 2026-09-23: Web Office). */
export const TALENT_UPGRADE_PLAN_KEY: PlanKey = "talent_portfolio";

export function normalizeUpgradeLocale(locale: string | null | undefined): UpgradeLocale {
  return (locale ?? "").toLowerCase().startsWith("es") ? "es" : "en";
}

export function isUpgradeFeature(value: unknown): value is UpgradeFeature {
  return typeof value === "string" && (UPGRADE_FEATURES as readonly string[]).includes(value);
}

/** Which plan unlocks a feature. Every talent paywall today is Web Office. */
export function planForFeature(_feature: UpgradeFeature): PlanKey {
  return TALENT_UPGRADE_PLAN_KEY;
}

const FEATURE_COPY: Record<UpgradeFeature, Record<UpgradeLocale, string>> = {
  apps: { es: "Apps premium", en: "Premium apps" },
  "custom-domain": { es: "Tu propio dominio", en: "Your own domain" },
  "extra-sections": { es: "Constructor de varias secciones", en: "Multi-section page builder" },
  "template-picker": { es: "Todas las plantillas", en: "Every template" },
  "media-embeds": { es: "Videos y redes en tu página", en: "Video and social embeds" },
  "press-band": { es: "Banda de prensa", en: "Press band" },
  "media-kit": { es: "Media kit con tu marca", en: "Branded media kit" },
  "seo-controls": { es: "Controles de SEO", en: "SEO controls" },
  generic: { es: "Todo Oficina Web", en: "All of Web Office" },
};

const BENEFITS: Record<UpgradeLocale, readonly string[]> = {
  es: [
    "Tu propio dominio (tunombre.com)",
    "Constructor de página con varias secciones",
    "Todas las plantillas y apps premium",
    "Videos, redes y banda de prensa",
    "La comisión más baja en reservas directas",
  ],
  en: [
    "Your own domain (yourname.com)",
    "Multi-section page builder",
    "Every template and premium app",
    "Video, social embeds and a press band",
    "The lowest fee on direct bookings",
  ],
};

const UI_COPY = {
  es: {
    title: "{feature} es parte de {plan}",
    subtitle: "Mejora tu plan y úsalo ahora mismo. Sin salir de aquí.",
    monthly: "Mensual",
    yearly: "Anual",
    perMonth: "/ mes",
    perYear: "/ año",
    cta: "Mejorar a {plan}",
    notNow: "Ahora no",
    compareAll: "Ver todos los planes",
    close: "Cerrar",
    intervalLabel: "Frecuencia de pago",
    benefitsLabel: "Lo que incluye",
  },
  en: {
    title: "{feature} is part of {plan}",
    subtitle: "Upgrade and use it right away, without leaving this page.",
    monthly: "Monthly",
    yearly: "Yearly",
    perMonth: "/ mo",
    perYear: "/ yr",
    cta: "Upgrade to {plan}",
    notNow: "Not now",
    compareAll: "Compare all plans",
    close: "Close",
    intervalLabel: "Billing interval",
    benefitsLabel: "What you get",
  },
} as const;

export type UpgradeOfferView = {
  planKey: PlanKey;
  planLabel: string;
  title: string;
  subtitle: string;
  featureLabel: string;
  benefits: readonly string[];
  /** Formatted catalog price for the selected interval, or null when unpriced. */
  priceLabel: string | null;
  periodLabel: string;
  monthlyLabel: string;
  yearlyLabel: string;
  intervalLabel: string;
  benefitsLabel: string;
  ctaLabel: string;
  notNowLabel: string;
  compareAllLabel: string;
  closeLabel: string;
  /** False when the catalog has no yearly price; the toggle hides. */
  hasYearly: boolean;
};

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? "");
}

/** Formats catalog cents as a currency label. Formatting only, no math on the amount. */
export function formatCatalogPrice(
  cents: number | null | undefined,
  currency: string,
  locale: UpgradeLocale,
): string | null {
  if (typeof cents !== "number" || !Number.isFinite(cents) || cents <= 0) return null;
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

export function buildUpgradeOffer(input: {
  feature: UpgradeFeature;
  interval: UpgradeInterval;
  locale: UpgradeLocale;
  /** Server-resolved plan label, when the caller has one. */
  planLabel?: string | null;
}): UpgradeOfferView {
  const { feature, locale } = input;
  const planKey = planForFeature(feature);
  const plan = PLAN_CATALOG[planKey];
  const hasYearly = typeof plan.annualPriceCents === "number" && plan.annualPriceCents > 0;
  const interval: UpgradeInterval = input.interval === "y" && hasYearly ? "y" : "m";
  const planLabel =
    input.planLabel?.trim() || (locale === "es" ? TALENT_PAID_TIER_LABEL_ES : TALENT_PAID_TIER_LABEL);
  const ui = UI_COPY[locale];
  const featureLabel = FEATURE_COPY[feature][locale];
  return {
    planKey,
    planLabel,
    title: fill(ui.title, { feature: featureLabel, plan: planLabel }),
    subtitle: ui.subtitle,
    featureLabel,
    benefits: BENEFITS[locale],
    priceLabel: formatCatalogPrice(
      interval === "y" ? plan.annualPriceCents : plan.monthlyPriceCents,
      plan.currency,
      locale,
    ),
    periodLabel: interval === "y" ? ui.perYear : ui.perMonth,
    monthlyLabel: ui.monthly,
    yearlyLabel: ui.yearly,
    intervalLabel: ui.intervalLabel,
    benefitsLabel: ui.benefitsLabel,
    ctaLabel: fill(ui.cta, { plan: planLabel }),
    notNowLabel: ui.notNow,
    compareAllLabel: ui.compareAll,
    closeLabel: ui.close,
    hasYearly,
  };
}

/**
 * The mock checkout entry point until TUL-830: the pricing page, carrying the
 * plan, interval and paywall that sent the talent there.
 */
export function buildUpgradeCheckoutHref(input: {
  planKey: PlanKey;
  interval: UpgradeInterval;
  from: string;
}): string {
  const params = new URLSearchParams({
    plan: input.planKey,
    interval: input.interval,
    from: input.from || "unknown",
  });
  return `/pricing?${params.toString()}`;
}
