// Phase 3.11 — Platform HQ · Network
// Tulala discovery hub: featured talent, moderation queue, hub rules.

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

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "24px 0",
        textAlign: "center",
        color: HQ.inkMuted,
        fontSize: 13,
        fontFamily: F,
      }}
    >
      {message}
    </div>
  );
}

export default function PlatformNetworkPage() {
  // Hub submissions and moderation queue are Phase 4+ data work.
  // Page structure matches prototype exactly; content shows real-data state.

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
          Network
        </h1>
        <p
          style={{
            fontFamily: F,
            fontSize: 13,
            color: HQ.inkMuted,
            margin: "5px 0 0",
            maxWidth: 640,
          }}
        >
          The discovery surface that sits across every tenant. Curate featured talent,
          run moderation, and tune ranking.
        </p>
      </div>

      {/* Two-col grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 12,
        }}
      >
        <HqCard
          title="Hub submissions awaiting review"
          subtitle="Talent agencies submit to be featured on the network hub."
        >
          <EmptyState message="No submissions pending review." />
        </HqCard>

        <HqCard title="Moderation queue">
          <EmptyState message="No items in the moderation queue." />
        </HqCard>
      </div>

      <div style={{ height: 12 }} />

      {/* Hub rules card */}
      <HqCard
        title="Hub rules"
        subtitle="Criteria for featured talent, ranking weights, and moderation policies."
      >
        <div style={{ padding: "12px 0" }}>
          {[
            {
              label: "Featured criteria",
              desc: "Active agency, complete profile, verified identity, ≥3 published bookings.",
            },
            {
              label: "Ranking signals",
              desc: "Recency, booking velocity, profile completeness, trust tier.",
            },
            {
              label: "Moderation policy",
              desc: "Profiles flagged by 3+ unique reporters are auto-hidden pending review.",
            },
          ].map((rule) => (
            <div
              key={rule.label}
              style={{
                padding: "10px 0",
                borderTop: `1px solid ${HQ.borderSoft}`,
                fontFamily: F,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: HQ.ink,
                  marginBottom: 3,
                }}
              >
                {rule.label}
              </div>
              <div style={{ fontSize: 12.5, color: HQ.inkMuted }}>{rule.desc}</div>
            </div>
          ))}
        </div>
      </HqCard>
    </>
  );
}
