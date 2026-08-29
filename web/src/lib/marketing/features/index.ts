/**
 * The feature hub catalogue.
 *
 * ONE source for the grid, the popups, the landing pages, the nav, the sitemap
 * and the cross-links. A feature added here appears everywhere at once, which
 * is the only way a popup can be guaranteed to agree with the page behind it.
 *
 * Split into stage modules so the content stays under the file-size rule as
 * pages get their long form.
 */

import { APPOINTMENTS_FEATURE } from "./feature-appointments";
import { QR_ENGINE_FEATURE } from "./feature-qr-engine";
import { TABLES_FEATURE } from "./feature-tables";
import { TICKETING_FEATURE } from "./feature-ticketing";
import { WEBSITE_BUILDER_FEATURE } from "./feature-website-builder";
import { BOOKED_FEATURES } from "./features-booked";
import { FOUND_FEATURES } from "./features-found";
import { PAID_FEATURES } from "./features-paid";
import { PRESENCE_FEATURES } from "./features-presence";
import { RUN_FEATURES } from "./features-run";
import { FEATURE_GROUP_ORDER, type Feature, type FeatureContent, type FeatureGroup, type FeatureKey } from "./types";

export type {
  Feature,
  FeatureContent,
  FeatureFaq,
  FeatureGroup,
  FeatureKey,
  FeatureSection,
  Para,
} from "./types";
export { FEATURE_GROUP_ORDER } from "./types";

/**
 * Ordered by plate number, which is the lifecycle order the story depends on.
 *
 * The five Tier S pages carry long-form content and live in their own modules
 * so no single file approaches the size cap as they grow. The rest travel in
 * their stage groups.
 */
export const MARKETING_FEATURES: Feature[] = [
  ...PRESENCE_FEATURES,
  ...FOUND_FEATURES,
  ...BOOKED_FEATURES,
  ...PAID_FEATURES,
  ...RUN_FEATURES,
  APPOINTMENTS_FEATURE,
  QR_ENGINE_FEATURE,
  TABLES_FEATURE,
  TICKETING_FEATURE,
  WEBSITE_BUILDER_FEATURE,
].sort((a, b) => a.plate - b.plate);

export function getFeatureByKey(key: string): Feature | undefined {
  return MARKETING_FEATURES.find((f) => f.key === key);
}

export function getFeatureBySlugEn(slug: string): Feature | undefined {
  return MARKETING_FEATURES.find((f) => f.slugEn === slug);
}

export function getFeatureBySlugEs(slug: string): Feature | undefined {
  return MARKETING_FEATURES.find((f) => f.slugEs === slug);
}

export function getFeatureContent(feature: Feature, locale: string): FeatureContent {
  return locale === "es" ? feature.es : feature.en;
}

/**
 * The unprefixed path pair for a feature.
 *
 * Spanish pages live at a Spanish slug rather than a locale prefix over the
 * English one, because the search terms that matter are Spanish. The locale
 * prefix is applied by the caller through `withLocaleHref` / `withLocalePath`.
 */
export function featurePaths(feature: Feature): { enPath: string; esPath: string } {
  return {
    enPath: `/features/${feature.slugEn}`,
    esPath: `/funciones/${feature.slugEs}`,
  };
}

/** The unprefixed path for the locale being rendered. */
export function featurePathForLocale(feature: Feature, locale: string): string {
  const { enPath, esPath } = featurePaths(feature);
  return locale === "es" ? esPath : enPath;
}

export const FEATURE_HUB_PATHS = { enPath: "/features", esPath: "/funciones" } as const;

export function featureHubPathForLocale(locale: string): string {
  return locale === "es" ? FEATURE_HUB_PATHS.esPath : FEATURE_HUB_PATHS.enPath;
}

export function featuresInGroup(group: FeatureGroup): Feature[] {
  return MARKETING_FEATURES.filter((f) => f.group === group);
}

