import type { MonthRollup as Rollup } from "@/lib/promos/results/compute";
import { money, resultsCopy, type Lang } from "@/lib/promos/results/copy";

/** "This month" card for the Promos page: bookings, earned and given together. */
export function MonthRollup(props: { rollup: Rollup; currency: string; lang: Lang }) {
  const { rollup: m, lang, currency } = props;
  const c = resultsCopy(lang);
  return (
    <section className="rounded-2xl border border-[var(--tc-border,#e5e5ea)] bg-white p-4" aria-label={c.month}>
      <h3 className="text-sm font-medium text-[var(--tc-ink,#1c1c1e)]">{c.month}</h3>
      <dl className="mt-3 grid grid-cols-[repeat(3,minmax(0,1fr))] gap-3">
        <div>
          <dd className="text-lg font-semibold tabular-nums text-[var(--tc-ink,#1c1c1e)]">{m.bookings}</dd>
          <dt className="text-xs text-[var(--tc-muted,#6b6b73)]">{c.bookings(m.bookings)}</dt>
        </div>
        <div>
          <dd className="text-lg font-semibold tabular-nums text-[var(--tc-ink,#1c1c1e)]">{money(m.earnedCents, currency, lang)}</dd>
          <dt className="text-xs text-[var(--tc-muted,#6b6b73)]">{c.earned}</dt>
        </div>
        <div>
          <dd className="text-lg font-semibold tabular-nums text-[var(--tc-ink,#1c1c1e)]">{money(m.givenCents, currency, lang)}</dd>
          <dt className="text-xs text-[var(--tc-muted,#6b6b73)]">{c.given}</dt>
        </div>
      </dl>
    </section>
  );
}
