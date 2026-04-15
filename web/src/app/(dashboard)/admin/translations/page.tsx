import { TranslationCenterView } from "@/components/translation-center/translation-center-view";
import { AdminErrorState } from "@/components/admin/admin-error-state";
import { ADMIN_PAGE_STACK, ADMIN_PAGE_WIDTH } from "@/lib/dashboard-shell-classes";
import { loadTranslationCenterBootstrap, loadTranslationCenterUnits } from "@/lib/translation-center/bootstrap";
import { isResolvedAiChatConfigured } from "@/lib/ai/resolve-provider";
import { CLIENT_ERROR } from "@/lib/server/safe-error";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { parseTranslationsSearchParams } from "@/app/(dashboard)/admin/translations/translations-url";

export default async function AdminTranslationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return (
      <div className={ADMIN_PAGE_STACK}>
        <p className="text-sm text-muted-foreground">Supabase not configured.</p>
      </div>
    );
  }

  const {
    view,
    bioStatusFilter,
    taxLocStatusFilter,
    q,
    bioSort,
    taxonomySort,
    locationSort,
    sortDir,
  } = parseTranslationsSearchParams(sp);

  const statusFilter = view === "bio" ? bioStatusFilter : taxLocStatusFilter;

  const [bootstrap, aiConfigured] = await Promise.all([
    loadTranslationCenterBootstrap(supabase),
    isResolvedAiChatConfigured(),
  ]);

  const { units, hasMore, loadError } = await loadTranslationCenterUnits(supabase, {
    navTabKey: view,
    q,
    statusFilter,
    limit: 80,
    offset: 0,
    bioSort,
    taxonomySort,
    locationSort,
    sortDir,
  });

  if (loadError) {
    return (
      <div className={`${ADMIN_PAGE_WIDTH} space-y-6 pb-8`}>
        <AdminErrorState title="Could not load translations" description={loadError ?? CLIENT_ERROR.loadPage} />
      </div>
    );
  }

  return (
    <TranslationCenterView
      bootstrap={bootstrap}
      units={units}
      hasMore={hasMore}
      loadError={null}
      view={view}
      bioStatusFilter={bioStatusFilter}
      taxLocStatusFilter={taxLocStatusFilter}
      q={q}
      bioSort={bioSort}
      taxonomySort={taxonomySort}
      locationSort={locationSort}
      sortDir={sortDir}
      aiConfigured={aiConfigured}
    />
  );
}
