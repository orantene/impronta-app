"use client";

import type { ReactNode } from "react";

import { POS_INPUT, POS_NOTE, POS_NOTE_WARN, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "@/components/admin/pos/pos-classes";
import { PosSheet } from "@/components/admin/pos/PosSheet";
import { interpolate } from "@/i18n/interpolate";
import type { MessagingSheetName } from "@/lib/messaging/fixture";
import type { BasketDiff, DeliveryRow, HandOverTarget, OfferRow, SnapshotRow } from "@/lib/messaging/sheets";
import type { InboxRow, RecordChip } from "@/lib/messaging/types";
import type { PosMode } from "@/lib/pos/modes";

import { messagingActionItems } from "../action-items";
import type { messagesCopy } from "../copy";

/**
 * What each once-empty sheet draws and does (audit E / D-116). `null` data
 * means "not loaded yet"; an empty list means the engine had nothing.
 */
export type MessagingSheetData = {
  handOver: { targets: HandOverTarget[] | null; onPick: (userId: string) => void };
  delivery: { rows: DeliveryRow[] | null; busyId: string | null; onRetry: (deliveryId: string) => void };
  recover: { snapshots: SnapshotRow[] | null; onRecover: (snapshotId: string) => void };
  offer: {
    offers: OfferRow[] | null;
    builderHref: string;
    onSend: (offerId: string) => void;
    onRemind: (offerId: string) => void;
    onRevise: (offer: OfferRow) => void;
  };
  diff: { diff: BasketDiff | null; loaded: boolean; onKeepMine: () => void; onTakeTheirs: (linkId: string) => void };
  change: {
    booking: RecordChip | null;
    rescheduleHref: string | null;
    onCancel: (bookingId: string, reason: string) => void;
  };
};

export type MessagingSearchHit = {
  inquiryId: string;
  snippet: string;
  label: string;
};

export function MessagingSheets(props: {
  readonly copy: ReturnType<typeof messagesCopy>;
  readonly sheet: MessagingSheetName | null;
  readonly mode: PosMode;
  readonly active: InboxRow | null;
  readonly searchHits?: readonly MessagingSearchHit[];
  readonly onClose: () => void;
  readonly onOptions: (kind: string) => void;
  readonly onPayment: (kind: "deposit" | "full" | "none") => void;
  readonly onLost: (reason: string) => void;
  readonly onStart: (input: { name: string; email: string; phone: string; channel: string }) => void;
  readonly onAssign: () => void;
  readonly onRecover: () => void;
  readonly onSearch: (query: string) => void;
  readonly onOpenHit?: (inquiryId: string) => void;
  readonly onResolve?: () => void;
  readonly onOpenSheet?: (sheet: MessagingSheetName) => void;
  readonly data?: MessagingSheetData;
}) {
  const copy = props.copy;
  const data = props.data;
  return (
    <>
      <Sheet name="options" title={copy.sendOptions} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <p className={POS_NOTE}>{copy.previewCard}</p>
        {familiesForMode(props.mode).map((kind) => (
          <div key={kind} className="flex gap-2">
            <button type="button" className={POS_PRIMARY_ACTION} onClick={() => props.onOptions(kind)}>
              {copy.sendForCustomer}
            </button>
            <button type="button" className={POS_SECONDARY_ACTION} onClick={() => props.onOptions(kind)}>
              {copy.addToDraft}
            </button>
            <span className="self-center text-[14px]">{kind.replace("_", " ")}</span>
          </div>
        ))}
      </Sheet>
      <Sheet name="payment" title={copy.requestPayment} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <p className={POS_NOTE}>{copy.owedNow}</p>
        {(["deposit", "full", "none"] as const).map((kind) => (
          <button key={kind} type="button" className={POS_PRIMARY_ACTION} onClick={() => props.onPayment(kind)}>
            {copy[kind]}
          </button>
        ))}
        <button type="button" className={POS_SECONDARY_ACTION} onClick={() => props.onClose()}>
          {copy.history}
        </button>
      </Sheet>
      <Sheet name="lost" title={copy.closeLost} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            props.onLost(String(data.get("reason") ?? ""));
          }}
        >
          <input className={POS_INPUT} name="reason" required minLength={2} aria-label={copy.closeLost} />
          <button type="submit" className={POS_PRIMARY_ACTION}>
            {copy.closeLost}
          </button>
        </form>
      </Sheet>
      <Sheet name="start" title={copy.newConversation} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            props.onStart({
              name: String(data.get("name") ?? ""),
              email: String(data.get("email") ?? ""),
              phone: String(data.get("phone") ?? ""),
              channel: String(data.get("channel") ?? "email"),
            });
          }}
        >
          <input className={POS_INPUT} name="name" required placeholder={copy.customerTab} />
          <input className={POS_INPUT} name="email" type="email" />
          <input className={POS_INPUT} name="phone" />
          <select className={POS_INPUT} name="channel" defaultValue="email">
            <option value="email">email</option>
            <option value="whatsapp">whatsapp</option>
            <option value="sms">sms</option>
            <option value="counter">counter</option>
          </select>
          <button type="button" className={POS_SECONDARY_ACTION} disabled title={copy.disabled.webChat}>
            {copy.disabled.webChat}
          </button>
          <button type="submit" className={POS_PRIMARY_ACTION}>
            {copy.newConversation}
          </button>
        </form>
      </Sheet>
      <Sheet name="capture" title={copy.saveSuggested} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <p className={POS_NOTE}>{copy.confirmSuggestions}</p>
        <p className={POS_NOTE}>{copy.guestOrder}</p>
        <button type="button" className={POS_PRIMARY_ACTION} onClick={props.onClose}>
          {copy.saveSuggested}
        </button>
      </Sheet>
      <Sheet name="match" title={copy.matchExisting} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <p className={POS_NOTE}>{copy.relinkImpact}</p>
        <button type="button" className={POS_PRIMARY_ACTION} onClick={props.onClose}>
          {copy.matchExisting}
        </button>
      </Sheet>
      <Sheet name="assign" title={copy.assign} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <p className={POS_NOTE}>{copy.ownerHint}</p>
        <button type="button" className={POS_PRIMARY_ACTION} onClick={props.onAssign}>
          {copy.assignToMe}
        </button>
      </Sheet>
      <Sheet name="link" title={copy.createOrLink} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <p>{copy.nothingLinked}</p>
        {props.active?.recordChips.map((chip) => (
          <p key={chip.recordId} className="rounded-[12px] bg-admin-surface-alt px-3 py-2">
            {copy.record[chip.kind]}
          </p>
        ))}
        <button type="button" className={POS_PRIMARY_ACTION} onClick={props.onClose}>
          {copy.createOrLink}
        </button>
      </Sheet>
      <Sheet name="offer" title={copy.revise} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        {/* A real offer id behind every button: send a draft, remind or revise a sent one. Withdraw has no engine (D-POS-121). */}
        {data?.offer.offers === null || data?.offer.offers === undefined ? (
          <p className={POS_NOTE}>…</p>
        ) : data.offer.offers.length === 0 ? (
          <p className={POS_NOTE}>{copy.offerNone}</p>
        ) : (
          <ul className="space-y-2" data-pos-messages-offers="">
            {data.offer.offers.map((offer) => (
              <li key={offer.id} className="rounded-[12px] bg-admin-surface-alt px-3 py-2" data-pos-messages-offer={offer.status}>
                <p className="m-0 text-[14px] font-semibold">
                  {interpolate(copy.offerLine, { status: offer.status, version: offer.version })}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {offer.status === "draft" ? (
                    <button type="button" className={POS_PRIMARY_ACTION} onClick={() => data.offer.onSend(offer.id)}>
                      {copy.offerSend}
                    </button>
                  ) : null}
                  {offer.status === "sent" ? (
                    <>
                      <button type="button" className={POS_SECONDARY_ACTION} onClick={() => data.offer.onRemind(offer.id)}>
                        {copy.remind}
                      </button>
                      <button type="button" className={POS_SECONDARY_ACTION} onClick={() => data.offer.onRevise(offer)}>
                        {copy.revise}
                      </button>
                    </>
                  ) : null}
                  <button type="button" className={POS_SECONDARY_ACTION} disabled title={copy.disabled.withdraw}>
                    {copy.withdraw}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <a href={data?.offer.builderHref ?? "#"} className={POS_SECONDARY_ACTION} data-pos-messages-offer-builder="">
          {copy.offerOpenBuilder}
        </a>
      </Sheet>
      <Sheet name="follow" title={copy.closeLost} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <button type="button" className={POS_PRIMARY_ACTION} onClick={() => props.onLost("no response")}>
          {copy.closeLost}
        </button>
      </Sheet>
      <Sheet name="change" title={copy.changeTitle} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        {/* Package-2 cancel with its policy check (D-POS-122). Reschedule needs a slot: Appointments picks it. */}
        {!data?.change.booking ? (
          <p className={POS_NOTE}>{copy.changeNone}</p>
        ) : (
          <form
            className="space-y-3"
            data-pos-messages-change=""
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              data.change.onCancel(data.change.booking!.recordId, String(form.get("reason") ?? ""));
            }}
          >
            <p className="m-0 rounded-[12px] bg-admin-surface-alt px-3 py-2 text-[14px] font-semibold">
              {copy.record[data.change.booking.kind]} · {data.change.booking.label}
            </p>
            <p className={POS_NOTE_WARN}>{copy.changePolicy}</p>
            <input className={POS_INPUT} name="reason" maxLength={200} placeholder={copy.changeReason} aria-label={copy.changeReason} />
            <button type="submit" className={POS_PRIMARY_ACTION} data-pos-messages-change-cancel="">
              {copy.changeCancel}
            </button>
            {data.change.rescheduleHref ? (
              <a href={data.change.rescheduleHref} className={POS_SECONDARY_ACTION}>
                {copy.changeReschedule}
              </a>
            ) : (
              <button type="button" className={POS_SECONDARY_ACTION} disabled title={copy.disabled.rescheduleHere}>
                {copy.changeReschedule}
              </button>
            )}
          </form>
        )}
      </Sheet>
      <Sheet name="diff" title={copy.letComplete} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        {/* MS18 / P12: the three-way diff of the basket under an open payment page (`diffDraft`). */}
        {!data?.diff.loaded ? (
          <p className={POS_NOTE}>…</p>
        ) : !data.diff.diff ? (
          <p className={POS_NOTE}>{copy.diffNone}</p>
        ) : (
          <div className="space-y-3" data-pos-messages-diff={data.diff.diff.diff.length}>
            <p className={POS_NOTE}>
              {data.diff.diff.diff.length === 0
                ? copy.diffUnchanged
                : interpolate(copy.diffChanged, { count: data.diff.diff.diff.length })}
            </p>
            {data.diff.diff.diff.length > 0 ? (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-admin-ink-muted">
                    <th className="py-1 pr-2 font-semibold">{copy.details}</th>
                    <th className="py-1 pr-2 font-semibold">{copy.diffSent}</th>
                    <th className="py-1 font-semibold">{copy.diffNow}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.diff.diff.diff.map((line) => (
                    <tr key={`${line.lineId}-${line.field}`} data-pos-messages-diff-line={line.field}>
                      <td className="py-1 pr-2">{line.field}</td>
                      <td className="py-1 pr-2">{String(line.yours ?? "—")}</td>
                      <td className="py-1">{String(line.theirs ?? "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <button type="button" className={POS_PRIMARY_ACTION} onClick={data.diff.onKeepMine} data-pos-messages-diff-keep="">
              {copy.diffKeepMine}
            </button>
            <button
              type="button"
              className={POS_SECONDARY_ACTION}
              onClick={() => data.diff.onTakeTheirs(data.diff.diff!.linkId)}
              data-pos-messages-diff-take=""
            >
              {copy.diffTakeTheirs}
            </button>
          </div>
        )}
      </Sheet>
      <Sheet name="recover" title={copy.recoverOrder} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <p className={POS_NOTE}>{copy.retrySameTicket}</p>
        {/* The snapshot id is the engine's own uuid; `snap-<inquiry>` was refused `invalid` every time. */}
        {data?.recover.snapshots === null || data?.recover.snapshots === undefined ? (
          <p className={POS_NOTE}>…</p>
        ) : data.recover.snapshots.length === 0 ? (
          <p className={POS_NOTE}>{copy.recoverNone}</p>
        ) : (
          <ul className="space-y-2" data-pos-messages-snapshots="">
            {data.recover.snapshots.map((snap) => (
              <li key={snap.id} className="flex items-center justify-between gap-2 rounded-[12px] bg-admin-surface-alt px-3 py-2">
                <span className="text-[13px]">
                  {interpolate(copy.recoverLine, {
                    when: snap.createdAt.slice(0, 16).replace("T", " "),
                    count: snap.lineCount,
                    version: snap.basketVersion,
                  })}
                </span>
                {snap.recoveredOrderId ? (
                  <span className="text-[13px] text-admin-ink-muted">{copy.recoverRecovered}</span>
                ) : (
                  <button type="button" className={POS_PRIMARY_ACTION} onClick={() => data.recover.onRecover(snap.id)} data-pos-messages-recover={snap.id}>
                    {copy.recoverOrder}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <button type="button" className={POS_SECONDARY_ACTION} onClick={props.onRecover}>
          {copy.recoverKitchen}
        </button>
      </Sheet>
      <Sheet name="note" title={copy.note} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <p className={POS_NOTE}>{copy.disabled.attach}</p>
      </Sheet>
      <Sheet name="delivery" title={copy.history} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        {/* MS23: real `message_delivery` rows; Retry is the cron's own resend for one row. */}
        {data?.delivery.rows === null || data?.delivery.rows === undefined ? (
          <p className={POS_NOTE}>…</p>
        ) : data.delivery.rows.length === 0 ? (
          <p className={POS_NOTE}>{copy.deliveryNone}</p>
        ) : (
          <ul className="space-y-2" data-pos-messages-delivery="">
            {data.delivery.rows.map((row) => (
              <li key={row.id} className="rounded-[12px] bg-admin-surface-alt px-3 py-2" data-pos-messages-delivery-state={row.state}>
                <p className="m-0 truncate text-[13px] font-semibold">{row.preview || row.messageId.slice(0, 8)}</p>
                <p className="m-0 text-[12px] text-admin-ink-muted">
                  {row.channel} · {row.state} · {interpolate(copy.deliveryAttempts, { count: row.attempts })}
                  {row.lastError ? ` · ${row.lastError}` : ""}
                </p>
                {row.state === "failed" ? (
                  <button
                    type="button"
                    className={POS_SECONDARY_ACTION}
                    disabled={data.delivery.busyId === row.id}
                    onClick={() => data.delivery.onRetry(row.id)}
                    data-pos-messages-delivery-retry={row.id}
                  >
                    {copy.deliveryRetry}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Sheet>
      <Sheet name="resolve" title={copy.resolve} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <button
          type="button"
          className={POS_PRIMARY_ACTION}
          onClick={() => {
            props.onResolve?.();
            props.onClose();
          }}
        >
          {copy.resolve}
        </button>
        <button type="button" className={POS_SECONDARY_ACTION} onClick={props.onClose}>
          {copy.handOver}
        </button>
      </Sheet>
      <Sheet name="search" title={copy.search} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <p className={POS_NOTE}>{copy.searchHint}</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            props.onSearch(String(data.get("q") ?? ""));
          }}
        >
          <input className={POS_INPUT} name="q" aria-label={copy.search} defaultValue="" />
        </form>
        {(props.searchHits ?? []).length > 0 ? (
          <ul className="space-y-2" data-pos-messages-search-hits="">
            {props.searchHits?.map((hit) => (
              <li key={`${hit.inquiryId}-${hit.snippet}`}>
                <button
                  type="button"
                  className="w-full rounded-[12px] bg-admin-surface-alt px-3 py-2 text-left"
                  onClick={() => {
                    props.onOpenHit?.(hit.inquiryId);
                    props.onClose();
                  }}
                >
                  <p className="font-semibold">{hit.label}</p>
                  <p className="text-[13px] text-admin-ink-muted" data-pos-messages-snippet="">
                    {hit.snippet}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Sheet>
      <Sheet name="reminder" title={copy.scheduleReminder} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <p className={POS_NOTE}>{copy.reminderOne}</p>
      </Sheet>
      <Sheet name="agency" title={copy.handOver} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        {/* `messagingHandOver`: the thread's owner moves to the person picked. */}
        <p className={POS_NOTE}>{copy.ownerHint}</p>
        {data?.handOver.targets === null || data?.handOver.targets === undefined ? (
          <p className={POS_NOTE}>…</p>
        ) : data.handOver.targets.length === 0 ? (
          <p className={POS_NOTE}>{copy.handOverNone}</p>
        ) : (
          <>
            <p className="m-0 text-[13px] font-semibold">{copy.handOverTo}</p>
            <ul className="space-y-1" data-pos-messages-hand-over="">
              {data.handOver.targets.map((target) => (
                <li key={target.userId}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-[12px] px-3 py-2 text-left hover:bg-admin-surface-alt"
                    onClick={() => data.handOver.onPick(target.userId)}
                    data-pos-messages-hand-over-to={target.userId}
                  >
                    <span className="text-[15px] font-semibold">{target.name}</span>
                    <span className="text-[13px] text-admin-ink-muted">{target.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Sheet>
      <Sheet name="actions" title={copy.actions} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <ul className="space-y-1" data-pos-messages-actions="">
          {messagingActionItems(copy).map((item) => (
            <li key={`${item.sheet}-${item.label}`}>
              <button
                type="button"
                className="flex w-full flex-col items-start rounded-[12px] px-3 py-2 text-left hover:bg-admin-surface-alt disabled:opacity-40"
                disabled={Boolean(item.disabled)}
                title={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  props.onOpenSheet?.(item.sheet);
                }}
              >
                <span className="text-[15px] font-semibold">{item.label}</span>
                <span className="text-[13px] text-admin-ink-muted">{item.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}

function Sheet(props: {
  name: MessagingSheetName;
  title: string;
  sheet: MessagingSheetName | null;
  copy: ReturnType<typeof messagesCopy>;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <PosSheet open={props.sheet === props.name} title={props.title} closeLabel={props.copy.cancel} onClose={props.onClose} name={`messages-${props.name}`}>
      <div className="space-y-3 p-4">{props.children}</div>
    </PosSheet>
  );
}

function familiesForMode(mode: PosMode): string[] {
  if (mode === "counter") return ["menu_options"];
  if (mode === "classes") return ["service_card", "professional_times", "class_card"];
  if (mode === "floor") return ["menu_options"];
  if (mode === "door") return ["tickets_card"];
  return ["service_card", "offer_review"];
}
