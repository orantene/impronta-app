"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { respondToServiceListingAction } from "@/lib/service-hub/listing-actions";
import { listingErrorMessage } from "@/lib/service-hub/listing-copy";
import {
  pendingUpdateCopy,
  pendingUpdateLines,
  type PendingListingUpdate,
} from "@/lib/talent/service-hub-pending-updates";

function formatMoney(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

type Answer = "idle" | "busy" | "accepted" | "declined" | { error: string };

function Card({ item, locale }: { item: PendingListingUpdate; locale: string }) {
  const c = pendingUpdateCopy(locale);
  const router = useRouter();
  const [state, setState] = useState<Answer>("idle");
  const lines = pendingUpdateLines(item, locale, (cents, cur) => formatMoney(cents, cur, locale));

  const answer = async (accept: boolean) => {
    setState("busy");
    try {
      // Same action the first consent uses; her own "lowest price I accept" is passed back unchanged.
      const res = await respondToServiceListingAction({ listingId: item.listingId, accept, talentLowestCents: item.minAcceptCents });
      if (res.ok) {
        setState(accept ? "accepted" : "declined");
        router.refresh();
      } else {
        setState({ error: listingErrorMessage(res.error, locale) });
      }
    } catch {
      setState({ error: c.failed });
    }
  };

  const done = state === "accepted" || state === "declined";
  return (
    <section
      aria-label={`${c.title}: ${item.workspaceName}`}
      data-testid="pending-listing-update"
      data-listing-id={item.listingId}
      className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
    >
      <h3 className="m-0 text-base font-semibold">{c.title}</h3>
      <p className="m-0 text-sm text-muted-foreground">
        {c.intro.replace("{workspace}", item.workspaceName).replace("{service}", item.serviceTitle)}
      </p>
      <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(0,180px)_1fr]">
        {lines.map((l) => (
          <div key={l.key} className="contents">
            <dt className="font-medium text-muted-foreground">{l.label}</dt>
            <dd className="m-0">{l.value}</dd>
          </div>
        ))}
      </dl>
      {done ? (
        <p role="status" className="m-0 text-sm">{state === "accepted" ? c.accepted : c.declined}</p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={state === "busy"}
            onClick={() => void answer(false)}
            className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted"
          >
            {c.decline}
          </button>
          <button
            type="button"
            disabled={state === "busy"}
            onClick={() => void answer(true)}
            className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90"
          >
            {c.accept}
          </button>
        </div>
      )}
      {typeof state === "object" ? <p role="alert" className="m-0 text-sm">{state.error}</p> : null}
    </section>
  );
}

/** One "Pending update" card per offered listing, with Accept / Decline. Renders nothing when there are none. */
export function PendingListingUpdates(props: { items: readonly PendingListingUpdate[]; locale: string }) {
  if (props.items.length === 0) return null;
  return (
    <div className="flex flex-col gap-3" data-testid="pending-listing-updates">
      {props.items.map((i) => (
        <Card key={i.listingId} item={i} locale={props.locale} />
      ))}
    </div>
  );
}
