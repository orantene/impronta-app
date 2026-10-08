/**
 * Talent surface route loading state.
 * The URL commits immediately; this skeleton fills the PAGE SLOT only. The
 * shell (top bar, nav) is already painted by the layout, so the fallback must
 * not draw a second top bar. No count is shown: the number is not known yet.
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
      style={{ padding: 28, background: "var(--color-admin-surface)" }}
    >
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
        }}
      >
        {loading}
      </span>
      <div
        style={{
          height: 28,
          width: 180,
          background: "var(--color-admin-surface-alt)",
          borderRadius: 6,
          marginBottom: 16,
        }}
      />
      <div
        style={{
          height: 220,
          background: "var(--color-admin-surface-alt)",
          borderRadius: 14,
          opacity: 0.55,
        }}
      />
    </div>
  );
}
