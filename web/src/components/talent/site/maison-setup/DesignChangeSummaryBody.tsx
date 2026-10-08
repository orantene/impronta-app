/**
 * Shared "What changes / What stays" block for a design switch. Presentational
 * only: used by PublishDesignDialog (Maison setup, publishes) and the Manager
 * theme gallery's draft-only confirm (TUL-321). One copy, never forked.
 */
import type { LiveDesignChangeSummary } from "./live-design-change";
import type { MaisonSetupLocale } from "./maison-setup-copy";

export function DesignChangeSummaryBody({
  locale,
  summary,
}: {
  locale: MaisonSetupLocale;
  summary: LiveDesignChangeSummary;
}) {
  const es = locale === "es";
  return (
    <>
        <p className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-admin-ink-dim">
          {es ? "Qué cambia" : "What changes"}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-admin-ink" data-testid="maison-design-changes">
          {summary.changes}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-admin-ink" data-testid="maison-design-colors-note">
          {summary.colorsNote}
        </p>

        <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-admin-ink-dim">
          {es ? "Qué se queda" : "What stays"}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-admin-ink-muted" data-testid="maison-design-stays">
          {summary.stays}
        </p>
    </>
  );
}
