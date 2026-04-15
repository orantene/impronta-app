import type { SupabaseClient } from "@supabase/supabase-js";

import { getLanguageSettings } from "@/lib/language-settings/get-language-settings";
import { getTranslationAdapter } from "@/lib/translation-center/adapters";
import { TRANSLATION_DOMAINS } from "@/lib/translation-center/registry";
import type { TranslationCenterBootstrap } from "@/lib/translation-center/types";
import type { ListUnitsParams, ListUnitsResult } from "@/lib/translation-center/types";
import { domainsForNavTab } from "@/lib/translation-center/registry";

export async function loadTranslationCenterBootstrap(
  supabase: SupabaseClient,
): Promise<TranslationCenterBootstrap> {
  const languageSettings = await getLanguageSettings(supabase);
  const domains = await Promise.all(
    TRANSLATION_DOMAINS.map((def) =>
      getTranslationAdapter(def.adapterId).aggregate({ supabase, domain: def }),
    ),
  );

  const tabRollups: TranslationCenterBootstrap["tabRollups"] = {};
  for (const d of domains) {
    const r = (tabRollups[d.navTabKey] ??= {
      missing: 0,
      complete: 0,
      needs_attention: 0,
      language_issue: 0,
      applicableRequired: 0,
      filledRequired: 0,
    });
    r.missing += d.counts.missing;
    r.complete += d.counts.complete;
    r.needs_attention += d.counts.needs_attention;
    r.language_issue += d.counts.language_issue;
    r.applicableRequired += d.counts.applicableRequired;
    r.filledRequired += d.counts.filledRequired;
  }

  const global = {
    missing: domains.reduce((s, d) => s + d.counts.missing, 0),
    complete: domains.reduce((s, d) => s + d.counts.complete, 0),
    needs_attention: domains.reduce((s, d) => s + d.counts.needs_attention, 0),
    language_issue: domains.reduce((s, d) => s + d.counts.language_issue, 0),
    applicableRequired: domains.reduce((s, d) => s + d.counts.applicableRequired, 0),
    filledRequired: domains.reduce((s, d) => s + d.counts.filledRequired, 0),
    strictCoveragePercent: null as number | null,
  };
  if (global.applicableRequired > 0) {
    global.strictCoveragePercent = Math.min(
      100,
      Math.round((global.filledRequired / global.applicableRequired) * 100),
    );
  } else {
    global.strictCoveragePercent = 100;
  }

  return { domains, tabRollups, global, languageSettings };
}

export async function loadTranslationCenterUnits(
  supabase: SupabaseClient,
  params: ListUnitsParams,
): Promise<ListUnitsResult> {
  const defs = domainsForNavTab(params.navTabKey);
  const parts = await Promise.all(
    defs.map((def) => getTranslationAdapter(def.adapterId).listUnits({ supabase, domain: def }, params)),
  );
  const loadError = parts.find((p) => p.loadError)?.loadError ?? null;
  const units = parts.flatMap((p) => p.units);
  const hasMore = parts.some((p) => p.hasMore);
  return { units, hasMore, loadError };
}
