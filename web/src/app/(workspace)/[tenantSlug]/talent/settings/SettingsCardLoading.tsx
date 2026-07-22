"use client";

/**
 * Shared visible loading state for the talent Settings preference cards
 * (currency / language / booking terms).
 *
 * Replaces two silent-wait anti-patterns that made the Settings page look
 * broken while the cards' self-loads ran:
 *   - `if (loading) return null` — nothing rendered, then the card popped in
 *     (layout shift), and mid-load the page showed a dead gap.
 *   - a blank 148px white box — reserved space with zero explanation.
 *
 * One slim row, real text, same card chrome as the loaded state, so the page
 * never has an unexplained hole and the swap to content is seamless.
 */
export function SettingsCardLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "14px 16px",
        marginBottom: 16,
        borderRadius: 12,
        background: "#fff",
        border: "1px solid rgba(24,24,27,0.08)",
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          border: "2px solid rgba(24,24,27,0.15)",
          borderTopColor: "rgba(24,24,27,0.45)",
          animation: "tulala-settings-card-spin 0.8s linear infinite",
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 12.5, color: "rgba(11,11,13,0.55)" }}>{label}</span>
      <style>{`@keyframes tulala-settings-card-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
