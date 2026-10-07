/**
 * Talent surface route loading state.
 * The URL commits immediately; this skeleton fills the shell until the
 * layout queries settle. No count is shown: the number is not known yet.
 */
import { editorT } from "@/components/edit-chrome/editor-i18n";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function TalentLoading() {
  // TUL-70: the device-mode switch re-enters this boundary; it must follow the
  // request locale instead of showing English "Loading" on a Spanish editor.
  const locale = (await getRequestLocale()).toLowerCase().startsWith("es") ? "es" : "en";
  const loading = editorT("Loading", locale);
  return (
    <div
      role="status"
      aria-label={loading}
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--color-admin-surface)",
        minHeight: "calc(100vh - 50px)",
      }}
    >
      <div style={{ height: 30, background: "var(--color-admin-navy-bg)" }} />
      <div
        style={{
          height: 56,
          background: "var(--color-admin-card)",
          borderBottom: "1px solid var(--color-admin-surface-alt)",
          display: "flex",
          alignItems: "center",
          padding: "0 28px",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 90,
            height: 22,
            background: "var(--color-admin-surface-alt)",
            borderRadius: 4,
          }}
        />
        <div style={{ flex: 1 }} />
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-admin-ink-muted)" }}>
          {loading}
        </p>
      </div>
      <div style={{ padding: 28 }}>
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
    </div>
  );
}
