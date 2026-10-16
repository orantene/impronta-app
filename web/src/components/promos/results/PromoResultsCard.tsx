import Link from "next/link";
import { Camera, Circle, Globe, Link2, Mail, MessageCircle, Music2, QrCode, Ticket, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { PromoResult, Tip } from "@/lib/promos/results/compute";
import { money, resultsCopy, soldOutText, tipText, type Lang } from "@/lib/promos/results/copy";
import { formatSources, type SourceIcon } from "@/lib/promos/results/sources";

const SOURCE_ICON: Record<SourceIcon, LucideIcon> = {
  instagram: Camera, tiktok: Music2, whatsapp: MessageCircle, qr: QrCode, link: Link2, email: Mail, code: Ticket, site: Globe, other: Circle,
};

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
  /** Drop the heading when the surrounding sheet already shows the promo name. */
  hideTitle?: boolean;
  /** Optional progress block (bar + used line) rendered first, so one card carries everything. */
  progress?: ReactNode;
}) {
  const { result: r, lang, currency } = props;
  const c = resultsCopy(lang);
  const sold = soldOutText(r, lang);
  const sources = formatSources(r.bySource, lang);
  return (
    <section className="rounded-2xl border border-[var(--tc-border,#e5e5ea)] bg-white p-4" aria-label={props.name}>
      {props.hideTitle ? null : <h3 className="text-sm font-medium text-[var(--tc-ink,#1c1c1e)]">{props.name}</h3>}
      {props.progress ? <div className="flex flex-col gap-2">{props.progress}</div> : null}
      <dl className={`${props.hideTitle && !props.progress ? "" : "mt-3 "}grid grid-cols-[repeat(3,minmax(0,1fr))] gap-3`}>
        <Stat value={String(r.bookings)} label={c.bookings(r.bookings)} />
        <Stat value={money(r.earnedCents, currency, lang)} label={c.earned} />
        <Stat value={money(r.givenCents, currency, lang)} label={c.given} />
      </dl>
      <p className="mt-3 text-xs text-[var(--tc-muted,#6b6b73)]">
        {r.newClients} {c.newClients(r.newClients)} · {r.returningClients + r.lapsedClients} {c.returning(r.returningClients + r.lapsedClients)}
        {r.linkOpens > 0 ? ` · ${r.linkOpens} ${c.opens}` : ""}
        {r.giftedCents > 0 ? ` · ${money(r.giftedCents, currency, lang)} ${c.gifted}` : ""}
      </p>
      {sources.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1" aria-label={c.sources}>
          {sources.map((s) => {
            const Icon = SOURCE_ICON[s.key];
            return (
              <li key={s.key} className="inline-flex items-center gap-1 text-xs text-[var(--tc-muted,#6b6b73)]" title={s.label}>
                <Icon className="size-3.5" aria-hidden />
                <span className="tabular-nums text-[var(--tc-ink,#1c1c1e)]">{s.count}</span>
                <span className="sr-only">{s.label}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {sold ? <p className="mt-2 text-sm text-[var(--tc-ink,#1c1c1e)]">{sold}</p> : null}
      {(props.tips ?? []).slice(0, 1).map((t) => (
        <p key={t.id} className="mt-2 text-xs text-[var(--tc-muted,#6b6b73)]">{tipText(t.id, lang)}</p>
      ))}
      {props.runAgainHref ? (
        <Link href={props.runAgainHref} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-[var(--tc-ink,#1c1c1e)] underline underline-offset-4">
          {c.runAgain}
        </Link>
      ) : null}
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <dd className="break-words text-lg font-semibold tabular-nums text-[var(--tc-ink,#1c1c1e)]">{value}</dd>
      <dt className="text-xs text-[var(--tc-muted,#6b6b73)]">{label}</dt>
    </div>
  );
}
