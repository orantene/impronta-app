"use client";

/**
 * WebsiteHealthPanel.tsx — the Website Overview "Site Health" panel (P2-C).
 *
 * Renders the server-computed report from `lib/admin/website-health.ts`. It
 * decides NOTHING: severity, ordering and copy keys all arrive on the findings.
 * The only judgement here is presentation — a status dot, a plain sentence, an
 * optional "Fix it" affordance, and an "i" explainer for the jargon.
 *
 * STYLING — token classes only. `ratchet/no-new-inline-style` forbids any new
 * `style={{…}}` under `components/admin/shell/**`, so every colour and radius
 * below is an `admin-*` Tailwind token (`styles/admin-color-bridge.css`). Note
 * that shadcn tokens (`text-foreground`, `bg-card`) are NOT usable in this
 * shell — they render white-on-white here.
 *
 * INFO POPOVER — `components/ui/info-tip.tsx` (`InfoTip`), not
 * `admin-help-popover.tsx`. `AdminHelpPopover` paints its body with shadcn
 * tokens (`text-foreground` / `text-muted-foreground`) and a gold trigger icon,
 * both of which are wrong inside the admin shell — the gold is off-brand and
 * the foreground token is the known white-on-white failure. `InfoTip` takes
 * explicit palette classes, is keyboard reachable (the trigger is a real
 * button, and it opens on focus), and closes on Escape.
 *
 * FIX AFFORDANCES — `fixHref` is admin-RELATIVE ("/website/redirects"); this
 * component prefixes it with the shell's `adminBasePath`, which differs between
 * a branded host and the app host. `fixDrawer` opens a shell drawer instead.
 */

import { useRouter } from "next/navigation";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { InfoTip } from "@/components/ui/info-tip";
import type {
  WebsiteHealthFinding,
  WebsiteHealthReport,
  WebsiteHealthSeverity,
} from "@/lib/admin/website-health";
import { useAdminShell } from "../state";

/**
 * Dot + text colour per severity. `admin-amber` is the muted slate the design
 * system uses for caution (the warm gold was retired as off-brand).
 */
const SEVERITY_CLASS: Record<
  WebsiteHealthSeverity,
  { dot: string; text: string }
> = {
  critical: { dot: "bg-admin-critical", text: "text-admin-critical" },
  warning: { dot: "bg-admin-amber-deep", text: "text-admin-amber-deep" },
  info: { dot: "bg-admin-indigo-deep", text: "text-admin-indigo-deep" },
  ok: { dot: "bg-admin-success-deep", text: "text-admin-success-deep" },
};

const SEVERITY_LABEL_KEY: Record<WebsiteHealthSeverity, string> = {
  critical: "dashboard.adminWebsite.health.severity.critical",
  warning: "dashboard.adminWebsite.health.severity.warning",
  info: "dashboard.adminWebsite.health.severity.info",
  ok: "dashboard.adminWebsite.health.severity.ok",
};

function HealthRow({ finding }: { finding: WebsiteHealthFinding }) {
  const t = useT();
  const router = useRouter();
  const { adminBasePath, openDrawer } = useAdminShell();
  const tone = SEVERITY_CLASS[finding.severity];

  const detail = interpolate(t(finding.detailKey), finding.detailVars ?? {});
  const fixLabel = finding.fixLabelKey
    ? t(finding.fixLabelKey)
    : t("dashboard.adminWebsite.health.fixIt");

  const onFix = finding.fixDrawer
    ? () => openDrawer(finding.fixDrawer!)
    : finding.fixHref
      ? () => router.push(`${adminBasePath}${finding.fixHref}`)
      : null;

  return (
    <li className="flex items-start gap-[10px] border-t border-admin-border-soft py-[10px] first:border-t-0 first:pt-0">
      <span
        className={`mt-[6px] size-[7px] shrink-0 rounded-full ${tone.dot}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-[6px]">
          <span className="text-admin-13 font-semibold text-admin-ink">
            {t(finding.titleKey)}
          </span>
          <span className={`text-admin-11 font-semibold uppercase tracking-wide ${tone.text}`}>
            {t(SEVERITY_LABEL_KEY[finding.severity])}
          </span>
          {finding.infoTipKey ? (
            <InfoTip
              label={t(finding.infoTipKey)}
              triggerLabel={t("dashboard.adminWebsite.health.whatIsThis")}
              placement="bottom-start"
              className="text-admin-ink-dim hover:text-admin-ink"
            />
          ) : null}
        </div>
        <p className="mt-[2px] text-admin-11h leading-relaxed text-admin-ink-muted">
          {detail}
        </p>
      </div>
      {onFix ? (
        <button
          type="button"
          onClick={onFix}
          className="shrink-0 rounded-admin-sm border border-admin-border bg-admin-card px-[10px] py-[4px] text-admin-11 font-semibold text-admin-ink hover:border-admin-border-soft"
        >
          {fixLabel}
        </button>
      ) : null}
    </li>
  );
}

/**
 * Renders nothing when the report is absent (prototype/fixture shell) or empty.
 * A healthy workspace still gets one row — the builder emits a single `ok`
 * finding for exactly that reason, so the panel collapses to one green line
 * instead of showing a box with nothing in it.
 */
export function WebsiteHealthPanel({
  report,
}: {
  report: WebsiteHealthReport | undefined;
}) {
  const t = useT();
  if (!report || report.findings.length === 0) return null;

  const { critical, warning, info } = report.counts;
  const summary =
    critical + warning + info === 0
      ? t("dashboard.adminWebsite.health.summaryAllClear")
      : interpolate(t("dashboard.adminWebsite.health.summaryCounts"), {
          critical,
          warning,
          info,
        });

  return (
    <section
      aria-label={t("dashboard.adminWebsite.health.heading")}
      className="mb-[18px] rounded-admin-lg border border-admin-border bg-admin-card p-[16px]"
    >
      <div className="mb-[8px] flex flex-wrap items-baseline gap-[8px]">
        <h2 className="m-0 text-admin-13 font-semibold text-admin-ink">
          {t("dashboard.adminWebsite.health.heading")}
        </h2>
        <span className="text-admin-11 text-admin-ink-muted">{summary}</span>
      </div>
      <ul className="m-0 list-none p-0">
        {report.findings.map((f) => (
          <HealthRow key={f.id} finding={f} />
        ))}
      </ul>
    </section>
  );
}
