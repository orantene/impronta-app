import type { ClientTrustSummary } from "@/lib/client-integrations/client-trust-summary";

/**
 * Read-only, minimal "verified client" indicator for inquiry/booking surfaces.
 *
 * Renders ONLY a badge + (optionally) the public account labels the client
 * chose to expose. Shows nothing private. Renders nothing at all when the
 * client has no verified trust signal — no empty-state clutter.
 *
 * Server-component friendly: pure presentation, no client hooks.
 */
export function ClientTrustBadge({
  summary,
}: {
  summary: ClientTrustSummary;
}) {
  if (!summary.verified) return null;

  const levelLabel =
    summary.trustLevel && summary.trustLevel !== "basic"
      ? summary.trustLevel.charAt(0).toUpperCase() + summary.trustLevel.slice(1)
      : null;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 6,
        marginTop: 6,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "2px 9px",
          borderRadius: 999,
          background: "rgba(15,79,62,0.08)",
          color: "#0F4F3E",
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1.6,
        }}
      >
        <span aria-hidden>✓</span>
        Verified client
        {levelLabel ? ` · ${levelLabel}` : ""}
      </span>
      {summary.accounts.map((account) => (
        <span
          key={account.provider}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "2px 8px",
            borderRadius: 999,
            background: "rgba(11,11,13,0.05)",
            color: "rgba(11,11,13,0.62)",
            fontSize: 10.5,
            fontWeight: 600,
            lineHeight: 1.6,
          }}
        >
          {account.label}
          {account.accountLabel ? ` · ${account.accountLabel}` : ""}
        </span>
      ))}
    </div>
  );
}