/** Stage headings. The wording is the pitch, so it is authored, not derived. */
export const FEATURE_GROUP_LABELS: Record<FeatureGroup, { en: string; es: string }> = {
  presence: { en: "Build your presence", es: "Construye tu presencia" },
  found: { en: "Get found", es: "Que te encuentren" },
  booked: { en: "Get booked", es: "Que te reserven" },
  paid: { en: "Get paid", es: "Cobra" },
  run: { en: "Run and grow", es: "Opera y crece" },
};

export function featureGroupLabel(group: FeatureGroup, locale: string): string {
  const label = FEATURE_GROUP_LABELS[group];
  return locale === "es" ? label.es : label.en;
}

/**
 * The homepage split the owner specified: plates 01 to 12 in the first
 * section, 13 to 21 in the second, with Premium Support pinned to BOTH so the
 * human-support promise bookends the page.
 */
export const HOME_SECTION_ONE_PLATES = { from: 1, to: 12 } as const;
export const HOME_SECTION_TWO_PLATES = { from: 13, to: 21 } as const;

export function featuresForHomeSection(section: "one" | "two"): Feature[] {
  const range = section === "one" ? HOME_SECTION_ONE_PLATES : HOME_SECTION_TWO_PLATES;
  const inRange = MARKETING_FEATURES.filter(
    (f) => f.plate >= range.from && f.plate <= range.to,
  );
  if (section === "two") return inRange;

  // Premium Support closes the first section too. It is the same plate, shown
  // twice on purpose: it is the promise behind everything above it.
  const support = getFeatureByKey("premium-support");
  return support ? [...inRange, support] : inRange;
}

/** Ordered groups, for the nav mega panel and the docs sidebar. */
export function featureGroupsInOrder(): { group: FeatureGroup; features: Feature[] }[] {
  return FEATURE_GROUP_ORDER.map((group) => ({ group, features: featuresInGroup(group) }));
}

// ─── Client payloads ─────────────────────────────────────────────────────────

/**
 * The grid and the popup are client components, and the full catalogue is far
 * more content than either needs. These payloads are the resolved, single
 * locale slices that actually cross into the browser bundle, so a page ships
 * the words it shows rather than all twenty one pages in two languages.
 */

export type FeaturePlatePayload = {
  key: FeatureKey;
  plate: number;
  group: FeatureGroup;
  stage: string;
  name: string;
  promise: string;
  /** Unprefixed. The renderer localises it. */
  path: string;
  status: Feature["status"];
};

export type FeaturePopupPayload = FeaturePlatePayload & {
  body: import("./types").Para[];
  /** Numbered chips at the foot of the popup. Keeps the reader moving. */
  related: { key: FeatureKey; plate: number; name: string }[];
};

export function toPlatePayload(feature: Feature, locale: string): FeaturePlatePayload {
  const c = getFeatureContent(feature, locale);
  return {
    key: feature.key,
    plate: feature.plate,
    group: feature.group,
    stage: featureGroupLabel(feature.group, locale),
    name: c.name,
    promise: c.promise,
    path: featurePathForLocale(feature, locale),
    status: feature.status,
  };
}

export function toPopupPayload(feature: Feature, locale: string): FeaturePopupPayload {
  const related = feature.related
    .map((key) => getFeatureByKey(key))
    .filter((f): f is Feature => Boolean(f))
    .map((f) => ({ key: f.key, plate: f.plate, name: getFeatureContent(f, locale).name }));
  return {
    ...toPlatePayload(feature, locale),
    body: getFeatureContent(feature, locale).popup,
    related,
  };
}

/**
 * Popups can be opened from anywhere on a page, including an inline link in a
 * paragraph, so every feature has to be reachable. The popup slice is small
 * enough that shipping all twenty one is cheaper than fetching one on click.
 */
export function allPopupPayloads(locale: string): FeaturePopupPayload[] {
  return MARKETING_FEATURES.map((f) => toPopupPayload(f, locale));
}
