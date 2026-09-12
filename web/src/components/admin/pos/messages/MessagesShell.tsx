"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  POS_CHIP,
  POS_CHIP_ACTIVE,
  POS_CHIP_IDLE,
  POS_INPUT,
  POS_NOTE,
  POS_REFUSAL_BANNER,
  POS_SECONDARY_ACTION,
  POS_SURFACE,
} from "@/components/admin/pos/pos-classes";
import { useT } from "@/i18n/use-t";
import type { MessagingPreview, MessagingSheetName } from "@/lib/messaging/fixture";
import type { Essentials, InboxFilter, InboxRow, ThreadMessage } from "@/lib/messaging/types";
import { INBOX_FILTERS } from "@/lib/messaging/types";
import type { PosMode } from "@/lib/pos/modes";
import {
  messagingAssignOwner,
  messagingCloseLost,
  messagingInternalNote,
  messagingLoadEssentials,
  messagingLoadInbox,
  messagingLoadThread,
  messagingRecoverSnapshot,
  messagingReply,
  messagingRequestPayment,
  messagingResolve,
  messagingSearch,
  messagingSendOptions,
  messagingStartConversation,
} from "@/lib/server-actions/messaging-engine";
import { cn } from "@/lib/utils";

import { messagesCopy, pinMessagingKeys } from "./copy";
import { draftStorageKey, readDraft, writeDraft } from "./draft-storage";
import { EssentialsPanel } from "./EssentialsPanel";
import { IncomingToast } from "./IncomingToast";
import { InboxList } from "./InboxList";
import { PhoneMessages } from "./phone/PhoneMessages";
import { MessagingSheets } from "./sheets/MessagingSheets";
import { ThreadPane } from "./ThreadPane";

export type MessagesClientProps = {
  readonly mode: PosMode;
  readonly locationSlug: string;
  readonly tenantId: string;
  readonly adminBasePath: string;
  readonly returnHref?: string;
  readonly returnLabel?: string;
  readonly compact?: boolean;
  readonly preview?: MessagingPreview;
  /** Experimental WhatsApp drawer. Omit on the live Messages page. */
  readonly channelFilter?: "whatsapp" | "all";
  readonly initialInquiryId?: string | null;
};

const FILTERS: InboxFilter[] = [...INBOX_FILTERS];

