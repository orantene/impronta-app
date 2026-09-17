"use client";

/**
 * Wave-A placeholders (L2). Until L1 (Inbox), L3 (ContextPanel, DetailsSheet,
 * ClientSheet) and L4 (HistorySheet, TasksTray, RenameInline, MergeCard) land,
 * the shell mounts these: plain, kit-built panes that satisfy the contracts
 * in `contracts.ts` so the shell works end to end on its own. Each is one
 * component the lane replaces by name; the shell imports from `./slots.ts`.
 */

import { useState } from "react";

import { filterInboxRows } from "@/lib/messaging/inbox-search";
import type { InboxRow, MessagingRefusal, RecordKind } from "@/lib/messaging/types";

import type { KitCopy } from "../kit/copy";
import { FilterChips, InboxSegments, type InboxFilterKey } from "../kit/InboxSegments";
import { InboxRowV5 } from "../kit/InboxRowV5";
import { PanelSection, SummaryBlock } from "../kit/Panel";
import { Btn, Icon, Pill } from "../kit/primitives";
import { RefusalLine } from "../kit/RefusalLine";
import { Sheet } from "../kit/Sheet";
import { EmptyState, Skeleton } from "../kit/Skeleton";
import { recordStateLabel } from "../kit/StateTags";
import type { ClientSheetProps, ContextPanelProps, DetailsSheetProps, HistorySheetProps, InboxProps, RenameInlineProps, TasksTrayProps } from "./contracts";
import type { ShellCopy } from "./copy";

/* ------------------------------------------------------------------ inbox */

const CHIP_KIND: Partial<Record<InboxFilterKey, RecordKind>> = { orders: "order", offers: "offer", appointments: "appointment", reservations: "reservation", tickets: "tickets" };

export function applyInboxChips(rows: readonly InboxRow[], chips: readonly InboxFilterKey[], currentUserId: string | null): InboxRow[] {
  return rows.filter((row) =>
    chips.every((chip) => {
      if (chip === "mine") return !!currentUserId && row.ownerUserId === currentUserId;
      if (chip === "unassigned") return row.ownerUserId === null;
      if (chip === "unread") return row.unread && row.unreadCount > 0;
      if (chip === "paymentIssues") return row.recordChips.some((c) => c.paymentState === "failed" || c.paymentState === "expired");
      const kind = CHIP_KIND[chip];
      return kind ? row.recordChips.some((c) => c.kind === kind) : true;
    }),
  );
}

export function InboxPlaceholder(props: InboxProps & { readonly shell: ShellCopy }) {
  const { rows, filter, onFilter, chips, onToggleChip, search, onSearch, selectedId, onSelect, loading, error, onRetry, counts, onNew, currentUserId, copy, variant, shell } = props;
  const mobile = variant === "mobile";
  const visible = applyInboxChips(filterInboxRows(rows, search), chips, currentUserId);
  const list = loading ? (
    <Skeleton copy={copy} variant={variant} />
  ) : error ? (
    <EmptyState icon="alert" title={shell.inboxFailed} body={shell.inboxFailedBody} action={{ label: shell.tryAgain, onClick: onRetry }} variant={variant} />
  ) : visible.length === 0 ? (
    <EmptyState title={search.trim() ? copy.inbox.empty.searchTitle : shell.inboxEmpty} body={search.trim() ? copy.inbox.empty.searchBody : shell.inboxEmptyBody} action={search.trim() ? { label: copy.inbox.empty.searchAction, onClick: () => onSearch("") } : undefined} variant={variant} />
  ) : (
    visible.map((row) => <InboxRowV5 key={row.id} row={row} copy={copy} selected={row.id === selectedId} variant={variant} currentUserId={currentUserId} onOpen={onSelect} />)
  );

  if (mobile) {
    return (
      <section className="pane inbox mx" data-inbox="mobile">
        <div className="mx-ih">
          <h1>{copy.inbox.title}</h1>
          <InboxSegments value={filter} counts={counts} copy={copy} variant="mobile" onChange={onFilter} />
          <div className="tools">
            <label className="mx-search">
              <Icon name="search" size={16} />
              <span className="sr">{copy.inbox.search}</span>
              <input value={search} placeholder={copy.inbox.search} onChange={(e) => onSearch(e.target.value)} data-inbox-search />
            </label>
            <Btn size="lg" onClick={onNew} icon="plus" aria-label={copy.inbox.newConversation} data-inbox-new />
          </div>
        </div>
        <div className="mx-list">{list}</div>
      </section>
    );
  }
  return (
    <section className="pane inbox" data-inbox="desktop">
      <div className="ib-head">
        <div className="row">
          <h2>{copy.inbox.title}</h2>
          <span className="cnt-txt">{shell.inboxThreads.replace("{count}", String(rows.length))}</span>
          <Btn size="sm" icon="plus" onClick={onNew} data-inbox-new>
            {copy.inbox.newConversation}
          </Btn>
        </div>
        <InboxSegments value={filter} counts={counts} copy={copy} onChange={onFilter} />
        <label className="search">
          <Icon name="search" size={14} />
          <span className="sr">{copy.inbox.search}</span>
          <input value={search} placeholder={copy.inbox.search} onChange={(e) => onSearch(e.target.value)} data-inbox-search />
        </label>
        <FilterChips active={chips} copy={copy} onToggle={onToggleChip} />
      </div>
      <div className="ib-list">{list}</div>
    </section>
  );
}

