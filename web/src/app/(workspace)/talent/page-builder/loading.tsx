/**
 * Page builder route loading state (TUL-748).
 *
 * The builder is mounted bare (no dashboard shell) and its server render does
 * real work (site probe, page rows, canvas data), so without a boundary of its
 * own the visitor saw the dashboard slot skeleton or a blank screen for many
 * seconds. This paints a builder-shaped frame at once: top bar band, canvas.
 * Label follows the request locale ("Cargando tu página...").
 */
import { editorT } from "@/components/edit-chrome/editor-i18n";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function TalentPageBuilderLoading() {
  const locale = (await getRequestLocale().catch(() => "en")).toLowerCase().startsWith("es")
    ? "es"
    : "en";
  const loading = editorT("Loading your page…", locale);
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={loading}
      data-testid="page-builder-route-loading"
      className="flex min-h-dvh flex-col bg-white"
    >
      <span className="sr-only">{loading}</span>
      <div className="flex h-14 items-center gap-3 border-b border-black/[0.06] px-4">
        <div className="h-7 w-7 animate-pulse rounded-md bg-black/[0.07]" />
        <div className="h-5 w-40 animate-pulse rounded-md bg-black/[0.06]" />
        <div className="ml-auto h-8 w-24 animate-pulse rounded-full bg-black/[0.07]" />
      </div>
      <div className="flex-1 space-y-4 p-6">
        <div className="mx-auto h-64 max-w-3xl animate-pulse rounded-2xl bg-black/[0.05]" />
        <div className="mx-auto h-40 max-w-3xl animate-pulse rounded-2xl bg-black/[0.04]" />
        <div className="mx-auto h-40 max-w-3xl animate-pulse rounded-2xl bg-black/[0.04]" />
      </div>
    </div>
  );
}
