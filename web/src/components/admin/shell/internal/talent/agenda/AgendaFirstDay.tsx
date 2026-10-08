"use client";

import { TALENT_AGENDA_VARS } from "./primitives";
import { useAgendaCopy } from "./use-agenda-copy";
import { nextFirstDayStep, type FirstDayStepId } from "@/lib/talent-agenda/first-day";

const STEPS = [
  { id: "photo", label: "Add a photo" },
  { id: "services", label: "Add a service" },
  { id: "location", label: "Add where you work" },
  { id: "availability", label: "Set availability" },
  { id: "preview", label: "Preview your page" },
  { id: "website", label: "Create your website" },
] as const;

/**
 * T4.3 First-day Today readiness. One number drives ring, chip, and CTA copy.
 */
export function AgendaFirstDay({
  completedStepIds,
  liveSiteUrl,
  onOpenAvailability,
  onOpenServices,
  onOpenSite,
  onOpenProfile,
  onEditSite,
}: {
  completedStepIds: string[];
  /** Kept for callers; the main button now follows the next step. */
  hasAvailability?: boolean;
  liveSiteUrl?: string | null;
  onOpenAvailability: () => void;
  onOpenServices: () => void;
  onOpenSite: () => void;
  /** Profile editor: where photos and work location are set. */
  onOpenProfile?: () => void;
  onEditSite?: () => void;
}) {
  const copy = useAgendaCopy();
  const done = STEPS.filter((s) => completedStepIds.includes(s.id)).length;
  const pct = Math.round((done / STEPS.length) * 100);
  const next = nextFirstDayStep(completedStepIds);
  const targetFor = (id: FirstDayStepId): (() => void) | undefined => {
    if (id === "availability") return onOpenAvailability;
    if (id === "services") return onOpenServices;
    if (id === "photo" || id === "location") return onOpenProfile;
    return onOpenSite;
  };
  const nextTarget = next ? targetFor(next.id) : undefined;
  const hostLabel = liveSiteUrl
    ? liveSiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : null;

  return (
    <div style={TALENT_AGENDA_VARS} className="space-y-4">
      <section className="rounded-2xl border border-black/8 bg-white p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div
            className="relative grid h-20 w-20 place-items-center rounded-full bg-[conic-gradient(var(--tc-accent)_var(--ready-pct),#e8e8e3_0)]"
            style={{ "--ready-pct": `${pct}%` }}
            aria-label={`${copy.t("Readiness")} ${done} of ${STEPS.length}`}
          >
            <div className="grid h-14 w-14 place-items-center rounded-full bg-white text-[15px] font-semibold text-[var(--tc-primary)]">
              {done}/{STEPS.length}
            </div>
          </div>
          <div>
            <p className="inline-flex rounded-full bg-[rgba(59,76,202,0.08)] px-3 py-1 text-[12.5px] font-medium text-[var(--tc-accent)]">
              {pct}% {copy.t("ready")}
            </p>
            <h1 className="mt-2 text-[24px] font-semibold text-[var(--tc-primary)]">
              {copy.t("Set up your day")}
            </h1>
            <p className="mt-1 text-[14px] text-[#5F6368]">
              {copy.t("Requests need a service and a location. Booking a time also needs availability.")}
            </p>
          </div>
        </div>

        <ol className="mt-5 space-y-2">
          {STEPS.map((step) => {
            const complete = completedStepIds.includes(step.id);
            return (
              <li
                key={step.id}
                className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-black/5 px-3 py-2 text-[14px]"
              >
                <span className={complete ? "text-[#1F5C42]" : "text-[var(--tc-primary)]"}>
                  {complete ? "✓ " : `${STEPS.indexOf(step) + 1}. `}
                  {copy.t(step.label)}
                </span>
                {!complete && targetFor(step.id) ? (
                  <button type="button" className="text-[13px] text-[var(--tc-accent)]" onClick={targetFor(step.id)}>
                    {copy.t("Open")}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>

        {next === null ? (
          <button
            type="button"
            onClick={onOpenSite}
            className="mt-4 min-h-[44px] w-full rounded-full bg-[var(--tc-action)] hover:bg-[var(--tc-action-hover)] px-4 text-[14px] text-white"
          >
            {copy.t("Create your website")}
          </button>
        ) : (
          <button
            type="button"
            onClick={nextTarget}
            disabled={!nextTarget}
            className="mt-4 min-h-[44px] w-full rounded-full bg-[var(--tc-action)] hover:bg-[var(--tc-action-hover)] px-4 text-[14px] text-white disabled:opacity-50"
          >
            {copy.t(next.label)}
          </button>
        )}
      </section>

      {hostLabel && liveSiteUrl ? (
        <section className="rounded-2xl border border-black/8 bg-white p-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--tc-accent)]">
            {copy.t("Live")}
          </p>
          <h2 className="mt-1 text-[16px] font-semibold text-[var(--tc-primary)]">
            {copy.t("Your page is live")}
          </h2>
          <p className="mt-1 text-[13.5px] text-[#5F6368]">{hostLabel}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={liveSiteUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[44px] items-center rounded-full bg-[var(--tc-action)] hover:bg-[var(--tc-action-hover)] px-4 text-[13px] font-medium text-white"
            >
              {copy.t("View")}
            </a>
            <button
              type="button"
              onClick={onEditSite ?? onOpenSite}
              className="min-h-[44px] rounded-full border border-black/10 px-4 text-[13px] font-medium text-[var(--tc-primary)]"
            >
              {copy.t("Edit")}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
