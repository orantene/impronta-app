"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PosSheet } from "@/components/admin/pos/PosSheet";
import {
  POS_CHIP,
  POS_CHIP_ACTIVE,
  POS_CHIP_IDLE,
  POS_INPUT,
  POS_PRIMARY_ACTION,
  POS_REFUSAL_BANNER,
  POS_SECONDARY_ACTION,
  POS_SURFACE,
} from "@/components/admin/pos/pos-classes";
import { useT } from "@/i18n/use-t";
import {
  messagingAssignOwner,
  messagingCloseLost,
  messagingInternalNote,
  messagingLoadEssentials,
  messagingLoadInbox,
  messagingLoadThread,
  messagingReply,
  messagingRequestPayment,
  messagingResolve,
  messagingSearch,
  messagingSendOptions,
  messagingStartConversation,
} from "@/lib/server-actions/messaging-engine";
import type { InboxFilter, InboxRow, ThreadMessage } from "@/lib/messaging/types";
import { INBOX_FILTERS } from "@/lib/messaging/types";
import type { PosMode } from "@/lib/pos/modes";
import { cn } from "@/lib/utils";

import { messagesCopy, pinMessagingKeys } from "./copy";
import { EssentialsPanel } from "./EssentialsPanel";
import { InboxList } from "./InboxList";
import { PhoneMessages } from "./phone/PhoneMessages";
import { ThreadPane } from "./ThreadPane";

export type MessagesClientProps = {
  readonly mode: PosMode;
  readonly locationSlug: string;
  readonly tenantId: string;
  readonly adminBasePath: string;
  readonly returnHref?: string;
  readonly returnLabel?: string;
  readonly compact?: boolean;
};

const FILTERS: InboxFilter[] = [...INBOX_FILTERS];

