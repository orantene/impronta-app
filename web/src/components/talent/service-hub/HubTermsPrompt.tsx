/**
 * TUL-1368 · Terms card: shown at the top of the talent dashboard while a workspace's
 * terms wait for the talent's answer (first join via invite, Discover or a direct add,
 * and every later change). Server component; the two buttons are plain form posts.
 *
 * Desktop: card max 640px wide, lines in a two-column grid. 390: one column, buttons
 * full width and stacked (min 44px tap height).
 */
import { createTranslator } from "@/i18n/messages";
import { withInterpolation } from "@/i18n/interpolate";
import { loadPendingHubTermsForTalent } from "@/lib/service-hub/terms.server";
import { respondToHubTermsFormAction } from "@/lib/service-hub/terms-actions";
import { buildTermsCardLines } from "@/lib/service-hub/terms";

export async function HubTermsPrompt({ talentProfileId, locale }: { talentProfileId: string; locale: string }) {
  const items = await loadPendingHubTermsForTalent(talentProfileId);
  if (items.length === 0) return null;
  const t = withInterpolation(createTranslator(locale));
  const k = (key: string, values?: Record<string, string | number>) => t(`dashboard.serviceHubTerms.${key}`, values);

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-4 pt-4" data-testid="hub-terms-prompt">
      {items.map(({ pending, hasTermsInForce, workspaceName }) => {
        const lines = buildTermsCardLines(pending, locale);
        const titleId = `hub-terms-${pending.id}`;
        return (
          <section
            key={pending.id}
            aria-labelledby={titleId}
            className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5"
          >
            <h2 id={titleId} className="text-base font-semibold text-foreground">
              {k(hasTermsInForce ? "titleChanged" : "title", { workspace: workspaceName })}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasTermsInForce ? k("introChanged") : k("intro", { workspace: workspaceName })}
            </p>
            <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(0,180px)_1fr]">
              {lines.map((line) => (
                <div key={line.key} className="contents">
                  <dt className="font-medium text-muted-foreground">{line.label}</dt>
                  <dd className="text-foreground">{line.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">{k("version", { version: pending.version })}</p>
            <form action={respondToHubTermsFormAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <input type="hidden" name="termsId" value={pending.id} />
              <button
                type="submit"
                name="answer"
                value="decline"
                className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
              >
                {k("decline")}
              </button>
              <button
                type="submit"
                name="answer"
                value="accept"
                className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90"
              >
                {k("accept")}
              </button>
            </form>
          </section>
        );
      })}
    </div>
  );
}
