import Link from "next/link";
import type { PromoResult, Tip } from "@/lib/promos/results/compute";
import { money, resultsCopy, soldOutText, tipText, type Lang } from "@/lib/promos/results/copy";

/**
 * One card per promo. Earned and given are always side by side. Presentational:
 * the page loads `PromoResult` + tips and passes them in. `runAgainHref` is optional
 * so the PR2 page decides where "Repetir" goes. Free trial shows its single card via the same component.
 */
export function PromoResultsCard(props: {
  name: string;
  result: PromoResult;
  tips?: readonly Tip[];
  currency: string;
  lang: Lang;
  runAgainHref?: string;
}) {
  const { result: r, lang, currency } = props;
  const c = resultsCopy(lang);
  const sold = soldOutText(r, lang);
  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-label={props.name}>
      <h3 className="text-sm font-medium text-foreground">{props.name}</h3>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        <Stat value={String(r.bookings)} label={c.bookings(r.bookings)} />
        <Stat value={money(r.earnedCents, currency, lang)} label={c.earned} />
        <Stat value={money(r.givenCents, currency, lang)} label={c.given} />
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        {r.newClients} {c.newClients(r.newClients)} · {r.returningClients + r.lapsedClients} {c.returning(r.returningClients + r.lapsedClients)}
        {r.linkOpens > 0 ? ` · ${r.linkOpens} ${c.opens}` : ""}
        {r.giftedCents > 0 ? ` · ${money(r.giftedCents, currency, lang)} ${c.gifted}` : ""}
      </p>
      {sold ? <p className="mt-2 text-sm text-foreground">{sold}</p> : null}
      {(props.tips ?? []).slice(0, 1).map((t) => (
        <p key={t.id} className="mt-2 text-xs text-muted-foreground">{tipText(t.id, lang)}</p>
      ))}
      {props.runAgainHref ? (
        <Link href={props.runAgainHref} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-4">
          {c.runAgain}
        </Link>
      ) : null}
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dd className="text-lg font-semibold tabular-nums text-foreground">{value}</dd>
      <dt className="text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}
