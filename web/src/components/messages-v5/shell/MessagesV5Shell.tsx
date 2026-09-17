"use client";

/**
 * MessagesV5Shell (L2): the container every pane mounts into. Three columns
 * at ≥1280 (D01), two with the context panel as a right drawer at 900–1279
 * (D11), one below 900 with inbox ⇄ thread ⇄ Details sheet (M01/M02/M04).
 * Reads `messagingLoadInbox` / `messagingLoadThread` / `messagingLoadEssentials`,
 * patches rows live through `useMessagingInboxLive`, keeps one unsent draft
 * per thread, marks a thread read on open, and routes every action id
 * through `routeShellAction` (wired here, or the "Coming in this program"
 * sheet). Front door to the POS engine: nothing is written from here that
 * the engine does not already write.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { draftStorageKey, readDraft, writeDraft } from "@/components/admin/pos/messages/draft-storage";
import { useT } from "@/i18n/use-t";
import { applyInboxRowPatch, useMessagingInboxLive } from "@/lib/messages-v5/use-inbox-live";
import { keepActiveRow } from "@/lib/messaging/inbox-search";
import { customerThreadUrl } from "@/lib/messaging/thread-link";
import { deriveTasks } from "@/lib/messaging/tasks";
import type { ConversationHistoryEntry, Essentials, InboxFilter, InboxRow, InquiryMessagingState, MessagingRefusal, ThreadMessage } from "@/lib/messaging/types";

import "../kit/tokens.css";
import "./shell.css";

import { type InboxFilterKey, type InboxSegment } from "../kit/InboxSegments";
import { Avatar, Btn } from "../kit/primitives";
import { OkLine, RefusalLine } from "../kit/RefusalLine";
import type { ContextPanelAction, ShellActionId } from "../screens/contracts";
import { buildScreenCopy } from "../screens/copy";
import { IdentityCaptureWire } from "../screens/IdentityCaptureWire";
import { TASK_ACTION, routeShellAction } from "../screens/NextStep";
import { ClientSheet, ComingSheet, ContextPanel, DetailsSheet, HistorySheet, Inbox, RenameInline, TasksTray } from "../screens/slots";
import { Thread, ThreadEmpty, type ThreadMenuItem } from "../screens/Thread";
import { liveShellEngine, type ShellEngine } from "./engine";
import { contextPlacement, layoutForWidth, shellClassName, variantForLayout, type MobilePane, type ShellLayout } from "./layout";
import { AssignSheet, LinkSheet, LostSheet, NewConversationSheet } from "./ShellSheets";

const SEGMENT_FILTER: Record<InboxSegment, InboxFilter> = { needs: "needs_reply", wait: "awaiting_customer", all: "all" };

export type MessagesV5ShellProps = {
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly locationSlug?: string;
  readonly currentUserId: string | null;
  /** "talent" workspaces see "Talent & services"; everything else sees "Items". */
  readonly workspaceType?: string | null;
  readonly initialInquiryId?: string | null;
  readonly locale?: string;
  /** Dev preview and tests: a fixture engine and a forced width instead of measuring. */
  readonly engine?: ShellEngine;
  readonly forceWidth?: number;
  readonly live?: boolean;
};

type SheetName = "assign" | "handover" | "lost" | "link" | "history" | "tasks" | "client" | "details" | "new" | null;

