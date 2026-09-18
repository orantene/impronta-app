"use client";

/**
 * PosMessagesDock (L10, D-MSG-172) — the counter's Messages v5 mount for
 * `?view=messages`. Owner ruling: POS Messages is a DOCK beside the sale,
 * never a page that replaces it.
 *
 *   ≥1100  dock beside the sale: this component draws the "Return to sale"
 *          strip + This client / Inbox tabs, `MessagesModeClient` (the
 *          route's own wrapper) keeps the sale reachable one click away
 *          through that strip's link (D-MSG-173: the live sale itself is a
 *          separate route in this architecture — see the seam note below).
 *   <1100  drawer over the sale, same two views, same strip. Below the
 *          shell's own mobile breakpoint (900) this is also the phone's
 *          full-screen thread overlay — one code path, not two.
 *
 * "This client" is the conversation already linked to the open sale's order
 * (`initialCustomerInquiryId`, resolved server-side by `messages-view.tsx`
 * through the SAME `messagingLoadInbox` reader the shell itself calls — no
 * new query). "Inbox" is the ordinary full `MessagesV5Shell`.
 *
 * SEAM (D-MSG-173): a true "sale visible behind a drawer" needs the sale UI
 * (`pos-client.tsx`) and this dock mounted in the SAME tree, which today they
 * are not — `?view=messages` is `page.tsx`'s own branch, entirely swapping
 * out the sale's content. This draws the strip and the two views the owner
 * asked for; wiring the live, editable sale in behind it is a follow-up PR
 * that touches `pos-client.tsx` directly, out of this lane's scope.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { MessagesV5Shell } from "@/components/messages-v5/shell/MessagesV5Shell";
import type { ShellEngine } from "@/components/messages-v5/shell/engine";
import "@/components/messages-v5/kit/tokens.css";
import { useT } from "@/i18n/use-t";
import { shouldDockBesideSale } from "@/lib/messages-v5/pos-continuity";
import { cn } from "@/lib/utils";

import { buildPosDockCopy } from "./pos-copy";
import "./pos-dock.css";

export type PosMessagesDockProps = {
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly locationSlug: string;
  readonly adminBasePath: string;
  readonly currentUserId: string | null;
  /** "Back to sale #N · $X · N lines" / "Back to Today", already built server-side. */
  readonly returnHref: string;
  readonly returnLabel: string;
  readonly openOrderId: string | null;
  readonly initialCustomerInquiryId: string | null;
  readonly locale?: string;
  /** Render tests: forces the dock/drawer breakpoint instead of measuring. */
  readonly forceWidth?: number;
  /** Dev preview and tests: a fixture engine instead of the live server actions. */
  readonly engine?: ShellEngine;
  readonly live?: boolean;
};

type DockView = "client" | "inbox";

export function PosMessagesDock(props: PosMessagesDockProps) {
  const t = useT();
  const copy = useMemo(() => buildPosDockCopy(t), [t]);
  const [view, setView] = useState<DockView>(props.openOrderId ? "client" : "inbox");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(props.forceWidth ?? 1440);

  useEffect(() => {
    if (props.forceWidth) {
      setWidth(props.forceWidth);
      return;
    }
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const sync = () => setWidth(el.getBoundingClientRect().width);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [props.forceWidth]);

  const docked = shouldDockBesideSale(width);
  const hasCustomerThread = props.initialCustomerInquiryId !== null;

  const customerPane = hasCustomerThread ? (
    <MessagesV5Shell
      key={`customer-${props.initialCustomerInquiryId}`}
      tenantId={props.tenantId}
      tenantSlug={props.tenantSlug}
      locationSlug={props.locationSlug}
      currentUserId={props.currentUserId}
      initialInquiryId={props.initialCustomerInquiryId}
      locale={props.locale}
      engine={props.engine}
      live={props.live}
      forceWidth={props.forceWidth}
      hideInboxRail
    />
  ) : (
    <div className="mv5pd-empty" data-pos-dock-empty>
      <p className="mv5pd-empty-title">{copy.noThreadYet}</p>
      <p className="mv5pd-empty-body">{copy.noThreadBody}</p>
    </div>
  );

  const inboxPane = (
    <MessagesV5Shell
      key="inbox"
      tenantId={props.tenantId}
      tenantSlug={props.tenantSlug}
      locationSlug={props.locationSlug}
      currentUserId={props.currentUserId}
      locale={props.locale}
      engine={props.engine}
      live={props.live}
      forceWidth={props.forceWidth}
    />
  );

  return (
    <div ref={rootRef} className={cn("msgv5", "mv5pd", docked ? "mv5pd-dock" : "mv5pd-drawer")} data-pos-messages-dock data-dock-mode={docked ? "dock" : "drawer"}>
      <div className="mv5pd-strip" data-return-strip>
        <a href={props.returnHref} className="mv5pd-return" data-return-to-sale>
          {props.returnLabel}
        </a>
      </div>
      <div className="mv5pd-tabs" role="tablist" aria-label={copy.thisClient}>
        <button type="button" role="tab" aria-selected={view === "client"} className="mv5pd-tab" data-pos-dock-tab="client" onClick={() => setView("client")}>
          {copy.thisClient}
        </button>
        <button type="button" role="tab" aria-selected={view === "inbox"} className="mv5pd-tab" data-pos-dock-tab="inbox" onClick={() => setView("inbox")}>
          {copy.inbox}
        </button>
      </div>
      <div className="mv5pd-body" data-pos-dock-body>
        {view === "client" ? customerPane : inboxPane}
      </div>
    </div>
  );
}
