"use client";

import type { ReactNode } from "react";

import { POS_INPUT, POS_NOTE, POS_NOTE_WARN, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "@/components/admin/pos/pos-classes";
import { PosSheet } from "@/components/admin/pos/PosSheet";
import type { MessagingSheetName } from "@/lib/messaging/fixture";
import type { InboxRow } from "@/lib/messaging/types";
import type { PosMode } from "@/lib/pos/modes";

import type { messagesCopy } from "../copy";

export function MessagingSheets(props: {
  readonly copy: ReturnType<typeof messagesCopy>;
  readonly sheet: MessagingSheetName | null;
  readonly mode: PosMode;
  readonly active: InboxRow | null;
  readonly onClose: () => void;
  readonly onOptions: (kind: string) => void;
  readonly onPayment: (kind: "deposit" | "full" | "none") => void;
  readonly onLost: (reason: string) => void;
  readonly onStart: (input: { name: string; email: string; phone: string; channel: string }) => void;
  readonly onAssign: () => void;
  readonly onRecover: () => void;
  readonly onSearch: (query: string) => void;
}) {
  const copy = props.copy;
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
            {chip.label}
          </p>
        ))}
        <button type="button" className={POS_PRIMARY_ACTION} onClick={props.onClose}>
          {copy.createOrLink}
        </button>
      </Sheet>
      <Sheet name="offer" title={copy.revise} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <div className="flex gap-2">
          <button type="button" className={POS_SECONDARY_ACTION}>
            {copy.remind}
          </button>
          <button type="button" className={POS_SECONDARY_ACTION}>
            {copy.revise}
          </button>
          <button type="button" className={POS_SECONDARY_ACTION}>
            {copy.withdraw}
          </button>
        </div>
      </Sheet>
      <Sheet name="follow" title={copy.closeLost} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <button type="button" className={POS_PRIMARY_ACTION} onClick={() => props.onLost("no response")}>
          {copy.closeLost}
        </button>
      </Sheet>
      <Sheet name="change" title={copy.disabled.change} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <p className={POS_NOTE_WARN}>{copy.disabled.change}</p>
        <button type="button" className={POS_PRIMARY_ACTION} disabled title={copy.disabled.change}>
          {copy.disabled.change}
        </button>
      </Sheet>
      <Sheet name="diff" title={copy.letComplete} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <p>{copy.letComplete}</p>
        <p>{copy.cancelPayment}</p>
        <button type="button" className={POS_PRIMARY_ACTION} onClick={props.onClose}>
          {copy.letComplete}
        </button>
        <button type="button" className={POS_SECONDARY_ACTION} onClick={props.onClose}>
          {copy.cancelPayment}
        </button>
      </Sheet>
      <Sheet name="recover" title={copy.recoverOrder} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <p className={POS_NOTE}>{copy.retrySameTicket}</p>
        <button type="button" className={POS_SECONDARY_ACTION} onClick={props.onRecover}>
          {copy.recoverKitchen}
        </button>
        <button type="button" className={POS_PRIMARY_ACTION} onClick={props.onRecover}>
          {copy.recoverOrder}
        </button>
      </Sheet>
      <Sheet name="note" title={copy.note} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <p className={POS_NOTE}>{copy.disabled.attach}</p>
      </Sheet>
      <Sheet name="delivery" title={copy.retrySameTicket} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <p>sent · delivered · read · failed</p>
      </Sheet>
      <Sheet name="resolve" title={copy.resolve} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <button type="button" className={POS_PRIMARY_ACTION} onClick={props.onClose}>
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
          <input className={POS_INPUT} name="q" aria-label={copy.search} />
        </form>
      </Sheet>
      <Sheet name="reminder" title={copy.scheduleReminder} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <p className={POS_NOTE}>{copy.reminderOne}</p>
      </Sheet>
      <Sheet name="agency" title={copy.recoverOrder} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <p className={POS_NOTE}>{copy.retrySameTicket}</p>
      </Sheet>
      <Sheet name="actions" title={copy.actions} sheet={props.sheet} copy={copy} onClose={props.onClose}>
        <p>{copy.actions}</p>
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
