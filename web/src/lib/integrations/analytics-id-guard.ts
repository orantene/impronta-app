import { getIntegrationDef } from "@/lib/integrations/catalog";

/**
 * Render-time safety net for analytics identifiers that get interpolated RAW
 * into `dangerouslySetInnerHTML` <script> bodies. Even though the writer path
 * (saveIntegrationConfig) validates against the catalog test(), a future
 * unvalidated writer to config_json — or the platform env fallback — must never
 * be able to inject a character that breaks out of the JS string literal.
 *
 * Two independent gates, both must pass or the value is DROPPED (→ null):
 *   1. A conservative whitelist: only [A-Za-z0-9-] (covers G-XXXX, GTM-XXXX,
 *      numeric pixel/partner ids, alphanumeric TikTok ids). No quotes, no
 *      backslashes, no whitespace, no newlines, no template-literal `${`.
 *   2. The catalog's own offline test() for the integration+field, when one
 *      exists — re-run here so a malformed-but-whitelist-passing value (e.g. a
 *      bare number where a G- prefix is required) is also dropped.
 *
 * This module has NO server-only / browser-only imports so it can run in both
 * the resolver (server) and the analytics Server Component.
 */

/** Conservative character whitelist — the only shape any analytics id may take. */
const SAFE_ID = /^[A-Za-z0-9-]+$/;

/**
 * Validate one analytics id against the whitelist AND (when supplied) the
 * catalog field test for `integrationKey`/`fieldName`. Returns the trimmed value
 * when both pass, else null.
 */
export function sanitizeAnalyticsId(
  value: string | null | undefined,
  integrationKey?: string,
  fieldName?: string,
): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (!SAFE_ID.test(v)) return null;

  if (integrationKey && fieldName) {
    const def = getIntegrationDef(integrationKey);
    const field = def?.fields.find((f) => f.name === fieldName);
    if (field?.test) {
      const result = field.test(v);
      if (!result.ok) return null;
    }
  }

  return v;
}
