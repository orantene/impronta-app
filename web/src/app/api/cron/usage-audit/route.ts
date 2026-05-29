import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { sendEmail } from "@/lib/email";

/**
 * Scheduled job — weekly Supabase usage audit.
 *
 * Posts a report grouped by severity (OK / WARN / CRITICAL) when anything
 * crosses a quota threshold, so the next leak gets caught at 60% of quota
 * instead of 434% (cf. 2026-05-20 incident where storage hit 1.83x and
 * cached egress 4.34x of the Free-plan limit before anyone noticed).
 *
 * Four checks (data via public.usage_audit_metrics()):
 *   1. Storage size — per bucket + total vs Free-plan ceiling (1 GB)
 *      Thresholds: 60% WARN, 80% CRITICAL
 *   2. DB size — pg_database_size() vs Free-plan ceiling (500 MB)
 *      Thresholds: 60% WARN, 80% CRITICAL
 *   3. Large media — media_assets rows > 250 KB (backfill candidates)
 *      Thresholds: > 50 WARN, > 500 CRITICAL
 *   4. Orphan media — media_assets DB rows with no matching storage.object
 *      Thresholds: > 100 WARN, > 1000 CRITICAL
 *
 * Delivery (per user decision 2026-05-20):
 *   - Always insert any WARN/CRITICAL finding into `platform_alerts`
 *     (durable audit trail). UNIQUE (audit_date, category, content_hash)
 *     makes re-running the cron on the same day a no-op.
 *   - Additionally email USAGE_AUDIT_EMAIL_TO when RESEND_API_KEY is set
 *     (sendEmail() silently no-ops when the key is missing).
 *
 * Manual test:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/usage-audit
 *
 * Configured in `vercel.json`:
 *   "crons": [
 *     { "path": "/api/cron/usage-audit", "schedule": "0 9 * * 1" }
 *   ]
 * (Monday 09:00 UTC. Weekly cadence — quota leaks build over days, not hours.)
 */

// ---------------------------------------------------------------------------
// Thresholds — explicit so they're trivial to tune later.
// ---------------------------------------------------------------------------
const FREE_PLAN_STORAGE_LIMIT_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB
const FREE_PLAN_DB_LIMIT_BYTES = 500 * 1024 * 1024; // 500 MB

const PERCENT_WARN = 0.60;
const PERCENT_CRITICAL = 0.80;

const LARGE_MEDIA_WARN = 50;
const LARGE_MEDIA_CRITICAL = 500;

const ORPHAN_MEDIA_WARN = 100;
const ORPHAN_MEDIA_CRITICAL = 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Severity = "ok" | "warn" | "critical";

type BucketUsage = {
  bucket_id: string;
  bytes: number;
  objects: number;
};

type Metrics = {
  db_bytes: number;
  storage_buckets: BucketUsage[];
  storage_total_bytes: number;
  large_media_count: number;
  orphan_media_count: number;
  collected_at: string;
};

