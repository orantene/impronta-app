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
import { itemsLabelForPreset } from "@/lib/messages-v5/context-view";
import { duplicateHint } from "@/lib/messages-v5/duplicates";
import { latestHoldExpiresAt } from "@/lib/messages-v5/hold-expiry-from-messages";
import { messagingResolveOrderThread } from "@/lib/server-actions/messaging-engine";
import { findConversationForOrder } from "@/lib/messages-v5/pos-continuity";
import { applyInboxRowPatch, useMessagingInboxLive } from "@/lib/messages-v5/use-inbox-live";
import { keepActiveRow } from "@/lib/messaging/inbox-search";
import { isGeneratedName } from "@/lib/messaging/inquiry-name-pure";
import { customerThreadUrl } from "@/lib/messaging/thread-link";
import { deriveTasks } from "@/lib/messaging/tasks";
import { localizeTasks } from "@/lib/messages-v5/localize-tasks";
import type { ConversationHistoryEntry, CustomerMatch, Essentials, InboxFilter, InboxRow, InquiryMessagingState, MessagingRefusal, ThreadMessage } from "@/lib/messaging/types";

import "../kit/tokens.css";
import "./shell.css";

import { type InboxFilterKey, type InboxSegment } from "../kit/InboxSegments";
import { Avatar, Btn } from "../kit/primitives";
import { OkLine, RefusalLine } from "../kit/RefusalLine";
import { holdSlotLabelFromMessages } from "@/lib/messages-v5/client-thread-view";
import type { ContextItemLine, ContextMoney, ContextPanelAction, ShellActionId } from "../screens/contracts";
import { formatCents } from "@/lib/bookings/commission";
import { buildScreenCopy } from "../screens/copy";
import { IdentityCaptureWire } from "../screens/IdentityCaptureWire";
import { TASK_ACTION, routeShellAction } from "../screens/NextStep";
import { ClientSheet, ComingSheet, ContextDrawer, ContextPanel, DetailsSheet, HistorySheet, Inbox, MergeCard, RenameInline, TasksTray } from "../screens/slots";
import { ActionSheetHost } from "../screens/sheet-host";
import { registeredActionSheet } from "../screens/sheet-registry";
import "../screens/sheets";
import { Thread, ThreadEmpty, type ThreadMenuItem } from "../screens/Thread";
import { liveShellEngine, type ShellEngine } from "./engine";
import { contextPlacement, layoutForWidth, shellClassName, variantForLayout, type MobilePane, type ShellLayout } from "./layout";
import { AssignSheet, LinkSheet, LostSheet, NewConversationSheet } from "./ShellSheets";

const SEGMENT_FILTER: Record<InboxSegment, InboxFilter> = { needs: "needs_reply", wait: "awaiting_customer", all: "all" };

const digits = (value: string | null) => (value ?? "").replace(/\D/g, "");
/** A loaded row belongs to a customer match when the phone digits or the email agree. */
function sameContact(row: InboxRow, match: CustomerMatch): boolean {
  const phone = digits(match.phoneE164);
  if (phone && digits(row.contactPhone) === phone) return true;
  const email = (match.email ?? "").trim().toLowerCase();
  return !!email && (row.contactEmail ?? "").trim().toLowerCase() === email;
}

