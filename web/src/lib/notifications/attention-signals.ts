/**
 * TUL-392 (Notifications 6/6) — talent Attention signals that are states, not
 * `user_notifications` rows: a theme update waiting (`talent_site_theme_updates`
 * state `available`) and a site that needs publishing (draft ahead of live, or
 * never published). They fold into the Attention count and render as derived
 * bell items.
 *
 * Pure + client-safe. The ids carry the state they describe (design + version,
 * draft rev), so a locally "read" signal comes back once that state changes.
 */

import { themeUpdateCopy } from "@/lib/talent-site/theme-releases/manager/notify";

export type TalentAttentionSignalKind = "theme-update" | "site-publish";

export type TalentAttentionSignal = {
  id: string;
  kind: TalentAttentionSignalKind;
  /** `NOTIFICATION_PAGE_TARGETS` key the bell resolves to a page. */
  targetDrawer: TalentAttentionSignalKind;
  title: { en: string; es: string };
  body: { en: string; es: string };
};

export type OpenThemeUpdate = {
  designSlug: string;
  designTitle: string;
  toVersion: number;
};

export type TalentAttentionSignalInput = {
  themeUpdates: ReadonlyArray<OpenThemeUpdate>;
  /** Null when there is nothing to publish (or no site yet). */
  sitePublish: { draftRev: number; firstPublish: boolean } | null;
};

const OPEN_CHANNELS = new Set(["optin", "default"]);

/**
 * One open update per design (newest version), mirroring the notice rules in
 * `loadTalentUpdateNotices`: the release is published on an open channel and
 * newer than the site's pin.
 */
export function pickOpenThemeUpdates(
  releases: ReadonlyArray<{
    design_slug: string;
    to_version: number;
    channel: string;
    status: string;
  }>,
  pinnedVersion: number | null,
  titles: ReadonlyMap<string, string>,
): OpenThemeUpdate[] {
  const newest = new Map<string, number>();
  for (const r of releases) {
    if (r.status !== "published" || !OPEN_CHANNELS.has(r.channel)) continue;
    if (pinnedVersion !== null && r.to_version <= pinnedVersion) continue;
    const prev = newest.get(r.design_slug);
    if (prev === undefined || r.to_version > prev) newest.set(r.design_slug, r.to_version);
  }
  return [...newest.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([designSlug, toVersion]) => ({
      designSlug,
      designTitle: titles.get(designSlug)?.trim() || designSlug,
      toVersion,
    }));
}

const SITE_PUBLISH_COPY = {
  first: {
    title: { en: "Your site is not live yet", es: "Tu sitio aún no está publicado" },
    body: {
      en: "Publish it so clients can find you and book.",
      es: "Publícalo para que tus clientes te encuentren y reserven.",
    },
  },
  changes: {
    title: { en: "Your site has unpublished changes", es: "Tu sitio tiene cambios sin publicar" },
    body: {
      en: "Publish them so your live site shows the latest version.",
      es: "Publícalos para que tu sitio en vivo muestre la última versión.",
    },
  },
} as const;

export function buildTalentAttentionSignals(
  input: TalentAttentionSignalInput,
): TalentAttentionSignal[] {
  const out: TalentAttentionSignal[] = input.themeUpdates.map((u) => {
    const en = themeUpdateCopy(u.designTitle, "en");
    const es = themeUpdateCopy(u.designTitle, "es");
    return {
      id: `theme-update:${u.designSlug}:${u.toVersion}`,
      kind: "theme-update",
      targetDrawer: "theme-update",
      title: { en: en.title, es: es.title },
      body: { en: en.body, es: es.body },
    };
  });
  if (input.sitePublish) {
    const copy = input.sitePublish.firstPublish ? SITE_PUBLISH_COPY.first : SITE_PUBLISH_COPY.changes;
    out.push({
      id: `site-publish:${input.sitePublish.draftRev}`,
      kind: "site-publish",
      targetDrawer: "site-publish",
      title: { ...copy.title },
      body: { ...copy.body },
    });
  }
  return out;
}

export function pickSignalText(text: { en: string; es: string }, locale: string): string {
  return locale.toLowerCase().startsWith("es") ? text.es : text.en;
}
