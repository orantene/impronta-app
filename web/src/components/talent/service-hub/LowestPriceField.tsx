"use client";

import { useState } from "react";

import { setListingLowestPriceAction } from "@/lib/server-actions/service-hub-lowest";

function formatMoney(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

export type LowestPriceCopy = { label: string; save: string; saved: string; failed: string; notReady: string; aboveListing: string };

/** One workspace listing's "lowest price I accept", in whole currency units on screen, cents on the wire. */
export function LowestPriceField(props: { listingId: string; initialCents: number | null; copy: LowestPriceCopy; currency: string; locale: string }) {
  const [value, setValue] = useState(props.initialCents == null ? "" : String(props.initialCents / 100));
  const [status, setStatus] = useState<"idle" | "busy" | "saved" | "failed" | "not_ready" | "below_floor">("idle");
  const [floorCents, setFloorCents] = useState<number | null>(null);

  const save = async () => {
    const trimmed = value.trim();
    const units = trimmed === "" ? null : Number(trimmed);
    if (units !== null && (!Number.isFinite(units) || units < 0)) return setStatus("failed");
    setStatus("busy");
    try {
      const res = await setListingLowestPriceAction({
        listingId: props.listingId,
        lowestCents: units === null ? null : Math.round(units * 100),
      });
      if (res.ok) setStatus("saved");
      else if (res.reason === "below_floor") {
        setFloorCents(res.floorCents);
        setStatus("below_floor");
      } else setStatus(res.reason === "not_ready" ? "not_ready" : "failed");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-sm">
        <span>{props.copy.label}</span>
        <input
          inputMode="decimal"
          className="w-24 rounded border px-2 py-1 text-right"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          data-testid={`lowest-${props.listingId}`}
        />
      </label>
      <button type="button" disabled={status === "busy"} onClick={() => void save()} className="rounded border px-3 py-1 text-sm disabled:opacity-50">
        {props.copy.save}
      </button>
      {status === "saved" ? <span className="text-sm">{props.copy.saved}</span> : null}
      {status === "failed" ? <span role="alert" className="text-sm">{props.copy.failed}</span> : null}
      {status === "below_floor" ? (
        <span role="alert" className="text-sm" data-testid="below-floor">
          {props.copy.aboveListing.replace("{floor}", floorCents == null ? "" : formatMoney(floorCents, props.currency, props.locale)).replace("  ", " ")}
        </span>
      ) : null}
      {status === "not_ready" ? <span role="alert" className="text-sm">{props.copy.notReady}</span> : null}
    </div>
  );
}
