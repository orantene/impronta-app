"use client";

// The `ticket_picker` block's inspector body (everything but the Copy
// section, which the parent keeps): the event to sell, the v2 presentation
// switches, and one card per tier where the operator authors what that tier
// includes, its badge, its image and whether it is hidden from the cards.
//
// Own component because it owns hooks (two loads), and the inspector's
// per-kind branch is an early return where hooks cannot run.
//
// Two contracts carried over from the links picker:
//   - a FAILED read is surfaced with a manual fallback (the event id can be
//     pasted), never an empty list that reads as "no events";
//   - the tenant is resolved from the session inside the action, never sent.

import { useEffect, useState } from "react";

import type { TicketPickerTierPresentation } from "@/lib/site-admin/builder-node/types";
import {
  listEventsForInspectorAction,
  listEventTiersForInspectorAction,
  type InspectorEvent,
  type InspectorTier,
} from "@/lib/site-admin/events/inspector-actions";

import { MediaField, toMediaValue } from "./kit";
import { KIT } from "./kit/tokens";

type Props = {
  tenantId: string;
  eventId: string;
  layout: "cards" | "list" | undefined;
  presentation: "inline" | "sheet" | undefined;
  showNightPicker: "auto" | "always" | undefined;
  tiers: ReadonlyArray<TicketPickerTierPresentation> | undefined;
  patch: (patch: Record<string, unknown>) => Promise<void> | void;
};

type Load<T> = { status: "loading" } | { status: "ready"; items: T[] } | { status: "error" };