export function MessagesV5Shell(props: MessagesV5ShellProps) {
  const t = useT();
  const copy = useMemo(() => buildScreenCopy(t), [t]);
  const engine = props.engine ?? liveShellEngine;
  const locationSlug = props.locationSlug ?? "default";
  const locale = props.locale ?? "en";
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [layout, setLayout] = useState<ShellLayout>(props.forceWidth ? layoutForWidth(props.forceWidth) : "three");
  const [pane, setPane] = useState<MobilePane>("inbox");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const variant = variantForLayout(layout);
  const placement = contextPlacement(layout);

  const [segment, setSegment] = useState<InboxSegment>("needs");
  const [chips, setChips] = useState<InboxFilterKey[]>([]);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [inboxError, setInboxError] = useState<MessagingRefusal | null>(null);
  const [unreadTotal, setUnreadTotal] = useState<number | null>(null);

  const [activeId, setActiveId] = useState<string | null>(props.initialInquiryId ?? null);
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [essentials, setEssentials] = useState<Essentials | null>(null);
  const [threadError, setThreadError] = useState<MessagingRefusal | null>(null);
  const [draft, setDraft] = useState("");
  const [noteRequest, setNoteRequest] = useState(0);
  const [whatsappConnected, setWhatsappConnected] = useState(false);

  const [sheet, setSheet] = useState<SheetName>(null);
  const [coming, setComing] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [headerBusy, setHeaderBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "refusal"; code: MessagingRefusal } | { kind: "ok"; text: string } | null>(null);
  const [history, setHistory] = useState<ConversationHistoryEntry[] | null>(null);
  const [historyError, setHistoryError] = useState<MessagingRefusal | null>(null);
  const [link, setLink] = useState<{ url: string | null; copied: boolean; refusal: MessagingRefusal | null }>({ url: null, copied: false, refusal: null });
  const [toast, setToast] = useState<{ inquiryId: string; name: string; preview: string } | null>(null);

  /* ------------------------------------------------------------ layout */
  useEffect(() => {
    if (props.forceWidth) {
      setLayout(layoutForWidth(props.forceWidth));
      return;
    }
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const sync = () => setLayout(layoutForWidth(el.getBoundingClientRect().width));
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [props.forceWidth]);

  useEffect(() => {
    if (layout !== "two") setDrawerOpen(false);
  }, [layout]);

  /* ------------------------------------------------------------- inbox */
  const activeIdRef = useRef<string | null>(null);
  const reloadInbox = useCallback(async () => {
    const filter = SEGMENT_FILTER[segment];
    const result = await engine.loadInbox({ locationSlug, filter });
    setInboxLoading(false);
    if (!result.ok) {
      setInboxError(result.reason);
      return;
    }
    // The thread the operator is on stays listed when the segment no longer
    // returns it (a reply moved it from Needs action to Waiting); its row is
    // re-read from the unfiltered inbox so the next write sends the version
    // the last one moved it to.
    const active = activeIdRef.current;
    let fresh: InboxRow | null = null;
    if (active && filter !== "all" && !result.rows.some((row) => row.id === active)) {
      const all = await engine.loadInbox({ locationSlug, filter: "all" });
      if (all.ok) fresh = all.rows.find((row) => row.id === active) ?? null;
    }
    setInboxError(null);
    setRows((previous) => keepActiveRow(result.rows, active, previous, fresh));
    setUnreadTotal(result.unreadCount);
  }, [engine, locationSlug, segment]);

  useEffect(() => {
    setInboxLoading(true);
    void reloadInbox();
  }, [reloadInbox]);

  useEffect(() => {
    void engine.whatsappConnected().then(setWhatsappConnected);
  }, [engine]);

  const activeRow = useMemo(() => rows.find((r) => r.id === activeId) ?? null, [rows, activeId]);
  const activeRowRef = useRef<InboxRow | null>(null);
  useEffect(() => {
    activeRowRef.current = activeRow;
  }, [activeRow]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  /* ------------------------------------------------------------ thread */
  const loadThread = useCallback(
    async (id: string) => {
      const [thread, ess] = await Promise.all([engine.loadThread({ inquiryId: id }), engine.loadEssentials({ inquiryId: id })]);
      if (!thread.ok) {
        setThreadError(thread.reason);
        setMessages([]);
      } else {
        setThreadError(null);
        setMessages(thread.messages);
      }
      if (ess.ok) setEssentials(ess.essentials);
    },
    [engine],
  );

  const openThread = useCallback(
    (id: string) => {
      setActiveId(id);
      setMessages(null);
      setEssentials(null);
      setThreadError(null);
      setNotice(null);
      setMenuOpen(false);
      setRenaming(false);
      setCapturing(false);
      setDraft(readDraft(draftStorageKey(props.tenantId, locationSlug, id)));
      setPane("thread");
      setToast((cur) => (cur?.inquiryId === id ? null : cur));
      void loadThread(id).then(() => {
        void engine.markRead({ tenantSlug: props.tenantSlug, inquiryId: id });
        setRows((prev) => {
          const row = prev.find((r) => r.id === id);
          if (!row || row.unreadCount === 0) return prev;
          setUnreadTotal((n) => (n === null ? n : Math.max(0, n - row.unreadCount)));
          return prev.map((r) => (r.id === id ? { ...r, unread: false, unreadCount: 0 } : r));
        });
      });
    },
    [engine, loadThread, locationSlug, props.tenantId, props.tenantSlug],
  );

  // Only the first mount opens the deep-linked thread; the ref empties itself.
  const initialRef = useRef<string | null>(props.initialInquiryId ?? null);
  useEffect(() => {
    const id = initialRef.current;
    if (!id) return;
    initialRef.current = null;
    openThread(id);
  }, [openThread]);

  useMessagingInboxLive({
    tenantId: props.live === false ? null : props.tenantId,
    onRowPatch: useCallback((patch) => setRows((prev) => applyInboxRowPatch(prev, patch)), []),
    onIncoming: useCallback(
      (event) => {
        setUnreadTotal((n) => (n === null ? n : n + 1));
        const current = activeRowRef.current;
        if (current && current.id === event.inquiryId) {
          void loadThread(event.inquiryId);
        } else {
          setToast({ inquiryId: event.inquiryId, name: rows.find((r) => r.id === event.inquiryId)?.contactName ?? copy.shell.toastNew, preview: event.preview });
        }
      },
      [copy.shell.toastNew, loadThread, rows],
    ),
  });

  const refreshAll = useCallback(async () => {
    if (activeId) await loadThread(activeId);
    await reloadInbox();
  }, [activeId, loadThread, reloadInbox]);

  /* ----------------------------------------------------- derived state */
  const recordChips = useMemo(() => essentials?.linked ?? activeRow?.recordChips ?? [], [essentials?.linked, activeRow?.recordChips]);
  const state: InquiryMessagingState = useMemo(
    () => ({ conversation: activeRow?.conversationState ?? "needs_reply", opportunity: activeRow?.opportunityState ?? null, records: recordChips.map((c) => ({ kind: c.kind, recordId: c.recordId })) }),
    [activeRow?.conversationState, activeRow?.opportunityState, recordChips],
  );
  const tasks = useMemo(() => {
    if (!activeRow) return [];
    const failed = recordChips.some((c) => c.paymentState === "failed");
    const expired = recordChips.some((c) => c.paymentState === "expired");
    return deriveTasks({
      conversationState: activeRow.conversationState,
      opportunityState: activeRow.opportunityState,
      recordChips,
      identityLevel: essentials?.customer.identityLevel ?? "none",
      unanswered: activeRow.conversationState === "needs_reply",
      talentConfirmationsPending: 0,
      balanceDueAt: null,
      reminderDueAt: null,
      holdExpiresAt: null,
      paymentIssue: failed ? "failed" : expired ? "expired" : null,
    });
  }, [activeRow, essentials?.customer.identityLevel, recordChips]);
  const itemsLabel = props.workspaceType === "talent" ? copy.shell.itemsTalent : copy.shell.itemsGeneric;
  const counts = useMemo(() => ({ [segment]: rows.length }) as Partial<Record<InboxSegment, number>>, [segment, rows.length]);

  /* ------------------------------------------------------------ actions */
  const withVersion = useCallback(
    async (run: (input: { inquiryId: string; expectedVersion: number }) => Promise<{ ok: true } | { ok: false; reason: MessagingRefusal }>) => {
      const row = activeRowRef.current;
      if (!row) return null;
      setHeaderBusy(true);
      const result = await run({ inquiryId: row.id, expectedVersion: row.version });
      setHeaderBusy(false);
      if (!result.ok) {
        setNotice({ kind: "refusal", code: result.reason });
        if (result.reason === "conflict" || result.reason === "version_stale") await reloadInbox();
        return result.reason;
      }
      setNotice(null);
      await refreshAll();
      return null;
    },
    [refreshAll, reloadInbox],
  );

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }, []);

  const dispatch = useCallback(
    (id: ShellActionId) => {
      const route = routeShellAction(id);
      if (route.kind === "coming") {
        setComing(route.seam);
        return;
      }
      switch (id) {
        case "reply":
          setPane("thread");
          document.getElementById("msgv5-composer-input")?.focus();
          return;
        case "add_note":
          setNoteRequest((n) => n + 1);
          document.getElementById("msgv5-composer-input")?.focus();
          return;
        case "resolve":
          void withVersion((v) => engine.resolve(v));
          return;
        case "reopen":
          void withVersion((v) => engine.reopen(v));
          return;
        case "assign":
          setSheet("assign");
          return;
        case "handover":
          setSheet("handover");
          return;
        case "rename":
          setRenaming(true);
          return;
        case "close_lost":
          setSheet("lost");
          return;
        case "history": {
          setHistory(null);
          setHistoryError(null);
          setSheet("history");
          const row = activeRowRef.current;
          if (row) {
            void engine.history({ inquiryId: row.id }).then((r) => {
              if (r.ok) setHistory(r.entries);
              else setHistoryError(r.reason as MessagingRefusal);
            });
          }
          return;
        }
        case "copy_link": {
          const row = activeRowRef.current;
          if (!row) return;
          setLink({ url: null, copied: false, refusal: null });
          setSheet("link");
          void engine.threadLink({ inquiryId: row.id }).then(async (r) => {
            if (!r.ok) {
              setLink({ url: null, copied: false, refusal: r.reason });
              return;
            }
            const url = customerThreadUrl(window.location.origin, r.token);
            const copied = url ? await copyText(url) : false;
            setLink({ url, copied, refusal: null });
          });
          return;
        }
        case "capture_identity":
          setCapturing(true);
          setPane("thread");
          return;
        case "open_client":
          setSheet("client");
          return;
        case "new_conversation":
          setSheet("new");
          return;
        case "send_file":
          setPane("thread");
          document.querySelector<HTMLButtonElement>(`[data-composer-wire] button[aria-label="${copy.kit.composer.attach}"]`)?.click();
          return;
        default:
          return;
      }
    },
    [copy.kit.composer.attach, copyText, engine, withVersion],
  );

  const onPanelAction = useCallback(
    (kind: ContextPanelAction) => {
      const map: Record<ContextPanelAction, ShellActionId> = { reply: "reply", capture_identity: "capture_identity", open_client: "open_client", add_items: "add_items", create_offer: "create_offer", revise_offer: "revise_offer", request_payment: "request_payment", confirm: "confirm", remind: "remind", add_note: "add_note", add_file: "send_file", link_record: "link_record", open_record: "open_record", history: "history", reopen: "reopen" };
      setDrawerOpen(false);
      if (sheet === "details") setSheet(null);
      dispatch(map[kind]);
    },
    [dispatch, sheet],
  );

  const menuItems: ThreadMenuItem[] = useMemo(
    () => [
      { id: "rename", label: copy.shell.menuRename, icon: "note" },
      { id: "handover", label: copy.shell.menuHandover, icon: "hand" },
      { id: "copy_link", label: copy.shell.menuCopyLink, icon: "link" },
      { id: "history", label: copy.shell.menuHistory, icon: "clock" },
      { id: "close_lost", label: copy.shell.menuCloseLost, icon: "ban" },
    ],
    [copy.shell],
  );

  /* ------------------------------------------------------------- render */
  const inbox = (
    <Inbox
      rows={rows}
      filter={segment}
      onFilter={setSegment}
      chips={chips}
      onToggleChip={(key) => setChips((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]))}
      search={search}
      onSearch={setSearch}
      selectedId={activeId}
      onSelect={openThread}
      loading={inboxLoading}
      error={inboxError}
      onRetry={() => void reloadInbox()}
      unreadTotal={unreadTotal}
      counts={counts}
      onNew={() => dispatch("new_conversation")}
      currentUserId={props.currentUserId}
      copy={copy.kit}
      variant={variant}
    />
  );

  const panelProps = { essentials, state, chips: recordChips, tasks, itemsLabel, loading: activeId !== null && essentials === null, copy: copy.kit, variant, onAction: onPanelAction } as const;

  const thread = activeRow ? (
    <Thread
      key={activeRow.id}
      row={activeRow}
      essentials={essentials}
      messages={messages}
      error={threadError}
      state={state}
      chips={recordChips}
      tasks={tasks}
      currentUserId={props.currentUserId}
      copy={copy}
      variant={variant}
      locale={locale}
      origin={typeof window === "undefined" ? undefined : window.location.origin}
      headerBusy={headerBusy}
      onBack={layout === "one" ? () => setPane("inbox") : undefined}
      onAction={(id) => dispatch(id)}
      onCopyText={(text) => void copyText(text).then((ok) => setNotice(ok ? { kind: "ok", text: copy.shell.linkCopied } : { kind: "refusal", code: "unavailable" }))}
      onRetryLoad={() => void loadThread(activeRow.id)}
      onMoreTasks={() => setSheet("tasks")}
      menuOpen={menuOpen}
      onMenu={setMenuOpen}
      menuItems={menuItems}
      detailsAction={placement === "column" ? null : { label: copy.kit.thread.details, onClick: () => (placement === "drawer" ? setDrawerOpen(true) : setSheet("details")) }}
      notice={notice ? notice.kind === "refusal" ? <RefusalLine code={notice.code} copy={copy.kit} variant={variant} action={{ label: copy.kit.sheet.close, onClick: () => setNotice(null) }} /> : <OkLine text={notice.text} variant={variant} /> : null}
      renameSlot={
        renaming && essentials ? (
          <RenameInline
            name={essentials.name}
            version={essentials.version}
            onSave={async (name, expectedVersion) => {
              const r = await engine.rename({ inquiryId: activeRow.id, name, expectedVersion });
              if (r.ok) {
                setRenaming(false);
                await refreshAll();
              }
              return r;
            }}
            onCancel={() => setRenaming(false)}
            copy={copy.kit}
            variant={variant}
          />
        ) : null
      }
      captureSlot={
        capturing ? (
          <IdentityCaptureWire
            inquiryId={activeRow.id}
            version={activeRow.version}
            essentials={essentials}
            copy={copy}
            variant={variant}
            actions={engine.identity}
            onDone={() => void refreshAll()}
            onComing={setComing}
          />
        ) : null
      }
      composer={{
        inquiryId: activeRow.id,
        version: activeRow.version,
        channel: activeRow.channel,
        resolved: activeRow.conversationState === "resolved",
        actions: engine.composer,
        whatsappConnected,
        draft,
        onDraftChange: (value) => {
          setDraft(value);
          writeDraft(draftStorageKey(props.tenantId, locationSlug, activeRow.id), value);
        },
        onWrote: refreshAll,
        onConflict: async () => {
          const all = await engine.loadInbox({ locationSlug, filter: "all" });
          const fresh = all.ok ? (all.rows.find((r) => r.id === activeRow.id) ?? null) : null;
          if (fresh) setRows((prev) => (prev.some((r) => r.id === fresh.id) ? prev.map((r) => (r.id === fresh.id ? fresh : r)) : [fresh, ...prev]));
          await loadThread(activeRow.id);
          return fresh ? fresh.version : null;
        },
        onReopened: () => void refreshAll(),
        onTray: (key) => {
          const map: Record<typeof key, ShellActionId> = { add_items: "add_items", offer: "create_offer", times: "send_times", payment: "request_payment", file: "send_file", template: "add_note", link: "link_record", reminder: "remind", handover: "handover", close_lost: "close_lost" };
          dispatch(map[key]);
        },
        onComing: setComing,
        textareaId: "msgv5-composer-input",
        noteRequest,
      }}
    />
  ) : (
    <ThreadEmpty copy={copy} variant={variant} />
  );

  const panel = activeRow ? <ContextPanel {...panelProps} onClose={placement === "drawer" ? () => setDrawerOpen(false) : undefined} /> : null;

  const overlay = sheet !== null || coming !== null || drawerOpen;
  const s = copy.shell;

  return (
    <div ref={rootRef} className={shellClassName({ layout, pane, drawerOpen, overlay })} data-messages-v5 data-layout={layout}>
      {inbox}
      {thread}
      {placement === "column" ? (panel ?? <section className="pane panel" data-context-panel="empty" />) : null}
      {placement === "drawer" && drawerOpen && panel ? (
        <>
          <button type="button" className="scrim" aria-label={copy.kit.sheet.close} onClick={() => setDrawerOpen(false)} />
          <div className="drawer" data-context-drawer>
            {panel}
          </div>
        </>
      ) : null}
      {placement === "sheet" && activeRow ? <DetailsSheet {...panelProps} open={sheet === "details"} onClose={() => setSheet(null)} /> : null}
      {essentials ? <ClientSheet essentials={essentials} open={sheet === "client"} onClose={() => setSheet(null)} copy={copy.kit} variant={variant} onAction={(kind) => (kind === "capture_identity" ? dispatch("capture_identity") : setComing("edit contact fields"))} /> : null}
      <HistorySheet entries={history} open={sheet === "history"} onClose={() => setSheet(null)} copy={copy.kit} variant={variant} error={historyError} locale={locale} />
      <TasksTray tasks={tasks} open={sheet === "tasks"} onClose={() => setSheet(null)} onPick={(key) => { setSheet(null); const id = TASK_ACTION[key]; if (id) dispatch(id); }} copy={copy.kit} variant={variant} />
      <AssignSheet open={sheet === "assign" || sheet === "handover"} mode={sheet === "handover" ? "handover" : "assign"} onClose={() => setSheet(null)} copy={copy} variant={variant} currentOwnerId={activeRow?.ownerUserId ?? null} loadTargets={engine.handOverTargets} onPick={async (ownerUserId) => (sheet === "handover" && ownerUserId ? withVersion((v) => engine.handOver({ ...v, ownerUserId })) : withVersion((v) => engine.assign({ ...v, ownerUserId })))} />
      <LostSheet open={sheet === "lost"} onClose={() => setSheet(null)} copy={copy} variant={variant} onConfirm={(reason) => withVersion((v) => engine.closeLost({ ...v, reason }))} />
      <LinkSheet open={sheet === "link"} onClose={() => setSheet(null)} copy={copy} variant={variant} url={link.url} copied={link.copied} refusal={link.refusal} onCopy={() => { if (link.url) void copyText(link.url).then((ok) => setLink((l) => ({ ...l, copied: ok }))); }} />
      <NewConversationSheet
        open={sheet === "new"}
        onClose={() => setSheet(null)}
        copy={copy}
        variant={variant}
        onStart={async (input) => {
          const r = await engine.startConversation(input);
          if (!r.ok) return r.reason;
          await reloadInbox();
          openThread(r.inquiryId);
          return null;
        }}
      />
      <ComingSheet open={coming !== null} seam={coming} onClose={() => setComing(null)} copy={copy.kit} shell={s} variant={variant} />
      {toast ? (
        <div className="toast-host">
          <div className="toast" role="status" data-incoming-toast>
            <Avatar name={toast.name} />
            <div className="tx">
              <b>{toast.name}</b>
              <span>{toast.preview}</span>
            </div>
            <Btn size="sm" variant="primary" onClick={() => openThread(toast.inquiryId)}>
              {s.toastOpen}
            </Btn>
          </div>
        </div>
      ) : null}
    </div>
  );
}
