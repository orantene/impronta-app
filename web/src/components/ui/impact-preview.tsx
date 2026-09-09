/**
 * ImpactPreview — renders what `@/lib/impact/model` decided, and nothing else.
 *
 * WHY THE JUDGEMENT IS NOT IN HERE. Every question this component could get
 * wrong (is the confirm allowed, is an empty preview safe, may two currencies
 * be added) is answered by a tested pure function next door. What is left is
 * markup, which is exactly how much of a destructive-confirmation surface
 * should be un-unit-testable.
 *
 * SERVER-RENDERABLE, NO STATE. Callers are drawers and dialogs that already
 * hold the impact; a `"use client"` here would drag every one of them across
 * the boundary for no interactivity at all. The caller owns the confirm
 * control and asks `impactIsConfirmable` whether to enable it — this component
 * deliberately renders no button, because a preview that also confirms is a
 * preview an operator can dismiss by confirming.
 *
 * THE UNAVAILABLE STATE IS LOUD ON PURPOSE. It uses the same visual weight as
 * a blocker, not the muted grey of an empty list, because the two failure
 * modes it protects against — a timed-out availability read and a failed price
 * lookup — both produce a preview that LOOKS calm while knowing nothing.
 */

import * as React from "react";

import {
  formatImpactAmount,
  groupImpact,
  impactMoneyIsAttributable,
  impactMoneyTotals,
  type Impact,
  type ImpactChannel,
} from "@/lib/impact/model";
import { cn } from "@/lib/utils";

const CHANNEL_LABEL: Record<ImpactChannel, string> = {
  money: "Money",
  allocation: "Allocation",
  promise: "Guest promise",
  message: "Messages",
};

export interface ImpactPreviewProps {
  readonly impact: Impact;
  /**
   * The heading. Defaults to a description of the component's job rather than
   * of the action, because the caller's dialog title already names the action
   * and repeating it costs a line an operator then skips.
   */
  readonly heading?: string;
  /**
   * Shown when the impact is `ready` with no effects. The caller knows what
   * "nothing happens" means in its own context ("this booking has no deposit
   * to release"); the generic fallback is deliberately flat rather than
   * reassuring.
   */
  readonly emptyLabel?: string;
  readonly locale?: string;
  readonly className?: string;
}

export function ImpactPreview({
  impact,
  heading = "What this will do",
  emptyLabel = "No money, allocation, promise or message changes.",
  locale = "en",
  className,
}: ImpactPreviewProps) {
  return (
    <section
      className={cn("rounded-lg border border-border/60 bg-muted/20 p-4", className)}
      aria-label={heading}
      data-impact-status={impact.status}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {heading}
      </h3>
      {impact.status === "unavailable" ? (
        <ImpactUnavailable reason={impact.reason} />
      ) : (
        <ImpactBody impact={impact} emptyLabel={emptyLabel} locale={locale} />
      )}
    </section>
  );
}

function ImpactUnavailable({ reason }: { reason: string }) {
  return (
    <p
      // `role="alert"` and not `status`: this is the branch where the operator
      // is about to act on information we do not have.
      role="alert"
      className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {reason}
    </p>
  );
}

function ImpactBody({
  impact,
  emptyLabel,
  locale,
}: {
  impact: Extract<Impact, { status: "ready" }>;
  emptyLabel: string;
  locale: string;
}) {
  const groups = groupImpact(impact.effects);
  const totals = impactMoneyTotals(impact.effects);
  const totalsAreWhole = impactMoneyIsAttributable(impact.effects);

  return (
    <>
      {impact.blockers.length > 0 ? (
        // `role="alert"` sits on the WRAPPER, not on the <ul>. Putting it on
        // the list overrides the implicit `list` role, which orphans every
        // <li> — the list stops being announced as a list of N items and each
        // blocker loses its position. The axe lane caught exactly that here.
        <div role="alert">
          <ul className="mt-3 space-y-2">
            {impact.blockers.map((blocker, index) => (
              <li
                key={`${blocker.summary}-${index}`}
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <span className="font-medium">{blocker.summary}</span>
                {blocker.detail ? (
                  <span className="mt-0.5 block text-destructive/80">{blocker.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {groups.map((group) => (
            <div key={group.channel}>
              <h4 className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground/80">
                {CHANNEL_LABEL[group.channel]}
              </h4>
              <ul className="mt-1 space-y-1">
                {group.effects.map((effect, index) => (
                  <li key={`${effect.summary}-${index}`} className="flex gap-3 text-sm">
                    <span className="flex-1">
                      {effect.summary}
                      {effect.detail ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {effect.detail}
                        </span>
                      ) : null}
                    </span>
                    {typeof effect.amountCents === "number" && effect.currency ? (
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatImpactAmount(effect.amountCents, effect.currency, locale)}
                      </span>
                    ) : typeof effect.count === "number" ? (
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        ×{effect.count}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {totals.length > 0 && totalsAreWhole ? (
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-border/60 pt-3">
          {totals.map((total) => (
            <div key={total.currency} className="flex gap-2 text-sm">
              <dt className="text-muted-foreground">Net {total.currency}</dt>
              <dd className="font-medium tabular-nums">
                {formatImpactAmount(total.amountCents, total.currency, locale)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {totals.length > 0 && !totalsAreWhole ? (
        <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          No net total: one of the amounts above has no currency, so any sum would
          be short.
        </p>
      ) : null}
    </>
  );
}