export function MessagesShell(props: MessagesClientProps) {
  const t = useT();
  const copy = useMemo(() => {
    pinMessagingKeys(t);
    return messagesCopy(t);
  }, [t]);
  const [filter, setFilter] = useState<InboxFilter>("needs_reply");
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"ok" | "empty" | "failed">("ok");
  const [sheet, setSheet] = useState<"options" | "payment" | "lost" | "start" | null>(null);
  const [essentials, setEssentials] = useState<Awaited<ReturnType<typeof messagingLoadEssentials>> | null>(null);
  const [focused, setFocused] = useState(false);

  const reload = useCallback(async () => {
    const result = await messagingLoadInbox({ locationSlug: props.locationSlug, filter });
    if (!result.ok) {
      setLoadState("failed");
      return;
    }
    setRows(result.rows);
    setLoadState(result.rows.length === 0 ? "empty" : "ok");
  }, [filter, props.locationSlug]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openThread = useCallback(
    async (id: string) => {
      setActiveId(id);
      const [thread, ess] = await Promise.all([
        messagingLoadThread({ inquiryId: id }),
        messagingLoadEssentials({ inquiryId: id }),
      ]);
      if (thread.ok) setMessages(thread.messages);
      setEssentials(ess);
    },
    [],
  );

  const active = rows.find((row) => row.id === activeId) ?? null;

  async function sendReply() {
    if (!active || draft.trim() === "") return;
    const result = await messagingReply({
      inquiryId: active.id,
      body: draft,
      expectedVersion: active.version,
    });
    if (!result.ok) {
      setRefusal(copy.refusal(result.reason));
      return;
    }
    setDraft("");
    await openThread(active.id);
    await reload();
  }

  async function sendNote() {
    if (!active || note.trim() === "") return;
    const result = await messagingInternalNote({ inquiryId: active.id, body: note });
    if (!result.ok) {
      setRefusal(copy.refusal(result.reason));
      return;
    }
    setNote("");
    await openThread(active.id);
  }

  const commerceFamilies = familiesForMode(props.mode);

  if (props.compact) {
    return (
      <PhoneMessages
        copy={copy}
        rows={rows}
        active={active}
        messages={messages}
        draft={draft}
        onDraft={setDraft}
        onOpen={(id) => void openThread(id)}
        onSend={() => void sendReply()}
        filter={filter}
        onFilter={setFilter}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-admin-surface text-admin-ink" data-pos-messages="shell">
      <header className="flex items-center justify-between gap-3 border-b border-admin-border-soft px-4 py-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-admin-ink-muted">{copy.inbox}</p>
          <h1 className="text-[22px] font-semibold">{copy.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {props.returnHref ? (
            <a className={POS_SECONDARY_ACTION} href={props.returnHref}>
              {props.returnLabel ?? copy.backToSale}
            </a>
          ) : null}
          <button type="button" className={POS_SECONDARY_ACTION} onClick={() => setSheet("start")}>
            {copy.newConversation}
          </button>
          <button type="button" className={POS_SECONDARY_ACTION} onClick={() => setFocused((value) => !value)}>
            {focused ? copy.inbox : copy.thread}
          </button>
        </div>
      </header>
      {toast ? (
        <div className="mx-4 mt-3 rounded-[12px] bg-admin-indigo-soft px-4 py-2 text-[14px] text-admin-indigo-deep" role="status">
          {toast}
        </div>
      ) : null}
      {refusal ? <div className={cn(POS_REFUSAL_BANNER, "mx-4 mt-3")}>{refusal}</div> : null}
      <div className="flex min-h-0 flex-1">
        {focused ? null : (
          <aside className="flex w-[320px] shrink-0 flex-col border-r border-admin-border-soft">
            <div className="flex flex-wrap gap-1 p-3">
              {FILTERS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={cn(POS_CHIP, filter === id ? POS_CHIP_ACTIVE : POS_CHIP_IDLE)}
                  onClick={() => setFilter(id)}
                >
                  {copy.filter[id]}
                </button>
              ))}
            </div>
            <form
              className="px-3 pb-2"
              onSubmit={(event) => {
                event.preventDefault();
                void messagingSearch({ query: search }).then((result) => {
                  if (result.ok && result.hits[0]) void openThread(result.hits[0].inquiryId);
                });
              }}
            >
              <input
                className={POS_INPUT}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={copy.search}
                aria-label={copy.search}
              />
            </form>
            {loadState === "failed" ? (
              <p className="px-4 text-[14px] text-admin-ink-muted">
                {copy.failedLoad} {copy.draftKept}
              </p>
            ) : null}
            <InboxList
              rows={rows}
              activeId={activeId}
              emptyLabel={search ? copy.noResults : copy.empty}
              copy={copy}
              onOpen={(id) => void openThread(id)}
            />
          </aside>
        )}
        <ThreadPane
          copy={copy}
          row={active}
          messages={messages}
          draft={draft}
          onDraft={setDraft}
          onSend={() => void sendReply()}
          onOptions={() => setSheet("options")}
          onPay={() => setSheet("payment")}
          onLost={() => setSheet("lost")}
          onResolve={() => {
            if (!active) return;
            void messagingResolve({ inquiryId: active.id, expectedVersion: active.version }).then((result) => {
              if (!result.ok) setRefusal(copy.refusal(result.reason));
              else void reload();
            });
          }}
          onAssign={() => {
            if (!active) return;
            void messagingAssignOwner({
              inquiryId: active.id,
              ownerUserId: null,
              expectedVersion: active.version,
            });
          }}
        />
        {focused ? null : (
          <EssentialsPanel
            copy={copy}
            essentials={essentials && essentials.ok ? essentials.essentials : null}
            note={note}
            onNote={setNote}
            onSaveNote={() => void sendNote()}
          />
        )}
      </div>

      <PosSheet
        open={sheet === "options"}
        title={copy.sendOptions}
        closeLabel={copy.inbox}
        onClose={() => setSheet(null)}
        name="messages-options"
      >
        <div className="space-y-2 p-4">
          {commerceFamilies.map((kind) => (
            <button
              key={kind}
              type="button"
              className={POS_SECONDARY_ACTION}
              onClick={() => {
                if (!active) return;
                void messagingSendOptions({ inquiryId: active.id, kind, payload: { title: kind } }).then((result) => {
                  if (!result.ok) setRefusal(copy.refusal(result.reason));
                  else void openThread(active.id);
                  setSheet(null);
                });
              }}
            >
              {kind}
            </button>
          ))}
        </div>
      </PosSheet>

      <PosSheet
        open={sheet === "payment"}
        title={copy.requestPayment}
        closeLabel={copy.inbox}
        onClose={() => setSheet(null)}
        name="messages-payment"
      >
        <div className="space-y-2 p-4">
          {(["deposit", "full", "none"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className={POS_PRIMARY_ACTION}
              onClick={() => {
                if (!active) return;
                const chip = active.recordChips.find((row) => row.kind === "order");
                if (!chip) {
                  setRefusal(copy.refusal("not_found"));
                  return;
                }
                void messagingRequestPayment({
                  inquiryId: active.id,
                  orderId: chip.recordId,
                  amountKind: kind,
                  amountCents: kind === "none" ? 0 : 100,
                  idempotencyKey: `pay-${active.id}-${chip.recordId}`,
                  publicOrigin: window.location.origin,
                  expectedVersion: active.version,
                }).then((result) => {
                  if (!result.ok) setRefusal(copy.refusal(result.reason));
                  setSheet(null);
                });
              }}
            >
              {copy[kind]}
            </button>
          ))}
        </div>
      </PosSheet>

      <PosSheet
        open={sheet === "lost"}
        title={copy.closeLost}
        closeLabel={copy.inbox}
        onClose={() => setSheet(null)}
        name="messages-lost"
      >
        <form
          className="space-y-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!active) return;
            const data = new FormData(event.currentTarget);
            void messagingCloseLost({
              inquiryId: active.id,
              reason: String(data.get("reason") ?? ""),
              expectedVersion: active.version,
            }).then((result) => {
              if (!result.ok) setRefusal(copy.refusal(result.reason));
              setSheet(null);
              void reload();
            });
          }}
        >
          <input className={POS_INPUT} name="reason" required minLength={2} />
          <button type="submit" className={POS_PRIMARY_ACTION}>
            {copy.closeLost}
          </button>
        </form>
      </PosSheet>

      <PosSheet
        open={sheet === "start"}
        title={copy.newConversation}
        closeLabel={copy.inbox}
        onClose={() => setSheet(null)}
        name="messages-start"
      >
        <form
          className="space-y-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const channel = String(data.get("channel") ?? "email");
            if (channel === "web_chat") {
              setRefusal(copy.webChatOnlyCustomer);
              return;
            }
            void messagingStartConversation({
              name: String(data.get("name") ?? ""),
              email: String(data.get("email") ?? "") || null,
              phone: String(data.get("phone") ?? "") || null,
              channel: channel as "email" | "whatsapp" | "sms" | "counter",
            }).then((result) => {
              if (!result.ok) setRefusal(copy.refusal(result.reason));
              setSheet(null);
              void reload();
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
            <option value="web_chat">web_chat</option>
          </select>
          <button type="submit" className={POS_PRIMARY_ACTION}>
            {copy.newConversation}
          </button>
        </form>
      </PosSheet>
      <button type="button" className="sr-only" onClick={() => setToast(copy.toastIncoming)}>
        {copy.toastIncoming}
      </button>
    </div>
  );
}

function familiesForMode(mode: PosMode): Array<"menu_options" | "service_card" | "professional_times" | "class_card" | "tickets_card"> {
  if (mode === "counter") return ["menu_options"];
  if (mode === "classes") return ["service_card", "professional_times", "class_card"];
  if (mode === "floor") return ["menu_options"];
  if (mode === "door") return ["tickets_card"];
  return ["service_card"];
}

export { POS_SURFACE };
