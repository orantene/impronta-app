// Platform HQ · Operations
// Real settings-backed feature flags (FlagsPanel), system jobs (preview),
// and incidents. The flag values are live from `public.settings`; each is
// editable via the saveFlag server action (re-checks isPlatformAdmin).

import { FlagsPanel } from "./FlagsPanel";
import { FLAG_GROUPS } from "./flags-registry";
import { readFlagValues } from "./flags-read";

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
  badge,
  children,
}: {
  title: string;
  badge?: string;
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
      <div
        className="mb-2.5"
        style={{ display: "flex", alignItems: "center", gap: 8 }}
      >
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
        {badge && (
          <span
            style={{
              fontSize: 9.5,
              color: HQ.inkDim,
              fontWeight: 600,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              border: `1px solid ${HQ.borderSoft}`,
              borderRadius: 999,
              padding: "1px 6px",
            }}
          >
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

// ── System jobs (preview) ────────────────────────────────────────────────────
// NOTE: this list is a static preview — there is no jobs backend yet. Kept as a
// structural placeholder; the "preview" badge marks it as not-live data.

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
  failed: HQ.red,
  running: HQ.amber,
  idle: HQ.inkDim,
};

export default async function PlatformOperationsPage() {
  const flagValues = await readFlagValues();

  return (
    <>
      {/* Page header */}
      <div className="mb-6">
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

      {/* Real feature flags (settings-backed, editable) */}
      <div className="mb-3">
        <FlagsPanel groups={FLAG_GROUPS} values={flagValues} />
      </div>

      {/* System jobs (preview) + incidents */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 12,
        }}
      >
        {/* System jobs */}
        <HqCard title="System jobs" badge="Preview">
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
                <div className="flex-1 min-w-0">
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
      </div>
    </>
  );
}
