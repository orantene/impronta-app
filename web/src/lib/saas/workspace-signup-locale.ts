/**
 * TUL-117 · the language a new workspace is born in.
 *
 * The /start flow knows the language the person built the workspace in. That
 * language becomes the tenant's `default_locale` (the dashboard seed and the
 * unprefixed public URL grammar both follow it), and the tenant supports both
 * platform languages with the flow language first, so the second one is a
 * switch away instead of a settings trip. `agencies.supported_locales` mirrors
 * the same list so the two columns never disagree.
 *
 * Returns null for any locale the flow cannot name (legacy /get-started
 * provisioning, a request locale such as `fr`): the caller then keeps today's
 * behavior, a default-English tenant.
 */

export type WorkspaceFlowLocale = "en" | "es";

export type WorkspaceLocaleSettings = {
  defaultLocale: WorkspaceFlowLocale;
  supportedLocales: WorkspaceFlowLocale[];
};

export function workspaceLocaleSettingsForFlow(
  locale: string | null | undefined,
): WorkspaceLocaleSettings | null {
  if (locale === "es") return { defaultLocale: "es", supportedLocales: ["es", "en"] };
  if (locale === "en") return { defaultLocale: "en", supportedLocales: ["en", "es"] };
  return null;
}
