/**
 * Expected production values for GET /api/health/flags.
 *
 * KEEP IN SYNC with the env flag matrix in:
 *   /cursor/stores/.../docs/plans/done-status/FEATURES.md
 *   (repo-local mirror note: FEATURES.md "Env flag matrix (production, verified)")
 *
 * Smoke (`post-deploy-smoke-test.mjs`) fails (exit 1) when a key is missing
 * from the live payload or its resolved value does not match.
 *
 * Do NOT flip SUPPORT_DESK or other flags from this file — expectations only.
 */

/** Maison cohort allow-list (TAL-QAFIXFREE + TAL-93900). From talent-maison-theme.ts. */
export const MAISON_COHORT_IDS = [
  "6d4e7d73-8577-42fb-b0d3-d2e55a64ca14",
  "c99f8adb-8ebb-4aad-911a-897e73efd369",
];

/**
 * @typedef {{
 *   resolved?: boolean | string | number | null,
 *   contains?: string[],
 *   envPresent?: boolean,
 * }} FlagExpectation
 */

/** @type {Record<string, FlagExpectation>} */
export const EXPECTED_PROD_FLAGS = {
  // ── Env matrix (FEATURES.md) ────────────────────────────────────────────
  TALENT_STUDIO_V2: { resolved: true, envPresent: true },
  TALENT_AGENDA_V2: { resolved: "all", envPresent: true },
  TALENT_FREE_WEBSITE_ENABLED: { resolved: true, envPresent: true },
  TALENT_THEME_GALLERY_ENABLED: { resolved: true, envPresent: true },
  TALENT_WEBSITE_SETTINGS_ENABLED: { resolved: "all", envPresent: true },
  TALENT_SITE_SUBDOMAINS_ENABLED: { resolved: true, envPresent: true },
  NEXT_PUBLIC_MESSAGES_V5: { resolved: true, envPresent: true },
  // Prod Vercel (2026-10-04): mode=all for every talent. Allow-list retained
  // unused while mode=all (legacy cohort ids still present in env).
  TALENT_MAISON_THEME_ENABLED: { resolved: "all", envPresent: true },
  TALENT_MAISON_THEME_TALENTS: { contains: MAISON_COHORT_IDS, envPresent: true },
  BUILDER_AUTO_THUMBNAIL_ENABLED: { resolved: true, envPresent: true },
  BUILDER_ROLLOUT_CRON_ENABLED: { resolved: true, envPresent: true },
  // Effective gated-media on (env + DB + signing secret).
  MEDIA_PRIVATE_ACCESS_ENABLED: { resolved: true, envPresent: true },
  REAP_SUPPORT_REPLAYS_ENABLED: { resolved: true, envPresent: true },
  // Env armed AND DB processing_mode=pass_through.
  COMMISSION_PROCESSING_PASS_THROUGH: { resolved: true, envPresent: true },
  // Intentionally OFF / unset in prod (batched-ask defaults).
  CLIENT_WELCOME_EMAIL_ENABLED: { resolved: false, envPresent: false },
  TALENT_SITE_CONSENT_TOOLING_ENABLED: { resolved: false, envPresent: false },
  SUPPORT_DESK_ENABLED: { resolved: true, envPresent: true },

  // ── DB settings named in FEATURES.md ────────────────────────────────────
  "settings.ai_talent_translate_enabled": { resolved: true },
  "settings.ai_master_enabled": { resolved: true },
  "platform_settings.workspace_fab_enabled": { resolved: true },
  "platform_settings.media_private_access_enabled": { resolved: true },
  "platform_commission_config.processing_mode": { resolved: "pass_through" },
  "platform_commission_config.pass_through_take_bps": { resolved: 150 },
};

/**
 * Compare one live flag row to its expectation.
 * @param {{ key: string, env: string | null, resolved: unknown }} live
 * @param {FlagExpectation} expected
 * @returns {string | null} error message, or null if ok
 */
export function mismatchReason(live, expected) {
  if (!live) return "missing from live payload";

  if (expected.envPresent === true && (live.env === null || live.env === "")) {
    return `env unset (expected present); resolved=${JSON.stringify(live.resolved)}`;
  }
  if (expected.envPresent === false && live.env !== null && String(live.env).trim() !== "") {
    return `env present (${JSON.stringify(live.env)}) but expected unset`;
  }

  if (expected.contains) {
    if (!Array.isArray(live.resolved)) {
      return `resolved not an array: ${JSON.stringify(live.resolved)}`;
    }
    const set = new Set(live.resolved.map(String));
    const missing = expected.contains.filter((id) => !set.has(id));
    if (missing.length) {
      return `allow-list missing ${missing.join(", ")}; got ${live.resolved.join(",") || "(empty)"}`;
    }
    return null;
  }

  if ("resolved" in expected) {
    if (live.resolved !== expected.resolved) {
      return `resolved=${JSON.stringify(live.resolved)}, expected ${JSON.stringify(expected.resolved)}`;
    }
  }
  return null;
}
