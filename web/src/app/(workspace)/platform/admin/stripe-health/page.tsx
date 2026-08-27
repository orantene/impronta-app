/**
 * /platform/admin/stripe-health — is the Stripe wiring correct, in one glance.
 *
 * Server component, read-only, no client state. super_admin gate inherited from
 * the surrounding /platform/admin/layout.tsx. Deliberately plain: this page is
 * read while something is broken, so it says what is wrong in a sentence rather
 * than making anyone interpret a dashboard.
 */

import { loadStripeHealth, type HealthStatus } from "@/lib/pricing/stripe-health";

export const dynamic = "force-dynamic";

const HQ = {
  card: "#16161A",
  border: "rgba(255,255,255,0.10)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
} as const;

const F = '"Inter", system-ui, sans-serif';

const TONE: Record<HealthStatus, { dot: string; label: string }> = {
  ok: { dot: "#3FB950", label: "OK" },
  warn: { dot: "#D29922", label: "CHECK" },
  fail: { dot: "#F85149", label: "BROKEN" },
  unknown: { dot: "rgba(245,242,235,0.35)", label: "UNKNOWN" },
};

export default async function StripeHealthPage() {
  const health = await loadStripeHealth();
  const worst: HealthStatus = health.checks.some((c) => c.status === "fail")
    ? "fail"
    : health.checks.some((c) => c.status === "warn")
      ? "warn"
      : health.checks.some((c) => c.status === "unknown")
        ? "unknown"
        : "ok";

  return (
    <div style={{ fontFamily: F, color: HQ.ink, padding: "24px 28px", maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: TONE[worst].dot,
            display: "inline-block",
          }}
        />
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Stripe health</h1>
      </div>
      <p style={{ color: HQ.inkMuted, fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>
        Everything below is read live from Stripe and the pricing catalog. It answers the
        question that is otherwise only answerable by hand: is the key we are using pointed
        at the account that holds our prices, our webhooks and our sellers?
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
        {health.checks.map((check) => (
          <section
            key={check.id}
            style={{
              background: HQ.card,
              border: `1px solid ${HQ.border}`,
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: TONE[check.status].dot,
                  display: "inline-block",
                }}
              />
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{check.label}</h2>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: TONE[check.status].dot }}>
                {TONE[check.status].label}
              </span>
            </div>
            <p style={{ color: HQ.inkMuted, fontSize: 12.5, lineHeight: 1.55, margin: "6px 0 0" }}>
              {check.detail}
            </p>
            {check.items && check.items.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
                {check.items.map((item) => (
                  <li
                    key={`${check.id}-${item.name}`}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "baseline",
                      fontSize: 12,
                      padding: "3px 0",
                      color: HQ.inkMuted,
                    }}
                  >
                    <span aria-hidden style={{ color: TONE[item.status].dot }}>
                      •
                    </span>
                    <span style={{ color: HQ.ink, minWidth: 190 }}>{item.name}</span>
                    <span>{item.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <p style={{ color: HQ.inkMuted, fontSize: 11, marginTop: 16 }}>
        Checked {new Date(health.fetchedAt).toLocaleString()} · reload to re-run
      </p>
    </div>
  );
}
