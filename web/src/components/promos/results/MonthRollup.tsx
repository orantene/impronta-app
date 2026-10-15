import type { MonthRollup as Rollup } from "@/lib/promos/results/compute";
import { money, resultsCopy, type Lang } from "@/lib/promos/results/copy";

/** "This month" card for the Promos page: bookings, earned and given together. */
export function MonthRollup(props: { rollup: Rollup; currency: string; lang: Lang }) {
  const { rollup: m, lang, currency } = props;
  const c = resultsCopy(lang);
  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-label={c.month}>
      <h3 className="text-sm font-medium text-foreground">{c.month}</h3>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <dd className="text-lg font-semibold tabular-nums text-foreground">{m.bookings}</dd>
          <dt className="text-xs text-muted-foreground">{c.bookings(m.bookings)}</dt>
        </div>
        <div>
          <dd className="text-lg font-semibold tabular-nums text-foreground">{money(m.earnedCents, currency, lang)}</dd>
          <dt className="text-xs text-muted-foreground">{c.earned}</dt>
        </div>
        <div>
          <dd className="text-lg font-semibold tabular-nums text-foreground">{money(m.givenCents, currency, lang)}</dd>
          <dt className="text-xs text-muted-foreground">{c.given}</dt>
        </div>
      </dl>
    </section>
  );
}
