// Platform HQ · Operations
// Real settings-backed feature flags (FlagsPanel), system jobs (preview),
// and incidents. The flag values are live from `public.settings`; each is
// editable via the saveFlag server action (re-checks isPlatformAdmin).

import { FlagsPanel } from "./FlagsPanel";
import { FLAG_GROUPS } from "./flags-registry";
import { readFlagValues } from "./flags-read";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;

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

// name = code identifier (kept raw). descriptionKey/lastRunKey/state resolve via
// t() at render (state via JOB_STATE_KEY). This list is a static preview.
const SYSTEM_JOBS: Array<{
  name: string;
  descriptionKey: string;
  state: SystemJobState;
  lastRunKey: string;
}> = [
  {
    name: "cron/daily-health-check",
    descriptionKey: "dashboard.platform.operations.jobDailyHealth",
    state: "succeeded",
    lastRunKey: "dashboard.platform.operations.jobRunToday",
  },
  {
    name: "cron/taxonomy-cache-refresh",
    descriptionKey: "dashboard.platform.operations.jobTaxonomyCache",
    state: "succeeded",
    lastRunKey: "dashboard.platform.operations.jobRunToday",
  },
  {
    name: "cron/inquiry-expiry",
    descriptionKey: "dashboard.platform.operations.jobInquiryExpiry",
    state: "succeeded",
    lastRunKey: "dashboard.platform.operations.jobRunToday",
  },
];

const JOB_COLORS: Record<SystemJobState, string> = {
  succeeded: HQ.green,
  failed: HQ.red,
  running: HQ.amber,
  idle: HQ.inkDim,
};

// enum → catalog key; render label via t(), keep switching on the raw union.
const JOB_STATE_KEY: Record<SystemJobState, string> = {
  succeeded: "dashboard.platform.operations.jobStateSucceeded",
  failed: "dashboard.platform.operations.jobStateFailed",
  running: "dashboard.platform.operations.jobStateRunning",
  idle: "dashboard.platform.operations.jobStateIdle",
};

export default async function PlatformOperationsPage() {
  const [flagValues, locale] = await Promise.all([readFlagValues(), getRequestLocale()]);
  const t: Translate = createTranslator(locale);

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
          {t("dashboard.platform.operations.title")}
        </h1>
        <p
          style={{
            fontFamily: F,
            fontSize: 13,
            color: HQ.inkMuted,
            margin: "5px 0 0",
          }}
        >
          {t("dashboard.platform.operations.subtitle")}
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
        <HqCard
          title={t("dashboard.platform.operations.systemJobs")}
          badge={t("dashboard.platform.operations.badgePreview")}
        >
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
                    {t(job.descriptionKey)} ·{" "}
                    {interpolate(t("dashboard.platform.operations.jobLastRun"), {
                      when: t(job.lastRunKey),
                    })}
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
                  {t(JOB_STATE_KEY[job.state])}
                </span>
              </div>
            );
          })}
        </HqCard>

        {/* Incidents (all-clear) */}
        <HqCard title={t("dashboard.platform.operations.incidents")}>
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
              {t("dashboard.platform.operations.incidentsAllClear")}
            </span>
          </div>
        </HqCard>
      </div>
    </>
  );
}