/* ---------------------------------------------------------- context panel */

function PanelBody(p: ContextPanelProps & { readonly shell: ShellCopy }) {
  const { essentials, chips, tasks, itemsLabel, loading, copy, variant, shell, onAction } = p;
  const [open, setOpen] = useState<Record<string, boolean>>({ client: true, records: true, tasks: true, notes: false });
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const c = essentials?.customer;
  const visitor = !c || (c.identityLevel === "none" && !c.name.trim());
  const primary = tasks.find((t) => t.primary) ?? tasks[0] ?? null;
  const main = chips[0] ? `${copy.record[chips[0].kind]} ${chips[0].label}` : shell.panel.nothingLinked;
  return (
    <>
      <SummaryBlock name={visitor ? copy.inbox.visitor : (essentials?.name ?? "")} isVisitor={visitor} identityLabel={c ? copy.identity[c.identityLevel] : ""} phone={c?.phone ?? null} next={primary?.title ?? copy.next.nothing} main={main} amount={copy.thread.nothingOwed} copy={copy} loading={loading} />
      <PanelSection title={shell.panel.client} open={!!open.client} copy={copy} variant={variant} onToggle={() => toggle("client")} action={visitor ? null : { label: shell.panel.open, onClick: () => onAction("open_client") }}>
        <dl className="kv">
          <dt>{shell.panel.who}</dt>
          <dd>{visitor ? shell.panel.visitor : c?.name}</dd>
          {c?.phone ? (
            <>
              <dt>{shell.panel.phone}</dt>
              <dd>{c.phone}</dd>
            </>
          ) : null}
          {c?.email ? (
            <>
              <dt>{shell.panel.email}</dt>
              <dd>{c.email}</dd>
            </>
          ) : null}
          {c?.source ? (
            <>
              <dt>{shell.panel.source}</dt>
              <dd>{c.source}</dd>
            </>
          ) : null}
        </dl>
        {visitor ? (
          <Btn size="sm" selfStart icon="id" onClick={() => onAction("capture_identity")} data-panel-capture>
            {shell.next.capture_identity}
          </Btn>
        ) : null}
      </PanelSection>
      <PanelSection title={itemsLabel} open={!!open.records} count={chips.length} copy={copy} variant={variant} onToggle={() => toggle("records")} action={{ label: shell.next.add_items, onClick: () => onAction("add_items") }}>
        {chips.length === 0 ? <div className="empty small"><span>{shell.panel.nothingLinked}</span></div> : null}
        {chips.map((chip) => (
          <button key={`${chip.kind}:${chip.recordId}`} type="button" className="rec" onClick={() => onAction("open_record", { recordId: chip.recordId, kind: chip.kind })} data-panel-record={chip.recordId}>
            <Icon name="link" size={15} />
            <span className="tx">
              <b>
                {copy.record[chip.kind]} {chip.label}
              </b>
              <span>{recordStateLabel(chip, copy)}</span>
            </span>
            <Pill tone="rec">{chip.kind}</Pill>
          </button>
        ))}
      </PanelSection>
      <PanelSection title={shell.panel.tasks} open={!!open.tasks} count={tasks.length} copy={copy} variant={variant} onToggle={() => toggle("tasks")}>
        {tasks.map((t) => (
          <div key={t.key} className="rec" data-panel-task={t.key}>
            <Icon name="check" size={15} />
            <span className="tx">
              <b>{t.title}</b>
              <span>{t.why}</span>
            </span>
          </div>
        ))}
      </PanelSection>
      <PanelSection title={shell.panel.notes} open={!!open.notes} count={essentials?.notes.length ?? 0} copy={copy} variant={variant} onToggle={() => toggle("notes")} action={{ label: copy.composer.note, onClick: () => onAction("add_note") }}>
        {(essentials?.notes ?? []).length === 0 ? <div className="empty small"><span>{shell.panel.noNotes}</span></div> : null}
        {(essentials?.notes ?? []).map((n) => (
          <div key={n.id} className="rec">
            <Icon name="lock" size={15} />
            <span className="tx">
              <b>{n.body}</b>
            </span>
          </div>
        ))}
      </PanelSection>
    </>
  );
}

export function ContextPanelPlaceholder(props: ContextPanelProps & { readonly shell: ShellCopy }) {
  return (
    <section className="pane panel" data-context-panel={props.variant} aria-label={props.copy.thread.details}>
      {props.onClose ? (
        <Btn size="round" variant="ghost" className="drawer-close" onClick={props.onClose} aria-label={props.copy.sheet.close}>
          <Icon name="x" size={16} />
        </Btn>
      ) : null}
      <PanelBody {...props} />
    </section>
  );
}

