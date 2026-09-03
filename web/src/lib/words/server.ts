import "server-only";

/**
 * server.ts — the tenant read for the words engine.
 *
 * DELIBERATELY NOT EXPORTED FROM `./index`. The barrel is pure and is imported
 * by the test lane and by client components; pulling `server-only` into it
 * would break both (see `reference_server_only_import_breaks_test_lanes`).
 * Server callers import this module directly.
 *
 * WHERE THE DATA LIVES
 * ────────────────────
 * `agencies.settings` JSONB, three keys:
 *   • `industry_preset`          the sixteen-value archetype
 *   • `words`                    per-tenant overrides, `{ key: { en, es } }`
 *   • `appointments.terminology` owned by Appointments, consumed here
 *
 * No migration was needed for any of it: the terminology setting has shipped in
 * this same column since Appointments, and a few dozen override keys are
 * map-shaped rather than row-shaped.
 *
 * WHY THE SERVICE-ROLE CLIENT
 * ───────────────────────────
 * `agencies` is not exposed to the public RLS path the way
 * `agency_business_identity` is, and every existing reader of
 * `agencies.settings` (instant-book-engine, the settings actions) uses the
 * service role. Tenant scope here is the explicit `tenantId` argument and the
 * `.eq("id", tenantId)` below, never ambient request state: this module must
 * not read `headers()` or `cookies()`, exactly like `site-admin/server/reads`.
 *
 * FAILS TOWARD THE SHIPPED WORDS, NEVER TOWARD BLANK. A missing row, absent
 * Supabase env, or a malformed blob all resolve to the product defaults, so a
 * database problem can never empty a live storefront's buttons.
 */

import { unstable_cache } from "next/cache";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { improntaLog } from "@/lib/server/structured-log";
import { tagFor } from "@/lib/site-admin";

import { resolveWords, type WordsLookup } from "./resolve";
import { wordsInputFromSettings } from "./settings";
import type { WordLocale } from "./rows";
import type { IndustryPresetId } from "./presets";

export type TenantWordsInput = {
  readonly presetId: IndustryPresetId;
  readonly overrides: Record<string, Partial<Record<WordLocale, string>>>;
  readonly terminologyId: unknown;
};

/** The shape `resolveWords` needs, read once and cached per tenant. */
function loadTenantWordsInput(tenantId: string): Promise<TenantWordsInput> {
  if (!tenantId) return Promise.resolve(wordsInputFromSettings(null));

  return unstable_cache(
    async (): Promise<TenantWordsInput> => {
      const admin = createServiceRoleClient();
      if (!admin) return wordsInputFromSettings(null);
      const { data, error } = await admin
        .from("agencies")
        .select("settings")
        .eq("id", tenantId)
        .maybeSingle<{ settings: unknown }>();
      if (error) {
        void improntaLog("words.warn", {
          message: "[words/server] settings load failed",
          tenantId,
          error: error.message,
        });
        return wordsInputFromSettings(null);
      }
      return wordsInputFromSettings(data?.settings ?? null);
    },
    ["words:tenant-settings", tenantId],
    {
      // "storefront" busts on a tenant-wide change and is covered by
      // `tenantBustTags`, so a preset switch in Settings reaches the public
      // header without a bespoke tag.
      tags: [tagFor(tenantId, "storefront")],
      // Same defensive TTL as the identity read: tags fire instantly in one
      // runtime, but the Data Cache persists across deploys and revalidateTag
      // cannot cross runtimes.
      revalidate: 300,
    },
  )();
}

/**
 * The words for one tenant in one language.
 *
 * This is the single call every public surface makes. Nothing downstream reads
 * `agencies.settings` itself, and nothing downstream hardcodes a noun.
 */
export async function loadTenantWords(
  tenantId: string,
  locale: WordLocale,
): Promise<WordsLookup> {
  const input = await loadTenantWordsInput(tenantId);
  return resolveWords(input, locale);
}
