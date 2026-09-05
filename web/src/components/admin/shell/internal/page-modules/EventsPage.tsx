"use client";

/**
 * Events & Ticketing — the Events tab.
 *
 * Replaces the placeholder shipped with the segment (#1683). Reads through
 * `loadWorkspaceEvents`, which resolves the tenant from the SESSION and never
 * from a parameter, and shapes with the pure modules in `lib/events/`.
 *
 * Rendered inside the shell's own <main>, so this returns a fragment. Token
 * classes only — inline styles are frozen under components/admin/shell.
 *
 * TWO TABS ARE EMPTY BY DESIGN AND SAY SO. Seating has no seat maps until
 * Spaces S4/S5 (wave E, behind this area) and Door needs the public path, which
 * is gated on the surface-allow-list decomposition. A tab that renders nothing
 * teaches an operator the feature is broken; a tab that says what it is waiting
 * for teaches them it is not built yet, which is the truth.
 *
 * SALES SHOWS NO NUMBERS ON PURPOSE. See `_events-actions.ts`: availability is
 * derived from `capacity_allocations`, and the single authority for that
 * derivation returns one integer for one pool. Computing sold/held here would be
 * a second implementation of the availability rule on a money screen, and a
 * "212 left" that disagrees with what the public picker refuses is how a venue
 * oversells a room and finds out at a door.
 */

import { useCallback, useEffect, useState } from "react";

import {
  loadWorkspaceEvents,
  type EventListRow,
  type EventTierRow,
} from "@/app/(workspace)/[tenantSlug]/admin/_events-actions";
import { PageHeader } from "./pages-shared";

const TABS = [
  "details",
  "sessions",
  "tickets",
  "seating",
  "lineup",
  "sales",
  "door",
] as const;
type TabKey = (typeof TABS)[number];

const TAB_LABEL: Record<TabKey, string> = {
  details: "Details",
  sessions: "Sessions",
  tickets: "Tickets",
  seating: "Seating",
  lineup: "Lineup",
  sales: "Sales",
  door: "Door",
};

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * A session time, in the VENUE'S zone and never the reader's.
 *
 * `toLocaleString(undefined, …)` takes the BROWSER's zone, so a Cancún venue
 * opened by an owner in Madrid would be told the wrong night — worst at a late
 * doors time that crosses midnight in the reader's zone, which is exactly when
 * somebody is checking. An instant formatted without a named zone silently
 * becomes the reader's wall clock.
 */
