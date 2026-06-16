/**
 * WS7 — Translation Center mount (platform-admin).
 * /platform/admin/translations
 *
 * Mounts the previously-unmounted `TranslationCenterView` + `TranslationCenterQueue`.
 * Platform-admin (super_admin) auth is enforced by the parent
 * `(workspace)/platform/admin/layout.tsx` (redirects/404s non-admins) — this page
 * adds only a defensive client check.
 *
 * Data pipeline (all pre-built, wired here for the first time):
 *   parseTranslationsSearchParams(sp)  → URL state
 *   loadTranslationCenterBootstrap(sb) → coverage rollups + language settings
 *   loadTranslationCenterUnits(sb, …)  → the work-queue rows for the active tab
 *   <TranslationCenterView …/>         → renders coverage + queue + inline editor
 *
 * The service-role client is used (RLS-wide) because this is a platform-level
 * view across all tenants, matching the existing translation-health bootstrap
 * precedent in `lib/dashboard/admin-dashboard-data.ts`.
 *
 * Known entanglement (parallel-agent scope): the registry-driven view links its
 * tab/filter/search hrefs and "Full page" deep links at the *tenant* admin
 * surface (`/admin/translations`, `/admin/talent/…`), which do not resolve under
 * the non-tenant platform host. The inline **quick-edit sheet** (the primary
 * authoring affordance — writes to `*_i18n` columns via the existing adapters and
 * `requireStaff`-gated server actions) works here regardless, since it is a
 * client action rather than navigation. Re-pointing those hrefs is left to the
 * routing/storage owners (see report).
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { TranslationCenterView } from "@/components/translation-center/translation-center-view";
import {
  loadTranslationCenterBootstrap,
  loadTranslationCenterUnits,
} from "@/lib/translation-center/bootstrap";
import { parseTranslationsSearchParams } from "@/lib/server-actions/admin-translations-url";
import { TC_TABLE_PAGE_SIZE } from "@/lib/translation-center/adapters/adapter-types";
import type { ListUnitsParams } from "@/lib/translation-center/types";

export const dynamic = "force-dynamic";

/** True when an AI key is configured server-side (drives the status chip only). */
function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim());
}

export default async function PlatformTranslationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    status?: string;
    bio?: string;
    q?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const sp = await searchParams;
  const parsed = parseTranslationsSearchParams(sp);

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return (
      <div style={{ color: "#F36772", fontSize: 13, padding: 4 }}>
        Translation Center is unavailable — the service-role Supabase client could not be
        initialized. Check the server environment configuration.
      </div>
    );
  }

  // Active-tab status filter: bio tab uses the bio filter, everything else the tax/loc filter.
  const statusFilter = parsed.view === "bio" ? parsed.bioStatusFilter : parsed.taxLocStatusFilter;

  const listParams: ListUnitsParams = {
    navTabKey: parsed.view,
    q: parsed.q,
    statusFilter,
    limit: TC_TABLE_PAGE_SIZE,
    offset: 0,
    bioSort: parsed.bioSort,
    taxonomySort: parsed.taxonomySort,
    locationSort: parsed.locationSort,
    sortDir: parsed.sortDir,
  };

  let bootstrap: Awaited<ReturnType<typeof loadTranslationCenterBootstrap>>;
  let unitsResult: Awaited<ReturnType<typeof loadTranslationCenterUnits>>;
  try {
    [bootstrap, unitsResult] = await Promise.all([
      loadTranslationCenterBootstrap(supabase),
      loadTranslationCenterUnits(supabase, listParams),
    ]);
  } catch {
    return (
      <div style={{ color: "#F36772", fontSize: 13, padding: 4 }}>
        Could not load translation data. Some translation domains may reference schema that is not
        yet applied on this environment.
      </div>
    );
  }

  return (
    <TranslationCenterView
      bootstrap={bootstrap}
      units={unitsResult.units}
      hasMore={unitsResult.hasMore}
      loadError={unitsResult.loadError}
      view={parsed.view}
      bioStatusFilter={parsed.bioStatusFilter}
      taxLocStatusFilter={parsed.taxLocStatusFilter}
      q={parsed.q}
      bioSort={parsed.bioSort}
      taxonomySort={parsed.taxonomySort}
      locationSort={parsed.locationSort}
      sortDir={parsed.sortDir}
      aiConfigured={isAiConfigured()}
    />
  );
}