export function DetailsSheetPlaceholder(props: DetailsSheetProps & { readonly shell: ShellCopy }) {
  return (
    <Sheet open={props.open} title={props.copy.thread.details} copy={props.copy} onClose={props.onClose} variant="mobile-h92" tight>
      {props.open ? <PanelBody {...props} /> : null}
    </Sheet>
  );
}

export function ClientSheetPlaceholder(props: ClientSheetProps & { readonly shell: ShellCopy }) {
  const c = props.essentials.customer;
  return (
    <Sheet open={props.open} title={props.shell.panel.client} copy={props.copy} onClose={props.onClose} variant={props.variant === "mobile" ? "mobile-h60" : "desktop"} avatarName={c.name || null}>
      <dl className="kv">
        <dt>{props.shell.panel.who}</dt>
        <dd>{c.name || props.copy.inbox.visitor}</dd>
        <dt>{props.shell.panel.phone}</dt>
        <dd>{c.phone ?? ""}</dd>
        <dt>{props.shell.panel.email}</dt>
        <dd>{c.email ?? ""}</dd>
        <dt>{props.shell.panel.source}</dt>
        <dd>{c.source ?? ""}</dd>
      </dl>
      <Pill tone="ch">{props.copy.identity[c.identityLevel]}</Pill>
    </Sheet>
  );
}

/* ------------------------------------------------- history, tasks, rename */

export function HistorySheetPlaceholder(props: HistorySheetProps & { readonly shell: ShellCopy; readonly locale?: string }) {
  const { entries, open, onClose, copy, variant, error, shell, locale = "en" } = props;
  return (
    <Sheet open={open} title={shell.historyTitle} copy={copy} onClose={onClose} variant={variant === "mobile" ? "mobile-h92" : "desktop"}>
      {error ? <RefusalLine code={error} copy={copy} variant={variant} /> : null}
      {entries === null && !error ? <Skeleton rows={3} copy={copy} variant={variant} /> : null}
      {entries && entries.length === 0 ? <div className="empty small"><span>{shell.historyEmpty}</span></div> : null}
      {entries?.map((e, i) => (
        <div key={`${e.at}:${i}`} className="history-row" data-history-kind={e.kind}>
          <b>{e.text}</b>
          <span>
            {e.actorLabel} · {new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(e.at))}
          </span>
        </div>
      ))}
    </Sheet>
  );
}

export function TasksTrayPlaceholder(props: TasksTrayProps & { readonly shell: ShellCopy }) {
  const { tasks, open, onClose, onPick, copy, variant, shell } = props;
  return (
    <Sheet open={open} title={shell.tasksTitle} copy={copy} onClose={onClose} variant={variant === "mobile" ? "mobile-h60" : "desktop"}>
      {tasks.map((t) => (
        <button key={t.key} type="button" className="task-row" onClick={() => onPick(t.key)} data-task={t.key}>
          <b>{t.title}</b>
          <span>{t.why}</span>
        </button>
      ))}
    </Sheet>
  );
}

export function RenameInlinePlaceholder(props: RenameInlineProps & { readonly shell: ShellCopy }) {
  const { name, version, onSave, onCancel, copy, variant, shell } = props;
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<MessagingRefusal | null>(null);
  const save = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    const result = await onSave(value.trim(), version);
    setBusy(false);
    if (!result.ok) setRefusal(result.reason);
  };
  return (
    <div className="rename-inline" data-rename-inline>
      <label htmlFor="msgv5-rename" className="sr">
        {shell.renameTitle}
      </label>
      <input id="msgv5-rename" className="in" value={value} placeholder={shell.renamePlaceholder} disabled={busy} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") onCancel(); }} />
      <Btn size="sm" onClick={onCancel}>
        {copy.sheet.cancel}
      </Btn>
      <Btn size="sm" variant="primary" busy={busy} onClick={() => void save()} data-rename-save>
        {shell.renameSave}
      </Btn>
      {refusal ? <RefusalLine code={refusal} copy={copy} variant={variant} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------ coming sheet */

export function ComingSheet({ open, onClose, copy, shell, variant, seam }: { open: boolean; onClose: () => void; copy: KitCopy; shell: ShellCopy; variant: "desktop" | "mobile"; seam: string | null }) {
  return (
    <Sheet
      open={open}
      title={shell.comingTitle}
      copy={copy}
      onClose={onClose}
      variant={variant === "mobile" ? "mobile-h60" : "desktop"}
      footer={
        <Btn size="lg" variant="primary" onClick={onClose} data-coming-ok>
          {shell.comingOk}
        </Btn>
      }
    >
      <p className="sheet-note" data-coming-seam={seam ?? ""}>
        {shell.comingBody}
      </p>
    </Sheet>
  );
}
