import Link from "next/link";

import { CapabilityCard } from "./capability-card";
import {
  PLAN_COLOR,
  isLocked,
  type Plan,
  type TierBand as TierBandData,
} from "./capability-catalog";

/**
 * A single tier section: divider with badge + headline + helper, optional
 * upgrade CTA when the band is above the active plan, then a responsive grid
 * of capability cards.
 *
 * The "Every plan" band has no CTA. Paid bands above the active plan show
 * "Upgrade"; Network shows "Contact".
 */
export function TierBand({
  band,
  activePlan,
}: {
  band: TierBandData;
  activePlan: Plan;
}) {
  const accent = PLAN_COLOR[band.tier];
  const bandIsLocked = isLocked(band.tier, activePlan);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <span
          className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
          style={{
            backgroundColor: accent.bg,
            color: accent.fg,
          }}
        >
          {band.badgeLabel}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[17px] font-semibold tracking-tight text-foreground sm:text-lg">
            {band.headline}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {band.helper}
          </p>
        </div>
        {bandIsLocked && band.ctaLabel ? (
          <Link
            href={band.tier === "network" ? "mailto:hello@impronta.group" : "?plan=" + band.tier}
            className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-transform hover:-translate-y-px"
            style={{
              backgroundColor: accent.bg,
              color: accent.fg,
            }}
          >
            {band.ctaLabel}
          </Link>
        ) : null}
        <div
          aria-hidden
          className="hidden h-px flex-1 bg-border/50 sm:block"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {band.cards.map((card) => (
          <CapabilityCard
            key={card.id}
            capability={card}
            locked={bandIsLocked}
            activePlan={activePlan}
          />
        ))}
      </div>
    </section>
  );
}