type Finding = {
  category: string;
  severity: Severity;
  message: string;
  details: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------
function classifyPercent(used: number, ceiling: number): Severity {
  const pct = used / ceiling;
  if (pct >= PERCENT_CRITICAL) return "critical";
  if (pct >= PERCENT_WARN) return "warn";
  return "ok";
}

function classifyCount(count: number, warnAt: number, critAt: number): Severity {
  if (count > critAt) return "critical";
  if (count > warnAt) return "warn";
  return "ok";
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function fmtPercent(used: number, ceiling: number): string {
  return `${((used / ceiling) * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Evaluate metrics → findings list
// ---------------------------------------------------------------------------
function evaluate(metrics: Metrics): Finding[] {
  const findings: Finding[] = [];

  // 1) Storage total
  const storageSev = classifyPercent(
    metrics.storage_total_bytes,
    FREE_PLAN_STORAGE_LIMIT_BYTES,
  );
  findings.push({
    category: "storage_total",
    severity: storageSev,
    message: `Storage: ${fmtBytes(metrics.storage_total_bytes)} / ${fmtBytes(FREE_PLAN_STORAGE_LIMIT_BYTES)} (${fmtPercent(metrics.storage_total_bytes, FREE_PLAN_STORAGE_LIMIT_BYTES)})`,
    details: {
      used_bytes: metrics.storage_total_bytes,
      limit_bytes: FREE_PLAN_STORAGE_LIMIT_BYTES,
      buckets: metrics.storage_buckets,
    },
  });

  // 2) DB size
  const dbSev = classifyPercent(metrics.db_bytes, FREE_PLAN_DB_LIMIT_BYTES);
  findings.push({
    category: "db_size",
    severity: dbSev,
    message: `DB size: ${fmtBytes(metrics.db_bytes)} / ${fmtBytes(FREE_PLAN_DB_LIMIT_BYTES)} (${fmtPercent(metrics.db_bytes, FREE_PLAN_DB_LIMIT_BYTES)})`,
    details: {
      used_bytes: metrics.db_bytes,
      limit_bytes: FREE_PLAN_DB_LIMIT_BYTES,
    },
  });

  // 3) Large media (backfill candidates)
  const largeSev = classifyCount(
    metrics.large_media_count,
    LARGE_MEDIA_WARN,
    LARGE_MEDIA_CRITICAL,
  );
  findings.push({
    category: "large_media",
    severity: largeSev,
    message: `Large media (>250 KB): ${metrics.large_media_count} row(s) — backfill candidates`,
    details: { count: metrics.large_media_count, warn_at: LARGE_MEDIA_WARN, crit_at: LARGE_MEDIA_CRITICAL },
  });

  // 4) Orphan media (DB row with no storage object)
  const orphanSev = classifyCount(
    metrics.orphan_media_count,
    ORPHAN_MEDIA_WARN,
    ORPHAN_MEDIA_CRITICAL,
  );
  findings.push({
    category: "orphan_media",
    severity: orphanSev,
    message: `Orphan media rows: ${metrics.orphan_media_count} (DB row points at no storage.object)`,
    details: { count: metrics.orphan_media_count, warn_at: ORPHAN_MEDIA_WARN, crit_at: ORPHAN_MEDIA_CRITICAL },
  });

  return findings;
}

// ---------------------------------------------------------------------------
// Plain-text report grouped by severity (used for both API response + email)
// ---------------------------------------------------------------------------
function buildReport(findings: Finding[], metrics: Metrics): string {
  const critical = findings.filter((f) => f.severity === "critical");
  const warn = findings.filter((f) => f.severity === "warn");
  const ok = findings.filter((f) => f.severity === "ok");

  const lines: string[] = [];
  lines.push(`Supabase usage audit — collected ${metrics.collected_at}`);
  lines.push("");

  if (critical.length > 0) {
    lines.push(`CRITICAL (${critical.length}):`);
    for (const f of critical) lines.push(`  ✕ ${f.message}`);
    lines.push("");
  }
  if (warn.length > 0) {
    lines.push(`WARN (${warn.length}):`);
    for (const f of warn) lines.push(`  ⚠ ${f.message}`);
    lines.push("");
  }
  if (ok.length > 0) {
    lines.push(`OK (${ok.length}):`);
    for (const f of ok) lines.push(`  ✓ ${f.message}`);
    lines.push("");
  }

  // Append per-bucket breakdown if storage is anything but trivially small.
  if (metrics.storage_buckets.length > 0) {
    lines.push("Storage buckets:");
    for (const b of metrics.storage_buckets) {
      lines.push(`  - ${b.bucket_id}: ${fmtBytes(b.bytes)} (${b.objects} objects)`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Dedupe hash — same metrics on same day = same hash = ON CONFLICT DO NOTHING
// ---------------------------------------------------------------------------
function contentHashFor(finding: Finding): string {
  // Round numeric values to a stable bucket so 1% drift between runs on
  // the same day doesn't create a flood of near-duplicates.
  const stableDetails: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(finding.details)) {
    if (typeof v === "number") {
      // Round percentages to 0.1% and byte counts to nearest MB.
      stableDetails[k] = v > 1024 ? Math.round(v / (1024 * 1024)) : Math.round(v * 10) / 10;
    } else {
      stableDetails[k] = v;
    }
  }
  const seed = JSON.stringify({
    category: finding.category,
    severity: finding.severity,
    details: stableDetails,
  });
  return createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError(
      "cron/usage-audit",
      "CRON_SECRET env var not set; refusing to run",
    );
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  return await Sentry.withMonitor(
    "usage-audit",
    async () => {
      try {
        const startedAt = Date.now();

        // 1) Fetch raw metrics in one RPC round trip.
        const { data: rawMetrics, error: metricsError } = await supabase.rpc(
          "usage_audit_metrics",
        );
        if (metricsError) {
          logServerError("cron/usage-audit.metrics", metricsError);
          return NextResponse.json(
            { ok: false, error: metricsError.message },
            { status: 500 },
          );
        }
        const metrics = rawMetrics as Metrics;

        // 2) Classify each check.
        const findings = evaluate(metrics);
        const alerts = findings.filter((f) => f.severity !== "ok");

        // 3) All green → nothing to log or send.
        if (alerts.length === 0) {
          return NextResponse.json({
            ok: true,
            summary: "all green",
            durationMs: Date.now() - startedAt,
            metrics,
          });
        }

        // 4) Build report + persist alerts.
        const report = buildReport(findings, metrics);
        const auditDate = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
        const rows = alerts.map((f) => ({
          audit_date: auditDate,
          severity: f.severity,
          category: f.category,
          content_hash: contentHashFor(f),
          payload: f.details,
          message: f.message,
        }));

        const { error: insertError } = await supabase
          .from("platform_alerts")
          .upsert(rows, {
            onConflict: "audit_date,category,content_hash",
            ignoreDuplicates: true,
          });
        if (insertError) {
          // Don't bail — at minimum we still want to return the report.
          logServerError("cron/usage-audit.insert", insertError);
        }

        // 5) Best-effort email. Silent no-op when RESEND_API_KEY unset.
        const recipient =
          process.env.USAGE_AUDIT_EMAIL_TO?.trim() ||
          process.env.EMAIL_REPLY_TO?.trim() ||
          null;
        const critCount = alerts.filter((a) => a.severity === "critical").length;
        const warnCount = alerts.filter((a) => a.severity === "warn").length;

        if (recipient) {
          const subject = `[Tulala] Usage audit: ${critCount} CRITICAL, ${warnCount} WARN`;
          // Wrap plain-text report in <pre> so monospace formatting survives.
          const html = `<pre style="font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;">${escapeHtml(report)}</pre>`;
          try {
            await sendEmail({ to: recipient, subject, html });
          } catch (emailError) {
            // sendEmail() already log-and-no-ops on missing key, but a real
            // delivery failure can still throw. Don't bail — alert is in DB.
            logServerError("cron/usage-audit.email", emailError);
          }
        } else {
          // No recipient — alert is still durably in platform_alerts + the
          // JSON response. Route the breadcrumb through the sanctioned server
          // logger (the project lint rule forbids bare console.*).
          logServerError(
            "cron/usage-audit.no-recipient",
            "USAGE_AUDIT_EMAIL_TO / EMAIL_REPLY_TO not set; email skipped",
          );
        }

        return NextResponse.json({
          ok: true,
          summary: `${critCount} critical, ${warnCount} warn`,
          durationMs: Date.now() - startedAt,
          report,
          alerts,
          metrics,
        });
      } catch (error) {
        logServerError("cron/usage-audit", error);
        return NextResponse.json(
          {
            ok: false,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 },
        );
      }
    },
    {
      schedule: { type: "crontab", value: "0 9 * * 1" },
      checkinMargin: 5,
      maxRuntime: 25,
      timezone: "UTC",
    },
  );
}

// ---------------------------------------------------------------------------
// HTML escape for the email <pre> wrapper. Tiny enough to inline.
// ---------------------------------------------------------------------------
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