function whenLabel(iso: string | null, timeZone: string): string {
  if (!iso) return "No date yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No date yet";
  try {
    return d.toLocaleString(undefined, {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    // An unusable zone must not take the screen down, and must not silently
    // answer in the reader's zone either — so it says which zone it could not use.
    return `${d.toISOString()} (zone ${timeZone} unusable)`;
  }
}

function StatusPill({ status }: { status: EventListRow["status"] }) {
  const tone =
    status === "published"
      ? "bg-admin-accent-soft text-admin-accent"
      : status === "cancelled"
        ? "bg-admin-surface-alt text-admin-red"
        : "bg-admin-surface-alt text-admin-ink-muted";
  return (
    <span className={`rounded-[6px] px-[8px] py-[2px] text-[11.5px] font-semibold ${tone}`}>
      {status}
    </span>
  );
}

/** A tab with no engine behind it yet. Says what it waits on, never "coming soon". */
function NotBuiltYet({ what, waitingOn }: { what: string; waitingOn: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-admin-border-soft p-[20px]">
      <div className="text-[14px] font-semibold text-admin-ink">{what}</div>
      <p className="mt-[6px] max-w-[520px] text-[13px] leading-[1.5] text-admin-ink-muted">
        {waitingOn}
      </p>
    </div>
  );
}

function TierRow({ tier }: { tier: EventTierRow }) {
  const stateLabel = tier.onSale
    ? "On sale"
    : tier.saleReason === "scheduled"
      ? "Scheduled"
      : tier.saleReason === "hidden"
        ? "Hidden — sold by link"
        : "Ended";
  return (
    <div className="flex items-center justify-between gap-[12px] border-t border-admin-border-soft py-[10px] first:border-t-0">
      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-medium text-admin-ink">{tier.label}</div>
        <div className="mt-[2px] text-[12px] text-admin-ink-muted">
          {money(tier.amountCents)}
          {tier.admitsPerUnit > 1 ? ` · admits ${tier.admitsPerUnit}` : null}
          {tier.maxPerOrder ? ` · max ${tier.maxPerOrder} per order` : null}
          {tier.seatingMode === "space_group" ? " · table group" : null}
        </div>
      </div>
      <span className="shrink-0 text-[12px] text-admin-ink-muted">{stateLabel}</span>
    </div>
  );
}

export function EventsPage() {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; events: EventListRow[] }
  >({ kind: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("details");

  const load = useCallback(() => {
    setState({ kind: "loading" });
    void loadWorkspaceEvents().then((res) => {
      if (res.ok) {
        setState({ kind: "ready", events: res.events });
        setSelectedId((prev) => prev ?? res.events[0]?.id ?? null);
      } else {
        // The refusal is shown, not swallowed. A blank list that means "you are
        // not allowed" is indistinguishable from one that means "none yet".
        setState({ kind: "error", message: res.error });
      }
    });
  }, []);

  useEffect(load, [load]);

  const header = (
    <PageHeader title="Events" subtitle="Ticketed events: tiers, lineup, sales, and the door." />
  );

  if (state.kind === "loading") {
    return (
      <>
        {header}
        <div className="text-[13.5px] text-admin-ink-muted">Loading events…</div>
      </>
    );
  }

  if (state.kind === "error") {
    return (
      <>
        {header}
        <div className="max-w-[560px] rounded-[10px] border border-admin-border-soft bg-admin-surface-alt p-[16px]">
          <div className="text-[13.5px] font-semibold text-admin-red">
            Events could not be loaded
          </div>
          <p className="mt-[4px] text-[13px] text-admin-ink-muted">{state.message}</p>
        </div>
      </>
    );
  }

  const events = state.events;

  if (events.length === 0) {
    return (
      <>
        {header}
        <div className="max-w-[560px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[24px]">
          <div className="text-[15px] font-semibold text-admin-ink">No events yet</div>
          <p className="mt-[8px] text-[13.5px] leading-[1.5] text-admin-ink-muted">
            An event is a night you sell: one or more sessions, ticket tiers, and a
            lineup. Nothing here creates one yet — the engine is live and the
            create flow is the next slice.
          </p>
        </div>
      </>
    );
  }

  const selected = events.find((e) => e.id === selectedId) ?? events[0];

  return (
    <>
      {header}
      <div className="flex flex-col gap-[16px] lg:flex-row">
        {/* The list */}
        <nav className="w-full shrink-0 lg:w-[280px]" aria-label="Events">
          <ul className="flex flex-col gap-[4px]">
            {events.map((e) => {
              const active = e.id === selected?.id;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(e.id)}
                    aria-current={active ? "true" : undefined}
                    className={`w-full rounded-[8px] px-[12px] py-[10px] text-left ${
                      active ? "bg-admin-surface-alt" : "hover:bg-admin-surface-alt"
                    }`}
                  >
                    <div className="flex items-center gap-[8px]">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-admin-ink">
                        {e.title}
                      </span>
                      <StatusPill status={e.status} />
                    </div>
                    <div className="mt-[3px] text-[12px] text-admin-ink-muted">
                      {e.runFinished ? "Run finished" : whenLabel(e.nextSessionAt, e.timeZone)}
                      {e.sessionCount > 1 ? ` · ${e.sessionCount} sessions` : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* The selected event */}
        <section className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-[2px] border-b border-admin-border-soft">
            {TABS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                aria-current={tab === k ? "page" : undefined}
                className={`px-[12px] py-[8px] text-[13px] font-medium ${
                  tab === k
                    ? "border-b-2 border-admin-accent text-admin-ink"
                    : "text-admin-ink-muted hover:text-admin-ink"
                }`}
              >
                {TAB_LABEL[k]}
              </button>
            ))}
          </div>

          <div className="pt-[16px]">
            {tab === "details" && selected ? (
              <dl className="grid max-w-[560px] grid-cols-[160px_1fr] gap-x-[16px] gap-y-[10px] text-[13.5px]">
                <dt className="text-admin-ink-muted">Status</dt>
                <dd className="text-admin-ink">{selected.status}</dd>
                <dt className="text-admin-ink-muted">Sold as</dt>
                <dd className="text-admin-ink">{selected.admissionKind}</dd>
                <dt className="text-admin-ink-muted">Next session</dt>
                <dd className="text-admin-ink">
                  {selected.runFinished
                    ? "Run finished — every session is past"
                    : whenLabel(selected.nextSessionAt, selected.timeZone)}
                </dd>
                <dt className="text-admin-ink-muted">Doors</dt>
                <dd className="text-admin-ink">
                  {selected.doorsOffsetMinutes > 0
                    ? `${selected.doorsOffsetMinutes} min before the session`
                    : "With the session"}
                </dd>
                <dt className="text-admin-ink-muted">Refunds</dt>
                <dd className="text-admin-ink">
                  {/* NULL means inherit, and it must not read as "no refunds". An
                      absent value is not a value. */}
                  {selected.refundCutoffHours === null
                    ? "Workspace default"
                    : `Full until ${selected.refundCutoffHours}h before`}
                </dd>
                <dt className="text-admin-ink-muted">Payout</dt>
                <dd className="text-admin-ink">{selected.payoutReleaseRule.replace(/_/g, " ")}</dd>
                <dt className="text-admin-ink-muted">Public address</dt>
                <dd className="text-admin-ink-muted">/events/{selected.slug} — not live yet</dd>
              </dl>
            ) : null}

            {tab === "sessions" && selected ? (
              selected.sessionCount === 0 ? (
                <NotBuiltYet
                  what="No sessions on this event"
                  waitingOn="A session is one occurrence — the night people buy a ticket to. Sessions exist in the engine and the editor for them is a later slice."
                />
              ) : (
                <p className="text-[13.5px] text-admin-ink">
                  {/* THREE states, not two. `nextSessionAt === null` means BOTH
                      "no sessions" and "every session is past", and collapsing
                      them renders "3 scheduled sessions, next No date yet" —
                      one label hiding the state a staff member most wants:
                      this run is over. */}
                  {selected.runFinished
                    ? `${selected.sessionCount} ${
                        selected.sessionCount === 1 ? "session" : "sessions"
                      }, all past. This run has finished.`
                    : `${selected.sessionCount} scheduled ${
                        selected.sessionCount === 1 ? "session" : "sessions"
                      }, next ${whenLabel(selected.nextSessionAt, selected.timeZone)}.`}
                </p>
              )
            ) : null}

            {tab === "tickets" && selected ? (
              selected.tiers.length === 0 ? (
                <NotBuiltYet
                  what="No ticket tiers yet"
                  waitingOn="A tier is a catalog variant carrying a price and a stable key. The key is what binds it to its capacity, which is why renaming a tier never detaches the seats already sold."
                />
              ) : (
                <div className="max-w-[560px]">
                  {selected.tiers.map((tier) => (
                    <TierRow key={tier.id} tier={tier} />
                  ))}
                </div>
              )
            ) : null}

            {tab === "seating" ? (
              <NotBuiltYet
                what="Seating is not built yet"
                waitingOn="Seat maps and floor plans are the Spaces area's layouts work, which is sequenced after this one. Tiers can already be bound to a table group; a per-seat picker needs those layouts to exist first."
              />
            ) : null}

            {tab === "lineup" ? (
              <NotBuiltYet
                what="Lineup is engine-only so far"
                waitingOn="Booking a performer opens an inquiry with the event attached, and only a confirmed booking ever appears publicly. That rule is live and tested; this panel is the next slice."
              />
            ) : null}

            {tab === "sales" ? (
              <NotBuiltYet
                what="Sales numbers are not shown yet, deliberately"
                waitingOn="Sold, held and remaining are derived from capacity allocations, and the one authority for that derivation returns a single figure for a single tier. Computing them here would be a second implementation of the availability rule on a money screen — and a remaining count that disagrees with what the public picker refuses is how a room gets oversold."
              />
            ) : null}

            {tab === "door" ? (
              <NotBuiltYet
                what="The door app is not reachable yet"
                waitingOn="Check-in works in the engine — one scan admits a whole table, a second scan is refused, and a refunded ticket is refused with the reason. What is missing is the public route the scanner lives on."
              />
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}
