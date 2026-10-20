import { channelCopy, channelKey, type ChannelEarnings, type WhereSoldRow } from "@/lib/talent/service-hub-channels";
import { shareLine, workModelLabel, type Appearance } from "@/lib/talent/service-hub-channels-rows";
import type { ServiceChannels } from "@/lib/talent/service-hub-channels.server";

import { LowestPriceField } from "./LowestPriceField";

function money(cents: number | null, currency: string, locale: string): string {
  if (cents == null) return "";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

const pct = (bps: number | null) => (bps == null ? "" : `${Number((bps / 100).toFixed(2))}%`);

function channelName(r: Pick<WhereSoldRow, "channel">, c: ReturnType<typeof channelCopy>): string {
  return r.channel.kind === "my_site" ? c.mySite : r.channel.kind === "hub" ? c.hub : r.channel.name;
}

const UNKNOWN = "–";

/** "Where it's sold": every channel of one service, with what the talent gets on each. */
export function WhereItsSoldPanel(props: { data: ServiceChannels; locale: string }) {
  const c = channelCopy(props.locale);
  const { service } = props.data;
  return (
    <section aria-label={`${c.whereSold}: ${service.title}`} data-testid="where-sold" className="flex flex-col gap-2">
      <h3 className="m-0 text-base font-semibold">
        {c.whereSold} · {service.title}
      </h3>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {props.data.rows.map((r) => (
          <li key={channelKey(r.channel)} className="flex flex-col gap-1 rounded-lg border px-3 py-2" data-channel={channelKey(r.channel)}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{channelName(r, c)}</span>
              <span className="text-sm">
                {money(r.listPriceCents, service.currency, props.locale)} · {c.youGet}{" "}
                {r.youGetCents == null ? UNKNOWN : money(r.youGetCents, service.currency, props.locale)}
              </span>
            </div>
            {r.status === "offered" ? <span className="text-sm">{c.offered}</span> : null}
            {r.belowMinimum ? <span role="status" className="text-sm">{c.belowMinimum}</span> : null}
            {r.channel.kind === "workspace" && r.listingId ? (
              <LowestPriceField
                listingId={r.listingId}
                initialCents={r.minAcceptCents}
                copy={{ label: c.lowestPrice, save: c.save, saved: c.saved, failed: c.saveFailed, notReady: c.notReady }}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Where you appear": each workspace, its model and its share. */
export function WhereYouAppearPanel(props: { items: readonly Appearance[]; locale: string; }) {
  const c = channelCopy(props.locale);
  if (props.items.length === 0) return null;
  return (
    <section aria-label={c.whereAppear} data-testid="where-appear" className="flex flex-col gap-2">
      <h2 className="m-0 text-lg font-semibold">{c.whereAppear}</h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {props.items.map((a) => (
          <li key={a.tenantId} className="flex flex-col gap-1 rounded-lg border px-3 py-2">
            <span className="font-medium">
              {a.name}
              {a.state === "pending" ? ` · ${c.pending}` : ""}
            </span>
            <span className="text-sm">
              {workModelLabel(a.workModel, props.locale)} · {shareLine(a, props.locale)}
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-sm">{c.leaveKeepsJobs}</p>
    </section>
  );
}

/** "Earnings by channel": each channel's net and the share she keeps. */
export function EarningsByChannelCard(props: { items: readonly ChannelEarnings[]; currency: string; locale: string }) {
  const c = channelCopy(props.locale);
  if (props.items.length === 0) return null;
  return (
    <section aria-label={c.earningsByChannel} data-testid="earnings-by-channel" className="flex flex-col gap-2">
      <h2 className="m-0 text-lg font-semibold">{c.earningsByChannel}</h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {props.items.map((e) => (
          <li key={e.key} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2" data-channel={e.key}>
            <span className="font-medium">{e.kind === "my_site" ? c.mySite : e.kind === "hub" ? c.hub : e.kind === "other" ? c.other : e.name}</span>
            <span className="text-sm">
              {money(e.netCents, props.currency, props.locale)}
              {e.youKeepBps == null ? "" : ` · ${c.youKeep} ${pct(e.youKeepBps)}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
