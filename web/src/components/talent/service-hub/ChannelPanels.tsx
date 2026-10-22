import { channelCopy, channelKey, type ChannelEarnings, type WhereSoldRow } from "@/lib/talent/service-hub-channels";
import type { ChannelCalendarRow } from "@/lib/talent/service-hub-calendar";
import { shareLine, workModelLabel, type Appearance } from "@/lib/talent/service-hub-channels-rows";
import type { ServiceChannels } from "@/lib/talent/service-hub-channels.server";

import { LeaveWorkspaceButton } from "./LeaveWorkspaceButton";
import { FeeNote } from "./FeeNote";
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
                {r.youGetCents == null ? UNKNOWN : money(r.youGetCents, service.currency, props.locale)}{" "}
                <FeeNote text={c.feeNote} />
              </span>
            </div>
            {r.status === "offered" ? <span className="text-sm">{c.offered}</span> : null}
            {r.belowMinimum ? <span role="status" className="text-sm">{c.belowMinimum}</span> : null}
            {r.channel.kind === "workspace" && r.listingId ? (
              <LowestPriceField
                listingId={r.listingId}
                initialCents={r.minAcceptCents}
                currency={service.currency}
                locale={props.locale}
                copy={{ label: c.lowestPrice, save: c.save, saved: c.saved, failed: c.saveFailed, notReady: c.notReady, aboveListing: c.aboveListing }}
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
            <LeaveWorkspaceButton tenantId={a.tenantId} name={a.name} locale={props.locale} />
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
              {e.youKeepBps == null ? "" : ` · ${c.youKeep} ${pct(e.youKeepBps)}`}{" "}
              <FeeNote text={c.feeNote} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function when(iso: string, timeZone: string | undefined, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** "Calendar by channel": every upcoming hold and booking, and which channel placed it. */
export function CalendarByChannelPanel(props: { result: { ok: true; rows: readonly ChannelCalendarRow[] } | { ok: false }; locale: string; timeZone?: string }) {
  const c = channelCopy(props.locale);
  return (
    <section aria-label={c.calendarByChannel} data-testid="calendar-by-channel" className="flex flex-col gap-2">
      <h2 className="m-0 text-lg font-semibold">{c.calendarByChannel}</h2>
      {!props.result.ok ? (
        <p role="alert" className="m-0 text-sm">{c.calendarFailed}</p>
      ) : props.result.rows.length === 0 ? (
        <p className="m-0 text-sm">{c.noUpcoming}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {props.result.rows.map((r) => (
            <li key={`${r.kind}-${r.id}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2" data-channel={r.channelType}>
              <span className="flex flex-col">
                <span className="font-medium">
                  {r.channelType === "mine" ? r.title : c.bookedVia.replace("{name}", r.channelName ?? c.anotherWorkspace)}
                </span>
                <span className="text-sm">{when(r.startsAt, props.timeZone, props.locale)}</span>
              </span>
              <span className="text-right text-sm">
                {r.channelType === "mine" ? c.mySiteHub : (r.channelName ?? c.anotherWorkspace)}
                <br />
                {r.kind === "hold" ? `${c.hold}${r.holdStrength ? ` · ${r.holdStrength === "firm" ? c.firm : c.soft}` : ""}` : c.booking}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
