/**
 * Env gate for the Support → Notion mirror. Missing secrets soft-disable the
 * cron (Desk keeps working). Never log token values.
 */

export type NotionMirrorConfig = {
  apiKey: string;
  databaseId: string;
};

/** Loose env bag so unit tests can pass partial objects without NODE_ENV. */
export type NotionMirrorEnv = Readonly<Record<string, string | undefined>>;

export function readNotionMirrorConfig(env: NotionMirrorEnv = process.env): {
  configured: boolean;
  config: NotionMirrorConfig | null;
  missing: string[];
} {
  const apiKey = env.NOTION_API_KEY?.trim() || "";
  const databaseId = env.NOTION_SUPPORT_DATABASE_ID?.trim() || "";
  const missing: string[] = [];
  if (!apiKey) missing.push("NOTION_API_KEY");
  if (!databaseId) missing.push("NOTION_SUPPORT_DATABASE_ID");
  if (missing.length > 0) {
    return { configured: false, config: null, missing };
  }
  return {
    configured: true,
    config: { apiKey, databaseId },
    missing: [],
  };
}

/** Same truthy set as other feature flags in this repo. */
export function isNotionMirrorForceDisabled(
  env: NotionMirrorEnv = process.env,
): boolean {
  const v = (env.NOTION_MIRROR_ENABLED ?? "1").trim().toLowerCase();
  return v === "0" || v === "false" || v === "off" || v === "no";
}
