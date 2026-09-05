"use client";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import type { ProofHealth } from "@/lib/talent-integrations/proof-health";

/**
 * Read-only "proof health" card for the admin/coordinator roster talent detail.
 *
 * Shows counts + statuses only — verified social proof, recent selected public
 * media, client trust proof presence, and a stale / needs-re-auth warning. No
 * secrets, no private content. Pure presentation (no client hooks).
 */
const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  inkDim: "rgba(11,11,13,0.40)",
  border: "rgba(24,24,27,0.10)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  warn: "var(--color-admin-amber)",
  warnSoft: "rgba(212,160,23,0.14)",
} as const;
const F = '"Inter", system-ui, sans-serif';

function Stat({
  value,
  label,
}: {
  value: string | number;
  label: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 3 }}>{label}</div>
    </div>
  );
}

export function ProofHealthCard({ health }: { health: ProofHealth }) {
  const t = useT();
  const nothingConnected =
    health.visibleConnectionCount === 0 &&
    health.selectedPublicMediaCount === 0 &&
    !health.hasClientTrustProof;

  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 18,
        fontFamily: F,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h3
          style={{
            fontFamily: F,
            fontSize: 14,
            fontWeight: 700,
            color: C.ink,
            margin: 0,
            letterSpacing: -0.05,
          }}
        >
          {t("dashboard.adminWorkspace.integrations.proofTitle")}
        </h3>
        {health.needsAttentionCount > 0 ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 9px",
              borderRadius: 999,
              background: C.warnSoft,
              color: C.warn,
            }}
          >
            {interpolate(
              t(
                health.needsAttentionCount === 1
                  ? "dashboard.adminWorkspace.integrations.proofNeedsReauthOne"
                  : "dashboard.adminWorkspace.integrations.proofNeedsReauthOther",
              ),
              { count: health.needsAttentionCount },
            )}
          </span>
        ) : null}
      </div>
      <p style={{ fontSize: 12, color: C.inkMuted, margin: "0 0 14px", lineHeight: 1.5 }}>
        {t("dashboard.adminWorkspace.integrations.proofBlurb")}
      </p>

      {nothingConnected ? (
        <div style={{ fontSize: 12.5, color: C.inkDim }}>
          {t("dashboard.adminWorkspace.integrations.proofEmpty")}
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 14,
              marginBottom: health.connections.length > 0 ? 14 : 0,
            }}
          >
            <Stat
              value={health.verifiedConnectionCount}
              label={t("dashboard.adminWorkspace.integrations.proofStatVerified")}
            />
            <Stat
              value={health.visibleConnectionCount}
              label={t("dashboard.adminWorkspace.integrations.proofStatVisible")}
            />
            <Stat
              value={health.selectedPublicMediaCount}
              label={t("dashboard.adminWorkspace.integrations.proofStatMedia")}
            />
            <Stat
              value={health.hasClientTrustProof ? t("dashboard.adminWorkspace.integrations.proofYes") : "—"}
              label={t("dashboard.adminWorkspace.integrations.proofStatTrust")}
            />
          </div>

          {health.connections.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {health.connections.map((c) => (
                <span
                  key={c.provider}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 9px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    background: c.needsAttention
                      ? C.warnSoft
                      : c.verified
                        ? C.accentSoft
                        : "rgba(11,11,13,0.05)",
                    color: c.needsAttention
                      ? C.warn
                      : c.verified
                        ? C.accent
                        : C.inkMuted,
                  }}
                >
                  {c.verified ? <span aria-hidden>✓</span> : null}
                  {c.provider}
                  {c.needsAttention ? ` · ${t("dashboard.adminWorkspace.integrations.proofReauthTag")}` : ""}
                </span>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
