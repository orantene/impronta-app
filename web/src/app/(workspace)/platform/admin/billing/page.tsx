// Phase 3.11 — Platform HQ · Billing
// MRR by plan, invoice ledger, dunning queue.
// Real billing data is Phase 8 work. Page structure matches prototype now.

const HQ = {
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  green: "#5DD3A0",
  amber: "#9BA8B7",
  red: "#F36772",
} as const;

const F = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

function StatCard({
  label,
  value,
  caption,
  tone = "ink",
}: {
  label: string;
  value: React.ReactNode;
  caption?: string;
  tone?: "ink" | "green" | "amber" | "red" | "dim";
}) {
  const accent =
    tone === "green"
      ? HQ.green
      : tone === "amber"
      ? HQ.amber
      : tone === "red"
      ? HQ.red
      : tone === "dim"
      ? HQ.inkDim
      : HQ.ink;

  return (
    <div
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: 120,
      }}
    >
      <span style={{ fontFamily: F, fontSize: 11.5, color: HQ.inkMuted, fontWeight: 500 }}>
        {label}
      </span>
      <span
        style={{
          fontFamily: FD,
          fontSize: 32,
          fontWeight: 500,
          letterSpacing: -0.6,
          color: accent,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      {caption && (
        <span style={{ fontFamily: F, fontSize: 11.5, color: HQ.inkMuted }}>
          {caption}
        </span>
      )}
    </div>
  );
}

function HqCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        padding: 16,
        fontFamily: F,
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <span
          style={{
            fontSize: 10.5,
            color: HQ.inkMuted,
            fontWeight: 600,
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
        {subtitle && (
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: HQ.inkMuted }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

export default function PlatformBillingPage() {
  // Phase 8 will wire real Stripe data here.
  // Structure matches prototype; empty states shown until billing is live.

  return (
    <>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: FD,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -0.4,
            color: HQ.ink,
            margin: 0,
          }}
        >
          Billing
        </h1>
        <p
          style={{
            fontFamily: F,
            fontSize: 13,
            color: HQ.inkMuted,
            margin: "5px 0 0",
          }}
        >
          MRR by plan, invoice ledger, and refund tools. Billing integration ships in
          Phase 8.
        </p>
      </div>

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="MRR"
          value="—"
          caption="Stripe integration pending"
          tone="dim"
        />
        <StatCard
          label="Churn (30d)"
          value="—"
          caption="Stripe integration pending"
          tone="dim"
        />
        <StatCard
          label="Failed payments"
          value="0"
          caption="No active billing yet"
          tone="green"
        />
      </div>

      {/* Invoice table — placeholder until Phase 8 */}
      <HqCard title="Invoice ledger" subtitle="No invoices yet — billing ships in Phase 8">
        <div
          style={{
            padding: "32px 0",
            textAlign: "center",
            color: HQ.inkMuted,
            fontSize: 13,
            fontFamily: F,
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.3 }}>₿</div>
          Billing integration (Stripe) is scheduled for Phase 8.
          <br />
          When live, invoices, dunning, and plan overrides will appear here.
        </div>
      </HqCard>

      <div style={{ height: 12 }} />

      {/* Plan breakdown */}
      <HqCard title="Plan distribution">
        {[
          { plan: "Free",    color: "rgba(245,242,235,0.38)" },
          { plan: "Studio",  color: HQ.amber },
          { plan: "Agency",  color: HQ.green },
          { plan: "Network", color: "#A07AE0" },
        ].map((p) => (
          <div
            key={p.plan}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 0",
              borderTop: `1px solid ${HQ.borderSoft}`,
              fontFamily: F,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: p.color,
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1, fontSize: 13, color: HQ.ink }}>{p.plan}</span>
            <span style={{ fontSize: 12, color: HQ.inkDim }}>—</span>
          </div>
        ))}
      </HqCard>
    </>
  );
}
