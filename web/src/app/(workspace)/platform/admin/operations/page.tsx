// Phase 3.11 — Platform HQ · Operations
// Feature flags, system jobs, incidents.
// Real data is Phase 4+ work. Page structure matches prototype now.

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
const FM = '"JetBrains Mono", "Fira Code", ui-monospace, monospace';

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

// ─── Static feature flag list (hardcoded Phase 0 state) ──────────────────────
// Real flag management is Phase 4+ work. Flags listed here match the
// prototype's FEATURE_FLAGS mock as a starting reference.

type FlagState = "on" | "off" | "rollout";

const FLAGS: Array<{
  name: string;
  description: string;
  state: FlagState;
  rollout?: string;
  owner: string;
}> = [
  {
    name: "hub_discovery",
    description: "Public Tulala discovery hub surface",
    state: "off",
    owner: "platform",
  },
  {
    name: "talent_subscriptions",
    description: "Pro/Portfolio tier upsell and billing hooks",
    state: "off",
    owner: "billing",
  },
  {
    name: "client_trust_badges",
    description: "Verified / Silver / Gold client trust tier display",
    state: "off",
    owner: "trust",
  },
  {
    name: "workspace_slug_routes",
    description: "/<tenantSlug>/admin multi-tenant workspace URL pattern",
    state: "on",
    owner: "platform",
  },
  {
    name: "platform_admin_console",
    description: "This super_admin HQ console (/platform/admin/*)",
    state: "on",
    owner: "platform",
  },
  {
    name: "realtime_messages",
    description: "Supabase Realtime messaging between parties",
    state: "off",
    owner: "messaging",
  },
];

const FLAG_COLORS: Record<FlagState, string> = {
  on:      HQ.green,
  off:     HQ.inkDim,
  rollout: HQ.amber,
};

type SystemJobState = "succeeded" | "failed" | "running" | "idle";

const SYSTEM_JOBS: Array<{
  name: string;
  description: string;
  state: SystemJobState;
  lastRun: string;
}> = [
  {
    name: "cron/daily-health-check",
    description: "DB + edge function health ping",
    state: "succeeded",
    lastRun: "today",
  },
  {
    name: "cron/taxonomy-cache-refresh",
    description: "Invalidates taxonomy term cache across tenants",
    state: "succeeded",
    lastRun: "today",
  },
  {
    name: "cron/inquiry-expiry",
    description: "Expires stale open inquiries past their event date",
    state: "succeeded",
    lastRun: "today",
  },
];

const JOB_COLORS: Record<SystemJobState, string> = {
  succeeded: HQ.green,
  failed:    HQ.red,
  running:   HQ.amber,
  idle:      HQ.inkDim,
};

export default function PlatformOperationsPage() {
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
          Operations
        </h1>
        <p
          style={{
            fontFamily: F,
            fontSize: 13,
            color: HQ.inkMuted,
            margin: "5px 0 0",
          }}
        >
          Feature flags, system jobs, and incidents — the levers and alarms for running
          Tulala.
        </p>
      </div>

      {/* Two-col: flags + jobs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 12,
          marginBottom: 12,
        }}
      >
        {/* Feature flags */}
        <HqCard title="Feature flags">
          {FLAGS.map((flag) => {
            const stateColor = FLAG_COLORS[flag.state];
            return (
              <div
                key={flag.name}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 0",
                  borderTop: `1px solid ${HQ.borderSoft}`,
                  fontFamily: F,
                  color: HQ.ink,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: stateColor,
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: FM,
                      fontSize: 12,
                      fontWeight: 500,
                      color: HQ.ink,
                    }}
                  >
                    {flag.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: HQ.inkMuted, marginTop: 2 }}>
                    {flag.description} · {flag.owner}
                    {flag.rollout && ` · ${flag.rollout}`}
                  </div>
                </div>
                <span
                  style={{
                    padding: "2px 7px",
                    background: HQ.cardSoft,
                    color: stateColor,
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    borderRadius: 999,
                  }}
                >
                  {flag.state}
                </span>
              </div>
            );
          })}
        </HqCard>

        {/* System jobs */}
        <HqCard title="System jobs">
          {SYSTEM_JOBS.map((job) => {
            const stateColor = JOB_COLORS[job.state];
            return (
              <div
                key={job.name}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 0",
                  borderTop: `1px solid ${HQ.borderSoft}`,
                  fontFamily: F,
                  color: HQ.ink,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: stateColor,
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: FM,
                      fontSize: 12,
                      fontWeight: 500,
                      color: HQ.ink,
                    }}
                  >
                    {job.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: HQ.inkMuted, marginTop: 2 }}>
                    {job.description} · last run {job.lastRun}
                  </div>
                </div>
                <span
                  style={{
                    padding: "2px 7px",
                    background: HQ.cardSoft,
                    color: stateColor,
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    borderRadius: 999,
                  }}
                >
                  {job.state}
                </span>
              </div>
            );
          })}
        </HqCard>
      </div>

      {/* Incidents (all-clear) */}
      <HqCard title="Incidents">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 0",
            borderTop: `1px solid ${HQ.borderSoft}`,
            fontFamily: F,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: HQ.green,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 13, color: HQ.inkMuted }}>
            No active incidents. All systems operational.
          </span>
        </div>
      </HqCard>
    </>
  );
}