export type MessagesV5ShellProps = {
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly locationSlug?: string;
  readonly currentUserId: string | null;
  /** "talent" workspaces see "Talent & services"; everything else sees "Items" (fallback when `industryPreset` is absent). */
  readonly workspaceType?: string | null;
  /** `agencies.settings.industry_preset` when the mount knows it: L3's finer Items label (Talent & services / Services / Order items / Menu, D-MSG-90). */
  readonly industryPreset?: unknown;
  readonly initialInquiryId?: string | null;
  /** `/admin/messages?order=<id>`: open the thread whose order chip matches, once the inbox rows are loaded. Inquiry wins when both are set. */
  readonly initialOrderId?: string | null;
  readonly locale?: string;
  /** Dev preview and tests: a fixture engine and a forced width instead of measuring. */
  readonly engine?: ShellEngine;
  readonly forceWidth?: number;
  readonly live?: boolean;
  /**
   * L10 (D-MSG-172), additive: hides the inbox rail (thread + context panel
   * take the full width). The POS "This customer" dock view uses this so its
   * own tab strip, not a second inbox list, is how the person gets to Inbox.
   * Absent/false: unchanged.
   */
  readonly hideInboxRail?: boolean;
  /** Talent inbox: the open conversation, so her approve or decline can follow it. */
  readonly onActiveInquiry?: (inquiryId: string | null) => void;
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
  const [pane, setPane] = useState<MobilePane>(props.hideInboxRail ? "thread" : "inbox");
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
  const [contextItems, setContextItems] = useState<ContextItemLine[] | null>(null);
  const [contextMoney, setContextMoney] = useState<ContextMoney | null>(null);
  const [threadError, setThreadError] = useState<MessagingRefusal | null>(null);
  const [draft, setDraft] = useState("");
  const [noteRequest, setNoteRequest] = useState(0);
  const [whatsappConnected, setWhatsappConnected] = useState(false);

  const [sheet, setSheet] = useState<SheetName>(null);
  const [coming, setComing] = useState<string | null>(null);
  const [actionSheet, setActionSheet] = useState<ShellActionId | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [headerBusy, setHeaderBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "refusal"; code: MessagingRefusal } | { kind: "ok"; text: string } | null>(null);
  const [history, setHistory] = useState<ConversationHistoryEntry[] | null>(null);
  const [historyError, setHistoryError] = useState<MessagingRefusal | null>(null);
  const [link, setLink] = useState<{ url: string | null; copied: boolean; refusal: MessagingRefusal | null }>({ url: null, copied: false, refusal: null });
  const [toast, setToast] = useState<{ inquiryId: string; name: string; preview: string } | null>(null);
  // D14 "Same person?": the other OPEN row a customer match points at, found lazily when identity is uncertain (D-MSG-112).
  const [dupe, setDupe] = useState<{ forId: string; other: InboxRow; match: CustomerMatch } | null>(null);
  const [dupeBusy, setDupeBusy] = useState(false);
  const [dupeRefusal, setDupeRefusal] = useState<MessagingRefusal | null>(null);
  const [dupeDismissed, setDupeDismissed] = useState<ReadonlySet<string>>(() => new Set());

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
  useEffect(() => {
    props.onActiveInquiry?.(activeId);
  }, [activeId, props.onActiveInquiry]);

  /* ------------------------------------------------------------ thread */
  const loadThread = useCallback(
    async (id: string) => {
      const [thread, ess, ctxLines] = await Promise.all([
        engine.loadThread({ inquiryId: id }),
        engine.loadEssentials({ inquiryId: id }),
        engine.loadContextLines ? engine.loadContextLines({ inquiryId: id }) : Promise.resolve(null),
      ]);
      if (!thread.ok) {
        setThreadError(thread.reason);
        setMessages([]);
      } else {
        setThreadError(null);
        setMessages(thread.messages);
      }
      if (ess.ok) setEssentials(ess.essentials);
      if (ctxLines && ctxLines.ok) {
        const currency = ctxLines.money?.currency || "USD";
        const moneyLabel = (cents: number) => formatCents(cents, currency);
        setContextItems(
          ctxLines.lines
            ? ctxLines.lines.map((l) => ({ id: l.id, name: l.label, units: String(l.units), price: moneyLabel(l.unitCents * l.units), proposedBy: l.proposedBy, confirmed: l.confirmed }))
            : null,
        );
        setContextMoney(
          ctxLines.money
            ? { totalLabel: moneyLabel(ctxLines.money.totalCents), paidLabel: moneyLabel(ctxLines.money.paidCents), balanceLabel: moneyLabel(ctxLines.money.balanceCents), balanceDueCents: ctxLines.money.balanceCents }
            : null,
        );
      }
    },
    [engine],
  );

  const reloadActiveThread = useCallback(async () => {
    if (activeId) await loadThread(activeId);
  }, [activeId, loadThread]);

  const openThread = useCallback(
    (id: string) => {
      setActiveId(id);
      setMessages(null);
      setEssentials(null);
      setContextItems(null);
      setContextMoney(null);
      setThreadError(null);
      setNotice(null);
      setMenuOpen(false);
      setRenaming(false);
      setCapturing(false);
      setDupe(null);
      setDupeRefusal(null);
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

  const orderRef = useRef<string | null>(props.initialInquiryId ? null : props.initialOrderId ?? null);
  useEffect(() => {
    const orderId = orderRef.current;
    if (!orderId) return;
    const id = findConversationForOrder(rows, orderId);
    if (id) {
      orderRef.current = null;
      openThread(id);
      return;
    }
    // D-MSG-339: the chip match only sees the CURRENTLY LOADED rows, so a
    // thread on another page or behind another filter never opened. Ask the
    // server once; `conversation_records` is the same source the chips use.
    if (props.live === false) return;
    let cancelled = false;
    void (async () => {
      const res = await messagingResolveOrderThread({ orderId });
      if (cancelled || orderRef.current !== orderId) return;
      const resolved = res.ok ? res.inquiryId : null;
      if (!resolved) return;
      orderRef.current = null;
      openThread(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [rows, openThread, props.live]);

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

  /* ------------------------------------------- "Same person?" (D14) */
  // Owner decision 1: only when identity is uncertain. `messagingMatchCustomers`
  // names customers, not conversations, so "has another open conversation" is
  // answered from the rows this shell has loaded (`duplicateHint`'s
  // caller-supplied flag, D-MSG-102); a duplicate outside the loaded segment
  // draws no card (seam, D-MSG-112).
  const rowsRef = useRef<InboxRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  useEffect(() => {
    if (!activeId || !essentials) return;
    const c = essentials.customer;
    if ((c.identityLevel !== "none" && c.identityLevel !== "linked") || (!c.phone && !c.email)) return;
    if (dupeDismissed.has(activeId)) return;
    let cancelled = false;
    void engine.identity.match({ name: c.name, phone: c.phone ?? "", email: c.email ?? "" }).then((r) => {
      if (cancelled || !r.ok) return;
      const others = rowsRef.current.filter((row) => row.id !== activeId && row.conversationState !== "resolved");
      const candidates = r.matches.map((m) => ({ match: m, other: others.find((row) => sameContact(row, m)) ?? null }));
      if (!duplicateHint({ identityLevel: c.identityLevel }, candidates.map(({ match, other }) => ({ customerId: match.customerId, hasOpenConversation: other !== null })))) return;
      const hit = candidates.find(({ match, other }) => match.customerId !== null && other !== null);
      if (hit && hit.other) setDupe({ forId: activeId, other: hit.other, match: hit.match });
    });
    return () => {
      cancelled = true;
    };
  }, [activeId, dupeDismissed, engine, essentials]);

  /* ----------------------------------------------------- derived state */
  const recordChips = useMemo(() => essentials?.linked ?? activeRow?.recordChips ?? [], [essentials?.linked, activeRow?.recordChips]);
  const state: InquiryMessagingState = useMemo(
    () => ({ conversation: activeRow?.conversationState ?? "needs_reply", opportunity: activeRow?.opportunityState ?? null, records: recordChips.map((c) => ({ kind: c.kind, recordId: c.recordId })) }),
    [activeRow?.conversationState, activeRow?.opportunityState, recordChips],
  );
  const holdExpiresAt = useMemo(() => latestHoldExpiresAt(messages), [messages]);
  const tasks = useMemo(() => {
    if (!activeRow) return [];
    const failed = recordChips.some((c) => c.paymentState === "failed");
    const expired = recordChips.some((c) => c.paymentState === "expired");
    return localizeTasks(deriveTasks({
      conversationState: activeRow.conversationState,
      opportunityState: activeRow.opportunityState,
      recordChips,
      identityLevel: essentials?.customer.identityLevel ?? "none",
      unanswered: activeRow.conversationState === "needs_reply",
      talentConfirmationsPending: 0,
      balanceDueAt: null,
      reminderDueAt: null,
      // D-MSG-301: close D-MSG-78 for hold expiry via card payloads on the open thread.
      holdExpiresAt,
      paymentIssue: failed ? "failed" : expired ? "expired" : null,
    }), copy.kit.taskWords);
  }, [activeRow, copy.kit.taskWords, essentials?.customer.identityLevel, holdExpiresAt, recordChips]);
  const itemsLabel = props.industryPreset !== undefined ? itemsLabelForPreset(props.industryPreset, copy.kit) : props.workspaceType === "talent" ? copy.shell.itemsTalent : copy.shell.itemsGeneric;
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

  /** One D14 write at a time; a refusal stays on the card, a version conflict also re-reads the row. */
  const runDupe = useCallback(
    async (run: () => Promise<{ ok: true } | { ok: false; reason: MessagingRefusal }>) => {
      setDupeBusy(true);
      setDupeRefusal(null);
      const result = await run();
      setDupeBusy(false);
      if (result.ok) return true;
      setDupeRefusal(result.reason);
      if (result.reason === "conflict" || result.reason === "version_stale") await reloadInbox();
      return false;
    },
    [reloadInbox],
  );

  const dispatch = useCallback(
    (id: ShellActionId) => {
      if (registeredActionSheet(id)) {
        setActionSheet(id);
        return;
      }
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
            const url = r.url ?? customerThreadUrl(window.location.origin, r.token);
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

  // L3 extras the shell can answer today: the notes count comes with essentials.
  // `items`, `money`, `filesCount`, `nextReminderLabel` and `clientHistoryLabel`
  // stay undefined until an engine reader returns them (D-MSG-111).
  const holdSlotLabel = useMemo(() => holdSlotLabelFromMessages(messages ?? [], locale), [messages, locale]);
  const panelProps = { essentials, state, chips: recordChips, tasks, itemsLabel, items: contextItems, money: contextMoney, loading: activeId !== null && essentials === null, copy: copy.kit, variant, onAction: onPanelAction, notesCount: essentials ? essentials.notes.length : null, holdSlotLabel } as const;

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
      onBack={layout === "one" && !props.hideInboxRail ? () => setPane("inbox") : undefined}
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
            generated={isGeneratedName(essentials.name, essentials.customer.name)}
          />
        ) : null
      }
      mergeSlot={
        dupe && dupe.forId === activeRow.id ? (
          <MergeCard
            duplicate={{ inquiryId: activeRow.id, name: essentials?.name ?? activeRow.subject }}
            into={{ inquiryId: dupe.other.id, name: dupe.other.subject, version: dupe.other.version }}
            busy={dupeBusy}
            refusal={dupeRefusal}
            onMerge={() => {
              const target = dupe.other.id;
              void runDupe(() => engine.merge({ duplicateInquiryId: activeRow.id, intoInquiryId: target, expectedVersion: activeRow.version })).then((ok) => {
                if (!ok) return;
                setDupe(null);
                void reloadInbox().then(() => openThread(target));
              });
            }}
            onKeepSeparate={
              dupe.match.customerId
                ? () => {
                    const customerId = dupe.match.customerId as string;
                    void runDupe(() => engine.identity.capture({ inquiryId: activeRow.id, level: "linked", method: dupe.match.phoneE164 && digits(dupe.match.phoneE164) === digits(essentials?.customer.phone ?? null) ? "phone" : "email", customerId, expectedVersion: activeRow.version })).then((ok) => {
                      if (!ok) return;
                      // "linked" still counts as uncertain (D-MSG-102); the person just answered, so no second card this session.
                      setDupeDismissed((set) => new Set(set).add(activeRow.id));
                      setDupe(null);
                      void refreshAll();
                    });
                  }
                : undefined
            }
            onDismiss={() => {
              setDupeDismissed((set) => new Set(set).add(activeRow.id));
              setDupe(null);
            }}
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

  const panel = activeRow ? <ContextPanel {...panelProps} /> : null;

  const overlay = sheet !== null || coming !== null || drawerOpen;
  const s = copy.shell;

  return (
    <div ref={rootRef} className={shellClassName({ layout, pane, drawerOpen, overlay, hideInboxRail: props.hideInboxRail })} data-messages-v5 data-layout={layout}>
      {props.hideInboxRail ? null : inbox}
      {thread}
      {placement === "column" ? (panel ?? <section className="pane panel" data-context-panel="empty" />) : null}
      {placement === "drawer" && activeRow ? <ContextDrawer {...panelProps} open={drawerOpen} onClose={() => setDrawerOpen(false)} /> : null}
      {placement === "sheet" && activeRow ? <DetailsSheet {...panelProps} open={sheet === "details"} onClose={() => setSheet(null)} /> : null}
      {essentials ? <ClientSheet essentials={essentials} open={sheet === "client"} onClose={() => setSheet(null)} copy={copy.kit} variant={variant} onAction={(kind) => (kind === "capture_identity" ? dispatch("capture_identity") : setComing("edit contact fields"))} /> : null}
      <HistorySheet entries={history} open={sheet === "history"} onClose={() => setSheet(null)} copy={copy.kit} variant={variant} error={historyError} />
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
      {actionSheet ? (
        <ActionSheetHost
          id={actionSheet}
          onClose={() => setActionSheet(null)}
          copy={copy}
          variant={variant}
          tenantId={props.tenantId}
          tenantSlug={props.tenantSlug}
          row={activeRow}
          essentials={essentials}
          messages={messages}
          state={state}
          chips={recordChips}
          tasks={tasks}
          reloadInbox={reloadInbox}
          reloadThread={reloadActiveThread}
          notify={setNotice}
          dispatch={dispatch}
        />
      ) : null}
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