function fmtMoney(cents: number): string {
  return cents === 0 ? "Free" : (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

export function TicketPickerEditor({ tenantId, eventId, layout, presentation, showNightPicker, tiers, patch }: Props) {
  const [events, setEvents] = useState<Load<InspectorEvent>>({ status: "loading" });
  const [tierRows, setTierRows] = useState<Load<InspectorTier>>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void listEventsForInspectorAction().then((r) => {
      if (!alive) return;
      setEvents(r.ok ? { status: "ready", items: r.events } : { status: "error" });
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setTierRows({ status: "loading" });
    if (!eventId) { setTierRows({ status: "ready", items: [] }); return; }
    void listEventTiersForInspectorAction({ eventId }).then((r) => {
      if (!alive) return;
      setTierRows(r.ok ? { status: "ready", items: r.tiers } : { status: "error" });
    });
    return () => { alive = false; };
  }, [eventId]);

  const byId = new Map((tiers ?? []).map((t) => [t.variantId.toLowerCase(), t]));
  const writeTier = (variantId: string, next: Partial<TicketPickerTierPresentation>) => {
    const others = (tiers ?? []).filter((t) => t.variantId.toLowerCase() !== variantId.toLowerCase());
    const current = byId.get(variantId.toLowerCase()) ?? { variantId };
    const merged: TicketPickerTierPresentation = { ...current, ...next, variantId };
    // Drop empty strings so the stored node stays small.
    for (const k of Object.keys(merged) as Array<keyof TicketPickerTierPresentation>) {
      if (merged[k] === "" || merged[k] === undefined) delete merged[k];
    }
    const hasContent = Object.keys(merged).length > 1;
    void patch({ tiers: hasContent ? [...others, merged] : others });
  };

  return (
    <>
      <div className={KIT.field} data-testid="ticket-picker-event">
        <label className={KIT.label}>Event</label>
        {events.status === "ready" && events.items.length > 0 ? (
          <select className={KIT.input} value={eventId} onChange={(e) => void patch({ eventId: e.currentTarget.value })}>
            <option value="">Choose an event…</option>
            {events.items.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {(ev.title || ev.id) + (ev.status !== "published" ? ` (${ev.status})` : "")}
              </option>
            ))}
          </select>
        ) : events.status === "loading" ? (
          <select className={KIT.input} disabled defaultValue=""><option value="">Loading your events…</option></select>
        ) : (
          <>
            {events.status === "error" ? (
              <p style={{ fontSize: 12, color: "#b4231f", margin: "0 0 4px" }}>Couldn&apos;t load your events. Paste the event id.</p>
            ) : (
              <p className={KIT.hint}>No events yet. Create one under Events &amp; Tickets, or paste an id.</p>
            )}
            <input type="text" className={KIT.input} value={eventId} placeholder="Event id" onChange={(e) => void patch({ eventId: e.currentTarget.value })} />
          </>
        )}
      </div>

      <div className={KIT.field}>
        <label className={KIT.label}>Layout</label>
        <select className={KIT.input} value={layout ?? "list"} onChange={(e) => void patch({ layout: e.currentTarget.value })} data-testid="ticket-picker-layout">
          <option value="list">List (one screen)</option>
          <option value="cards">Cards, in steps (ticket → how many → your details)</option>
        </select>
      </div>
      <div className={KIT.field}>
        <label className={KIT.label}>On phones</label>
        <select className={KIT.input} value={presentation ?? "inline"} onChange={(e) => void patch({ presentation: e.currentTarget.value })} data-testid="ticket-picker-presentation">
          <option value="inline">Show the tickets on the page</option>
          <option value="sheet">Sticky Buy button that opens a sheet</option>
        </select>
        <p className={KIT.hint}>The sheet becomes a side panel on desktop.</p>
      </div>
      <div className={KIT.field}>
        <label className={KIT.label}>Night picker</label>
        <select className={KIT.input} value={showNightPicker ?? (layout === "cards" ? "auto" : "always")} onChange={(e) => void patch({ showNightPicker: e.currentTarget.value })}>
          <option value="auto">Hide when there is one night</option>
          <option value="always">Always show</option>
        </select>
      </div>

      <div className={KIT.field} data-testid="ticket-picker-tiers">
        <label className={KIT.label}>Tickets</label>
        {tierRows.status === "loading" ? (
          <p className={KIT.hint}>Loading tickets…</p>
        ) : tierRows.status === "error" ? (
          <p style={{ fontSize: 12, color: "#b4231f", margin: 0 }}>Couldn&apos;t load this event&apos;s tickets.</p>
        ) : tierRows.items.length === 0 ? (
          <p className={KIT.hint}>This event has no ticket types yet. Add them under Events &amp; Tickets → Entradas.</p>
        ) : (
          tierRows.items.map((row) => {
            const p = byId.get(row.variantId.toLowerCase());
            return (
              <div key={row.variantId} className="rounded-[10px] border border-stone-200 p-2.5 flex flex-col gap-2" data-testid={`ticket-picker-tier-${row.variantId}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-semibold">{row.label}</span>
                  <span className={KIT.hint}>{fmtMoney(row.amountCents)}{row.isHidden ? " · hidden by link" : ""}</span>
                </div>
                <MediaField
                  tenantId={tenantId}
                  value={toMediaValue(p?.imageSrc, p?.imageMediaId, null)}
                  aspect="4/5"
                  emptyLabel="Add image"
                  onChange={(next) => writeTier(row.variantId, next ? { imageSrc: next.url, imageMediaId: next.mediaId ?? undefined } : { imageSrc: undefined, imageMediaId: undefined })}
                />
                <label className={KIT.label}>
                  Badge
                  <input type="text" className={KIT.input} defaultValue={p?.badge ?? ""} placeholder="VIP" maxLength={40} onBlur={(e) => writeTier(row.variantId, { badge: e.currentTarget.value.trim() })} />
                </label>
                <label className={KIT.label}>
                  Includes (one per line)
                  <textarea className={KIT.textarea} rows={3} defaultValue={p?.includes ?? ""} placeholder="Copa de vino" maxLength={600} onBlur={(e) => writeTier(row.variantId, { includes: e.currentTarget.value.trim() })} />
                </label>
                <label className={`${KIT.row} text-[12px]`}>
                  <input type="checkbox" checked={p?.hidden === true} onChange={(e) => writeTier(row.variantId, { hidden: e.currentTarget.checked || undefined })} />
                  Hide from the cards (reachable by link only)
                </label>
              </div>
            );
          })
        )}
        <p className={KIT.hint}>A hidden ticket opens from a link like <code>/lumina?tier=&lt;id&gt;</code>.</p>
      </div>
    </>
  );
}
