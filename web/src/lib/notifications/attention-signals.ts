/**
 * TUL-392 (Notifications 6/6) — talent Attention signals that are states, not
 * `user_notifications` rows: a site that needs publishing (draft ahead of live,
 * or never published). It folds into the Attention count and renders as a
 * derived bell item.
 *
 * Pure + client-safe. The id carries the state it describes (draft rev), so a
 * locally "read" signal comes back once that state changes.
 */

export type TalentAttentionSignalKind = "site-publish";

export type TalentAttentionSignal = {
  id: string;
  kind: TalentAttentionSignalKind;
  /** `NOTIFICATION_PAGE_TARGETS` key the bell resolves to a page. */
  targetDrawer: TalentAttentionSignalKind;
  title: { en: string; es: string };
  body: { en: string; es: string };
};

export type TalentAttentionSignalInput = {
  /** Null when there is nothing to publish (or no site yet). */
  sitePublish: { draftRev: number; firstPublish: boolean } | null;
};

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
  if (!input.sitePublish) return [];
  const copy = input.sitePublish.firstPublish ? SITE_PUBLISH_COPY.first : SITE_PUBLISH_COPY.changes;
  return [
    {
      id: `site-publish:${input.sitePublish.draftRev}`,
      kind: "site-publish",
      targetDrawer: "site-publish",
      title: { ...copy.title },
      body: { ...copy.body },
    },
  ];
}

export function pickSignalText(text: { en: string; es: string }, locale: string): string {
  return locale.toLowerCase().startsWith("es") ? text.es : text.en;
}