export function MessagesShell(props: MessagesClientProps) {
  const t = useT();
  const copy = useMemo(() => {
    pinMessagingKeys(t);
    return messagesCopy(t);
  }, [t]);
  const preview = props.preview;
  const [filter, setFilter] = useState<InboxFilter>("needs_reply");
  const [rows, setRows] = useState<InboxRow[]>(preview?.rows ?? []);
  const [activeId, setActiveId] = useState<string | null>(preview?.activeId ?? null);
  const [messages, setMessages] = useState<ThreadMessage[]>(preview?.messages ?? []);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState(preview?.search ?? "");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [toast, setToast] = useState(Boolean(preview?.toast));
  const [loadState, setLoadState] = useState<"ok" | "empty" | "failed" | "no_results">(preview?.loadState ?? "ok");
  const [sheet, setSheet] = useState<MessagingSheetName | null>(preview?.sheet ?? null);
  const [essentials, setEssentials] = useState<Essentials | null>(preview?.essentials ?? null);
  const [focused, setFocused] = useState(Boolean(preview?.focused));
  // The inbox's own unread total (every filter, the same number the rail
  // badge shows); counting the loaded rows undercounted under any filter but
  // "all". Null until the first load answers.
  const [inboxUnread, setInboxUnread] = useState<number | null>(null);

  const draftKey = draftStorageKey(props.tenantId, props.locationSlug, activeId ?? "inbox");

  useEffect(() => {
    setDraft(readDraft(draftKey));
  }, [draftKey]);

  useEffect(() => {
    writeDraft(draftKey, draft);
  }, [draft, draftKey]);

  const reload = useCallback(async () => {
    if (preview) return;
    const result = await messagingLoadInbox({ locationSlug: props.locationSlug, filter });
    if (!result.ok) {
      setLoadState("failed");
      return;
    }
    const next =
      props.channelFilter === "whatsapp"
        ? result.rows.filter((row) => row.channel === "whatsapp")
        : result.rows;
    setRows(next);
    setInboxUnread(result.unreadCount);
    setLoadState(next.length === 0 ? (search ? "no_results" : "empty") : "ok");
  }, [filter, preview, props.channelFilter, props.locationSlug, search]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openThread = useCallback(
    async (id: string) => {
      setActiveId(id);
      if (preview) return;
      const [thread, ess] = await Promise.all([
        messagingLoadThread({ inquiryId: id }),
        messagingLoadEssentials({ inquiryId: id }),
      ]);
      if (thread.ok) setMessages(thread.messages);
      if (ess.ok) setEssentials(ess.essentials);
    },
    [preview],
  );

  useEffect(() => {
    if (props.initialInquiryId) void openThread(props.initialInquiryId);
  }, [openThread, props.initialInquiryId]);

  const active = rows.find((row) => row.id === activeId) ?? null;

  async function sendReply() {
    if (!active || draft.trim() === "") return;
    if (preview) {
      setDraft("");
      return;
    }
    const result = await messagingReply({
      inquiryId: active.id,
      body: draft,
      expectedVersion: active.version,
      channel: active.channel === "counter" ? undefined : active.channel,
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
    if (!active || (note || draft).trim() === "") return;
    if (preview) {
      setNote("");
      return;
    }
    const result = await messagingInternalNote({ inquiryId: active.id, body: note || draft });
    if (!result.ok) {
      setRefusal(copy.refusal(result.reason));
      return;
    }
    setNote("");
    setDraft("");
    await openThread(active.id);
  }

  const emptyCopy =
    loadState === "failed"
      ? { title: copy.failedLoad, body: copy.failedBody, action: copy.tryAgain, onAction: () => void reload() }
      : loadState === "no_results" || search
        ? { title: copy.noResults, body: copy.noResultsBody, action: copy.clearSearch, onAction: () => setSearch("") }
        : { title: copy.empty, body: copy.emptyBody, action: copy.shareBookingLink, onAction: () => setSheet("start") };

  // The sheets are ONE tree for both shapes: the phone used to return
  // `PhoneMessages` without them, so Actions / Payment link / Cash opened
  // nothing (live run 2026-09-11, MM02B / MM03). D-row.
  const sheets = (
    <MessagingSheets
      copy={copy}
      sheet={sheet}
      mode={props.mode}
      active={active}
      onClose={() => setSheet(null)}
      onOptions={(kind) => {
        if (!active || preview) {
          setSheet(null);
          return;
        }
        void messagingSendOptions({ inquiryId: active.id, kind: optionKind(kind), payload: { title: kind } }).then(
          (result) => {
            if (!result.ok) setRefusal(copy.refusal(result.reason));
            else void openThread(active.id);
            setSheet(null);
          },
        );
      }}
      onPayment={(kind) => {
        if (!active) return;
        const chip = active.recordChips.find((row) => row.kind === "order" || row.kind === "appointment");
        if (!chip || preview) {
          if (!chip && !preview) setRefusal(copy.refusal("not_found"));
          setSheet(null);
          return;
        }
        void messagingRequestPayment({
          inquiryId: active.id,
          orderId: chip.recordId,
          amountKind: kind,
          // No figure typed on this sheet: the engine reads the order's
          // total for "full". A deposit with no amount is refused in a
          // sentence rather than minted at a placeholder (D-row).
          amountCents: 0,
          idempotencyKey: `pay-${active.id}-${chip.recordId}`,
          publicOrigin: window.location.origin,
          expectedVersion: active.version,
        }).then((result) => {
          if (!result.ok) setRefusal(copy.refusal(result.reason));
          setSheet(null);
        });
      }}
      onLost={(reason) => {
        if (!active || preview) {
          setSheet(null);
          return;
        }
        void messagingCloseLost({ inquiryId: active.id, reason, expectedVersion: active.version }).then((result) => {
          if (!result.ok) setRefusal(copy.refusal(result.reason));
          setSheet(null);
          void reload();
        });
      }}
      onStart={(input) => {
        if (input.channel === "web_chat") {
          setRefusal(copy.webChatOnlyCustomer);
          return;
        }
        if (preview) {
          setSheet(null);
          return;
        }
        void messagingStartConversation({
          name: input.name,
          email: input.email || null,
          phone: input.phone || null,
          channel: input.channel as "email" | "whatsapp" | "sms" | "counter",
        }).then((result) => {
          if (!result.ok) setRefusal(copy.refusal(result.reason));
          setSheet(null);
          void reload();
        });
      }}
      onAssign={() => {
        if (!active || preview) {
          setSheet(null);
          return;
        }
        void messagingAssignOwner({
          inquiryId: active.id,
          ownerUserId: null,
          expectedVersion: active.version,
        }).then(() => setSheet(null));
      }}
      onRecover={() => {
        if (!active || preview) {
          setSheet(null);
          return;
        }
        const chip = active.recordChips.find((row) => row.kind === "order");
        if (!chip) {
          setRefusal(copy.refusal("not_found"));
          setSheet(null);
          return;
        }
        void messagingRecoverSnapshot({ snapshotId: `snap-${active.id}`, orderId: chip.recordId }).then((result) => {
          if (!result.ok) setRefusal(copy.refusal(result.reason));
          setSheet(null);
        });
      }}
      onSearch={(query) => {
        setSearch(query);
        setSheet(null);
      }}
    />
  );

  const compact = props.compact || Boolean(preview?.compact);
  if (compact) {
    return (
      <div className="relative flex h-full min-h-0 flex-1 flex-col" data-pos-messages="compact">
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
          onOpenSheet={setSheet}
          search={search}
          onSearch={setSearch}
          toast={toast}
          onToast={() => setToast(false)}
      />
        {sheets}
      </div>
    );
  }

  const portrait = Boolean(preview?.portrait);
  const openCount = rows.filter((row) => row.conversationState !== "resolved").length;
  const unreadCount = inboxUnread ?? rows.filter((row) => row.unread).length;
  const waitingCount = rows.filter((row) => row.conversationState === "awaiting_customer").length;

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col bg-admin-surface text-admin-ink", portrait ? "min-h-[1194px]" : "")}
      data-pos-messages="shell"
    >
      <header className="flex items-center justify-between gap-3 border-b border-admin-border-soft px-4 py-3">
        <div>
          <h1 className="text-[22px] font-semibold">{copy.title}</h1>
          <p className="text-[13px] text-admin-ink-muted">
            {props.locationSlug} · {openCount} {copy.openCount} · {unreadCount} {copy.filter.unread} · {waitingCount}{" "}
            {copy.filter.awaiting_customer}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {props.returnHref ? (
            <a className={POS_SECONDARY_ACTION} href={props.returnHref}>
              {props.returnLabel ?? copy.backToSale}
            </a>
          ) : (
            <button type="button" className={POS_SECONDARY_ACTION} disabled title={copy.disabled.rail}>
              {copy.backToSale}
            </button>
          )}
          <button type="button" className={POS_SECONDARY_ACTION} onClick={() => setSheet("start")}>
            {copy.newConversation}
          </button>
        </div>
      </header>
      <IncomingToast copy={copy} visible={toast} onOpen={() => setToast(false)} onLater={() => setToast(false)} />
      {refusal ? (
        <div className={cn(POS_REFUSAL_BANNER, "mx-4 mt-3")} data-pos-refusal="">
          {refusal}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        {focused ? (
          <aside className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-admin-border-soft py-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-admin-ink-muted">{copy.inbox}</span>
            <span className="text-[15px] font-semibold">{openCount}</span>
          </aside>
        ) : (
          <aside className="flex w-[340px] shrink-0 flex-col border-r border-admin-border-soft">
            {/* Wrapped, as MS02 draws them: a horizontal scroller hid the last
                three filters at 1194px (the awaiting / resolved rows were off
                the edge with no hint), and a filter nobody can see is not a
                filter. */}
            <div className="flex flex-wrap gap-1.5 p-3">
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
                setSheet("search");
                if (preview) {
                  setLoadState(search ? "no_results" : "ok");
                  return;
                }
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
            <InboxList
              rows={loadState === "ok" ? rows : []}
              activeId={activeId}
              emptyLabel={emptyCopy.title}
              emptyBody={emptyCopy.body}
              emptyAction={emptyCopy.action}
              onEmptyAction={emptyCopy.onAction}
              copy={copy}
              onOpen={(id) => void openThread(id)}
              onNextAction={(row) => {
                void openThread(row.id);
                if (row.nextAction === "assign") setSheet("assign");
                if (row.nextAction === "collect") setSheet("payment");
                if (row.nextAction === "follow_up") setSheet("follow");
              }}
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
          onNote={() => void sendNote()}
          focused={focused}
          onToggleFocus={() => setFocused((value) => !value)}
          onOpenSheet={setSheet}
          onAssign={() => setSheet("assign")}
          onResolve={() => {
            if (!active) return;
            if (preview) return;
            void messagingResolve({ inquiryId: active.id, expectedVersion: active.version }).then((result) => {
              if (!result.ok) setRefusal(copy.refusal(result.reason));
              else void reload();
            });
          }}
        />
        <EssentialsPanel
          copy={copy}
          essentials={essentials}
          note={note}
          onNote={setNote}
          onSaveNote={() => void sendNote()}
          collapsed={focused}
          onOpenSheet={setSheet}
        />
      </div>
      {portrait ? <p className={cn(POS_NOTE, "m-3")}>{copy.disabled.rail}</p> : null}

      {sheets}
    </div>
  );
}

function optionKind(
  kind: string,
): "menu_options" | "service_card" | "professional_times" | "class_card" | "tickets_card" {
  if (kind === "service_card" || kind === "professional_times" || kind === "class_card" || kind === "tickets_card") {
    return kind;
  }
  return "menu_options";
}

export { POS_SURFACE };
