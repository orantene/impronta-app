/**
 * Talent surface route loading state.
 * The URL commits immediately; this skeleton fills the PAGE SLOT only. The
 * shell (top bar, nav) is already painted by the layout, so the fallback must
 * not draw a second top bar. Visible black/alpha pulses (TUL-536) — theme CSS
 * vars can still be unset here and used to look blank on phone Hoy.
 */
import { editorT } from "@/components/edit-chrome/editor-i18n";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function TalentLoading() {
  // TUL-70: the device-mode switch re-enters this boundary; it must follow the
  // request locale instead of showing English "Loading" on a Spanish editor.
  const locale = (await getRequestLocale().catch(() => "en")).toLowerCase().startsWith("es")
    ? "es"
    : "en";
  const loading = editorT("Loading", locale);
  return (
    <div
      role="status"
      aria-label={loading}
      data-testid="talent-route-loading"
      className="space-y-4 px-7 py-7"
    >
      <span className="sr-only">{loading}</span>
      <div className="h-7 w-44 animate-pulse rounded-md bg-black/[0.06]" />
      <div className="h-[220px] animate-pulse rounded-2xl bg-black/[0.05]" />
      <div className="h-36 animate-pulse rounded-2xl bg-black/[0.05]" />
    </div>
  );
}
