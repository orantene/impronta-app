/**
 * Live resolve of every feature flag used in production gating.
 *
 * Source of truth for the *expected* production matrix:
 *   - store FEATURES.md env matrix (docs/plans/done-status/FEATURES.md)
 *   - sibling smoke config: web/scripts/prod-flag-expectations.mjs
 *
 * This module reports what the deployed runtime actually sees (env + DB).
 * It does not flip any flags.
 */

import {
  readMaisonThemeMode,
  readMaisonThemeTalentAllowlist,
} from "@/lib/access/talent-maison-theme";
import { readWebsiteSettingsMode } from "@/lib/access/talent-website-settings";
import { resolvePrivateMediaAccess } from "@/lib/media/private-access";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isSupportDeskEnabled } from "@/lib/support/desk-flag";
import { readAgendaV2Mode } from "@/lib/talent-agenda/flag";
import { talentStudioV2Enabled } from "@/lib/talent/studio-flag";

/** Same truthy contract as builder-rollout-ramp's parseRolloutCronFlag. */
function parseTruthyFlag(envValue: string | undefined): boolean {
  const v = (envValue ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export type ProdGatingFlagSource = "env" | "db" | "env+db";

export type ProdGatingFlag = {
  /** Stable id for smoke / docs (env var name or `settings.*` / `platform_settings.*`). */
  key: string;
  source: ProdGatingFlagSource;
  /** Raw env string when the flag has an env half; null if unset. */
  env: string | null;
  /** DB value when the flag has a DB half; omitted for env-only. */
  db?: unknown;
  /**
   * Canonical comparable value for smoke:
   *   - boolean gates → resolved on/off
   *   - mode strings → "off" | "talents" | "all" | …
   *   - allow-lists → sorted string[]
   *   - numeric DB → number
   */
  resolved: boolean | string | number | string[] | null;
};

function envRaw(env: NodeJS.ProcessEnv, name: string): string | null {
  const v = env[name];
  if (v === undefined) return null;
  return v;
}

/**
 * Pure env half — unit-testable without Supabase. DB-backed rows are filled
 * by `resolveProdGatingFlags`.
 *
 * Studio / desk resolve through the canonical helpers (explicit env only —
 * never NODE_ENV defaults; see #2504).
 */
export function resolveEnvProdGatingFlags(
  env: NodeJS.ProcessEnv = process.env,
): ProdGatingFlag[] {
  const maisonAllow = [...readMaisonThemeTalentAllowlist(env.TALENT_MAISON_THEME_TALENTS)].sort();
  const freeRaw = env.TALENT_FREE_WEBSITE_ENABLED?.trim().toLowerCase();
  const galleryRaw = env.TALENT_THEME_GALLERY_ENABLED?.trim().toLowerCase();
  const mediaEnvRaw = env.MEDIA_PRIVATE_ACCESS_ENABLED?.trim().toLowerCase();
  const mediaEnvForcedOn = mediaEnvRaw === "1" || mediaEnvRaw === "true";

  return [
    {
      key: "TALENT_STUDIO_V2",
      source: "env",
      env: envRaw(env, "TALENT_STUDIO_V2"),
      resolved: talentStudioV2Enabled(env),
    },
    {
      key: "TALENT_AGENDA_V2",
      source: "env",
      env: envRaw(env, "TALENT_AGENDA_V2"),
      resolved: readAgendaV2Mode(env.TALENT_AGENDA_V2),
    },
    {
      key: "TALENT_FREE_WEBSITE_ENABLED",
      source: "env",
      env: envRaw(env, "TALENT_FREE_WEBSITE_ENABLED"),
      resolved: freeRaw === "true" || freeRaw === "1",
    },
    {
      key: "TALENT_THEME_GALLERY_ENABLED",
      source: "env",
      env: envRaw(env, "TALENT_THEME_GALLERY_ENABLED"),
      resolved: galleryRaw === "true" || galleryRaw === "1",
    },
    {
      key: "TALENT_WEBSITE_SETTINGS_ENABLED",
      source: "env",
      env: envRaw(env, "TALENT_WEBSITE_SETTINGS_ENABLED"),
      resolved: readWebsiteSettingsMode(env.TALENT_WEBSITE_SETTINGS_ENABLED),
    },
    {
      key: "TALENT_SITE_SUBDOMAINS_ENABLED",
      source: "env",
      env: envRaw(env, "TALENT_SITE_SUBDOMAINS_ENABLED"),
      resolved: env.TALENT_SITE_SUBDOMAINS_ENABLED === "true",
    },
    {
      key: "NEXT_PUBLIC_MESSAGES_V5",
      source: "env",
      env: envRaw(env, "NEXT_PUBLIC_MESSAGES_V5"),
      resolved: env.NEXT_PUBLIC_MESSAGES_V5 === "1",
    },
    {
      key: "TALENT_MAISON_THEME_ENABLED",
      source: "env",
      env: envRaw(env, "TALENT_MAISON_THEME_ENABLED"),
      resolved: readMaisonThemeMode(env.TALENT_MAISON_THEME_ENABLED),
    },
    {
      key: "TALENT_MAISON_THEME_TALENTS",
      source: "env",
      env: envRaw(env, "TALENT_MAISON_THEME_TALENTS"),
      resolved: maisonAllow,
    },
    {
      key: "BUILDER_AUTO_THUMBNAIL_ENABLED",
      source: "env",
      env: envRaw(env, "BUILDER_AUTO_THUMBNAIL_ENABLED"),
      resolved:
        env.BUILDER_AUTO_THUMBNAIL_ENABLED === "1" ||
        env.BUILDER_AUTO_THUMBNAIL_ENABLED === "true",
    },
    {
      key: "BUILDER_ROLLOUT_CRON_ENABLED",
      source: "env",
      env: envRaw(env, "BUILDER_ROLLOUT_CRON_ENABLED"),
      resolved: parseTruthyFlag(env.BUILDER_ROLLOUT_CRON_ENABLED),
    },
    {
      key: "MEDIA_PRIVATE_ACCESS_ENABLED",
      source: "env+db",
      env: envRaw(env, "MEDIA_PRIVATE_ACCESS_ENABLED"),
      // env half only here; `resolveProdGatingFlags` overwrites with effective
      resolved: mediaEnvForcedOn,
    },
    {
      key: "REAP_SUPPORT_REPLAYS_ENABLED",
      source: "env",
      env: envRaw(env, "REAP_SUPPORT_REPLAYS_ENABLED"),
      resolved: env.REAP_SUPPORT_REPLAYS_ENABLED === "true",
    },
    {
      key: "COMMISSION_PROCESSING_PASS_THROUGH",
      source: "env+db",
      env: envRaw(env, "COMMISSION_PROCESSING_PASS_THROUGH"),
      resolved: env.COMMISSION_PROCESSING_PASS_THROUGH === "1",
    },
    {
      key: "CLIENT_WELCOME_EMAIL_ENABLED",
      source: "env",
      env: envRaw(env, "CLIENT_WELCOME_EMAIL_ENABLED"),
      resolved: env.CLIENT_WELCOME_EMAIL_ENABLED === "1",
    },
    {
      key: "TALENT_SITE_CONSENT_TOOLING_ENABLED",
      source: "env",
      env: envRaw(env, "TALENT_SITE_CONSENT_TOOLING_ENABLED"),
      // footer-socket.ts gates on === "1"
      resolved: env.TALENT_SITE_CONSENT_TOOLING_ENABLED === "1",
    },
    {
      key: "SUPPORT_DESK_ENABLED",
      source: "env",
      env: envRaw(env, "SUPPORT_DESK_ENABLED"),
      resolved: isSupportDeskEnabled(env),
    },
    // Placeholder rows for DB flags so the catalog length is stable; filled async.
    {
      key: "settings.ai_talent_translate_enabled",
      source: "db",
      env: null,
      resolved: null,
    },
    {
      key: "settings.ai_master_enabled",
      source: "db",
      env: null,
      resolved: null,
    },
    {
      key: "platform_settings.workspace_fab_enabled",
      source: "db",
      env: null,
      resolved: null,
    },
    {
      key: "platform_settings.media_private_access_enabled",
      source: "db",
      env: null,
      resolved: null,
    },
    {
      key: "platform_commission_config.processing_mode",
      source: "db",
      env: null,
      resolved: null,
    },
    {
      key: "platform_commission_config.pass_through_take_bps",
      source: "db",
      env: null,
      resolved: null,
    },
  ];
}

/**
 * Full live resolve: env helpers + service-role DB reads for settings that
 * live in Postgres.
 */
export async function resolveProdGatingFlags(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProdGatingFlag[]> {
  const flags = resolveEnvProdGatingFlags(env);
  const byKey = new Map(flags.map((f) => [f.key, f]));

  const ai = await getAiFeatureFlags();
  patch(byKey, "settings.ai_talent_translate_enabled", {
    db: ai.ai_talent_translate_enabled,
    resolved: ai.ai_talent_translate_enabled,
  });
  patch(byKey, "settings.ai_master_enabled", {
    db: ai.ai_master_enabled,
    resolved: ai.ai_master_enabled,
  });

  const admin = createServiceRoleClient();
  if (admin) {
    const { data: ps } = await admin
      .from("platform_settings")
      .select("workspace_fab_enabled, media_private_access_enabled")
      .eq("id", true)
      .maybeSingle();

    const fab = !!ps?.workspace_fab_enabled;
    const mediaDb = !!ps?.media_private_access_enabled;
    patch(byKey, "platform_settings.workspace_fab_enabled", {
      db: fab,
      resolved: fab,
    });
    patch(byKey, "platform_settings.media_private_access_enabled", {
      db: mediaDb,
      resolved: mediaDb,
    });

    const mediaEffective = resolvePrivateMediaAccess(mediaDb);
    patch(byKey, "MEDIA_PRIVATE_ACCESS_ENABLED", {
      db: mediaDb,
      resolved: mediaEffective.enabled,
    });

    // Same RPC the commission engine uses when arming pass_through.
    const modeRes = (await admin.rpc("engine_platform_processing_mode" as never)) as {
      data?: {
        processing_mode?: string | null;
        pass_through_take_bps?: number | null;
      } | null;
      error?: { message?: string } | null;
    };
    if (!modeRes.error && modeRes.data) {
      const mode = modeRes.data.processing_mode ?? null;
      const bps =
        typeof modeRes.data.pass_through_take_bps === "number"
          ? modeRes.data.pass_through_take_bps
          : null;
      patch(byKey, "platform_commission_config.processing_mode", {
        db: mode,
        resolved: mode,
      });
      patch(byKey, "platform_commission_config.pass_through_take_bps", {
        db: bps,
        resolved: bps,
      });
      // Combined arming signal: env AND db mode (matches commission-engine).
      const envArmed = env.COMMISSION_PROCESSING_PASS_THROUGH === "1";
      patch(byKey, "COMMISSION_PROCESSING_PASS_THROUGH", {
        db: mode,
        resolved: envArmed && mode === "pass_through",
      });
    }
  }

  return [...byKey.values()];
}

function patch(
  map: Map<string, ProdGatingFlag>,
  key: string,
  patchVal: Partial<Pick<ProdGatingFlag, "db" | "resolved" | "env">>,
): void {
  const cur = map.get(key);
  if (!cur) return;
  map.set(key, { ...cur, ...patchVal });
}
