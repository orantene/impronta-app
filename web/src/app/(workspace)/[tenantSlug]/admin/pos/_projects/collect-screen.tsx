"use client";

/**
 * CollectScreen — the Collect destination as the boards draw it (O07
 * `Projects · collect a balance`, with POSOffice's `Due now · Later · Needs
 * approval` segments): a 520px column on the left with the search box, the
 * segments or `MATCHES · DUE FIRST`, one card per project (title, the
 * agreement line, the amount and why it is or is not due) and the
 * one-sentence rule; on the right the open project: `DUE NOW` and
 * `AGREEMENT` cards, `Collect for · Client · Not collectable here`, the
 * records the figure comes from, `Open full project in workspace` and
 * `Send payment link`, and the footer with the cashier line and `Collect
 * $X`.
 *
 * Pure presentation over props. Every figure is the reader's; every verdict
 * is `projects-mode-model`'s; every write stays in the client that owns the
 * URL.
 */

import { Search, X } from "lucide-react";
import type { ReactNode } from "react";

import { POS_CLOSE_ACTION, POS_EYEBROW, POS_NOTE, POS_NUM, POS_OUTLINE_ACTION, POS_PRIMARY_ACTION, POS_REFUSAL_BANNER, POS_SECONDARY_ACTION, POS_SEGMENT, POS_SEGMENT_ACTIVE, POS_SEGMENT_IDLE, POS_SEGMENT_TRACK, POS_SURFACE } from "@/components/admin/pos/pos-classes";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { isOrderStatus } from "@/lib/orders/order-status";
import { cn } from "@/lib/utils";
import { acceptedAgreement, balanceOwedCents, nextProjectAction, projectMoney, type ProjectRecord } from "@/lib/projects/project-record";

import type { ProjectsModeCopy } from "./projects-copy";
import type { ProjectClientContact, ProjectOrderFacts } from "./projects-mode-loader";
import type { CollectSegment, CollectVerdict, ProjectsModeRow } from "./projects-mode-model";

function shortId(id: string): string {
  return id.slice(0, 8);
}

const SEGMENTS: readonly CollectSegment[] = ["due_now", "later", "needs_approval"];

export type CollectListProps = {
  readonly copy: ProjectsModeCopy;
  readonly list: { readonly ok: true; readonly rows: readonly ProjectsModeRow[] } | { readonly ok: false };
  readonly rows: readonly ProjectsModeRow[];
  readonly query: string;
  readonly onQuery: (value: string) => void;
  readonly segment: CollectSegment;
  readonly onSegment: (segment: CollectSegment) => void;
  readonly activeId: string | null;
  readonly onOpen: (projectId: string) => void;
};

export function CollectList({ copy, list, rows, query, onQuery, segment, onSegment, activeId, onOpen }: CollectListProps) {
  const b = copy.board;
  const counts: Record<CollectSegment, number> = { due_now: 0, later: 0, needs_approval: 0, closed: 0 };
  if (list.ok) for (const row of list.rows) counts[row.segment] += 1;
  const segmentLabel: Record<CollectSegment, string> = {
    due_now: b.segmentDueNow,
    later: b.segmentLater,
    needs_approval: b.segmentNeedsApproval,
    closed: "",
  };
  const visible = query.trim() ? rows : rows.filter((r) => r.segment === segment);
  return (
    <div className="flex w-[520px] shrink-0 flex-col gap-3.5 overflow-y-auto border-r border-admin-border px-5 py-[18px] max-[1100px]:w-[420px]" data-pos-collect-list>
      <label className={cn("flex h-[60px] items-center gap-2.5 rounded-[14px] border-[1.5px] bg-admin-card px-4", query ? "border-admin-brand" : "border-admin-border")}>
        <Search aria-hidden size={20} strokeWidth={1.75} className="shrink-0 text-admin-ink-muted" />
        <span className="sr-only">{copy.search.label}</span>
        <input
          type="search"
          autoComplete="off"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={copy.search.placeholder}
          aria-label={copy.search.label}
          className="min-w-0 flex-1 bg-transparent text-[18px] text-admin-ink placeholder:text-admin-ink-dim focus:outline-none"
        />
        <span className="shrink-0 text-[12.5px] font-semibold text-admin-ink-muted">{b.searchHint}</span>
      </label>

      {query.trim() ? (
        <p className={cn("m-0", POS_EYEBROW, "tracking-[0.08em]")}>{b.matchesDueFirst}</p>
      ) : (
        <div className={cn(POS_SEGMENT_TRACK, "self-start")} role="group" aria-label={copy.rail.destinations.collect}>
          {SEGMENTS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={segment === s}
              onClick={() => onSegment(s)}
              className={cn(POS_SEGMENT, "h-11 px-4 text-[15px]", segment === s ? POS_SEGMENT_ACTIVE : POS_SEGMENT_IDLE)}
              data-pos-collect-segment={s}
            >
              {segmentLabel[s]} {counts[s]}
            </button>
          ))}
        </div>
      )}

      {!list.ok ? (
        <p role="alert" className={POS_REFUSAL_BANNER}>{copy.search.unavailable}</p>
      ) : list.rows.length === 0 ? (
        <p className="m-0 px-1 text-[15px] text-admin-ink-muted">{copy.search.none}</p>
      ) : visible.length === 0 ? (
        <p className="m-0 px-1 text-[15px] text-admin-ink-muted">{copy.search.empty}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0" data-pos-projects-list>
          {visible.map((row) => (
            <li key={row.id}>
              <CollectRow row={row} copy={copy} active={row.id === activeId} onOpen={() => onOpen(row.id)} />
            </li>
          ))}
        </ul>
      )}

      <p className={cn(POS_NOTE, "m-0 mt-auto")}>
        <span aria-hidden className="shrink-0 font-bold">
          !
        </span>
        {b.onlyAccepted}
      </p>
    </div>
  );
}

function CollectRow({ row, copy, active, onOpen }: { row: ProjectsModeRow; copy: ProjectsModeCopy; active: boolean; onOpen: () => void }) {
  const b = copy.board;
  const title = row.clientName ? `${row.clientName} · ${row.title}` : row.title;
  const subtitle =
    row.acceptedVersion !== null && row.quotedCents !== null
      ? row.collect.ok
        ? interpolate(b.rowAgreement, {
            ref: shortId(row.id),
            n: row.acceptedVersion,
            collected: formatOrderMoney(row.collectedCents, row.currency),
            total: formatOrderMoney(row.quotedCents, row.currency),
          })
        : interpolate(b.rowRemaining, {
            ref: shortId(row.id),
            remaining: formatOrderMoney(Math.max(0, row.quotedCents - row.collectedCents), row.currency),
          })
      : interpolate(b.rowNoAgreement, { ref: shortId(row.id) });
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? "true" : undefined}
      data-pos-project-row={row.id}
      className={cn(
        "flex w-full items-center gap-3 rounded-[14px] border-[1.5px] px-4 py-3.5 text-left transition-colors",
        active ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:bg-admin-surface-alt",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold text-admin-ink">{title}</span>
        <span className="mt-0.5 block text-[13.5px] text-admin-ink-muted">{subtitle}</span>
      </span>
      <span className="shrink-0 text-right">
        <span
          data-pos-project-owed
          className={cn("block text-[22px] font-bold tracking-[-0.025em]", POS_NUM, row.collect.ok ? "text-admin-ink" : "text-admin-ink-muted")}
        >
          {formatOrderMoney(row.dueCents, row.currency)}
        </span>
        <span className={cn("block text-[12px]", row.collect.ok ? "font-semibold text-admin-coral-deep" : "text-admin-ink-muted")}>
          {row.collect.ok ? b.rowDue : b.rowReason[row.collect.reason]}
        </span>
      </span>
    </button>
  );
}

export type CollectDetailProps = {
  readonly copy: ProjectsModeCopy;
  readonly project: ProjectRecord;
  readonly verdict: CollectVerdict;
  readonly orders: readonly ProjectOrderFacts[];
  readonly contact: ProjectClientContact | null;
  readonly receiptHrefFor: (code: string | null) => string | null;
  readonly workspacePath: string;
  readonly cashierLine: string;
  readonly onClose: () => void;
  readonly onCollect: () => void;
  readonly busy: boolean;
};

export function CollectDetail(props: CollectDetailProps) {
  const { copy, project, verdict, orders, contact } = props;
  const b = copy.board;
  const money = projectMoney(project);
  const accepted = acceptedAgreement(project);
  const currency = project.currency;
  const collectable = verdict.ok ? verdict.outstandingCents : 0;
  const remainingAfter = accepted ? Math.max(0, accepted.totalClientCents - money.collectedCents - collectable) : null;
  const factsFor = (orderId: string) => orders.find((o) => o.orderId === orderId) ?? null;
  const others = project.balances.filter((bal) => !verdict.ok || bal.orderId !== verdict.orderId);
  const receipt = contact?.email
    ? interpolate(b.receiptEmail, { email: contact.email })
    : contact?.phone
      ? interpolate(b.receiptPhone, { phone: contact.phone })
      : b.receiptNone;

  return (
    <div className="flex min-w-0 flex-1 flex-col" data-pos-projects-detail={project.id}>
      <div className="flex shrink-0 items-center gap-3 border-b border-admin-border px-[22px] pb-4 pt-[18px]">
        <div className="min-w-0 flex-1">
          <p className="m-0 mb-1 text-[13px] text-admin-ink-muted">{shortId(project.id)}</p>
          <h2 className="m-0 truncate text-[20px] font-bold tracking-[-0.01em] text-admin-ink">
            {project.clientName ? `${project.clientName} · ${project.title}` : project.title}
          </h2>
          <p className="m-0 mt-0.5 text-[14px] text-admin-ink-muted">
            {copy.status[project.status]}
            {" · "}
            <span data-pos-projects-next-action>{copy.action[verdict.ok ? "collect_balance" : nextProjectAction(project).id]}</span>
          </p>
        </div>
        <button type="button" aria-label={b.closeDetail} onClick={props.onClose} className={POS_CLOSE_ACTION}>
          <X aria-hidden size={18} strokeWidth={1.75} />
        </button>
      </div>

      {(
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[22px] py-[18px]" data-pos-projects-money>
          <div className="grid gap-3.5 md:grid-cols-2">
            <div className={cn(POS_SURFACE, "p-4")}>
              <p className={cn("m-0", POS_EYEBROW, "tracking-[0.08em]")}>{b.dueNow}</p>
              <p className={cn("m-0 text-[36px] font-bold leading-tight tracking-[-0.025em] text-admin-ink", POS_NUM)} data-pos-projects-due>
                {formatOrderMoney(money.dueCents, currency)}
              </p>
              <p className="m-0 mt-1 text-[13.5px] text-admin-ink-muted">
                {verdict.ok
                  ? interpolate(b.dueNowNote, { id: shortId(verdict.orderId), n: accepted?.version ?? 0 })
                  : b.dueNowNone}
              </p>
            </div>
            <div className={cn(POS_SURFACE, "p-4")}>
              <p className={cn("m-0", POS_EYEBROW, "tracking-[0.08em]")}>{b.agreement}</p>
              <Row label={b.total} value={accepted ? interpolate(b.totalDetail, { amount: formatOrderMoney(accepted.totalClientCents, currency), count: project.milestones.length }) : copy.money.agreedNone} />
              <Row label={copy.money.collected} value={<span data-pos-projects-collected-total>{formatOrderMoney(money.collectedCents, currency)}</span>} />
              <Row label={b.remainingAfter} value={remainingAfter === null ? "—" : formatOrderMoney(remainingAfter, currency)} />
              <Row label={b.refundTerms} value={b.refundNotRecorded} dim />
            </div>
          </div>

          <div className={cn(POS_SURFACE, "px-4 py-3.5")}>
            <Row label={b.collectFor} value={verdict.ok ? interpolate(b.collectForValue, { id: shortId(verdict.orderId) }) : copy.refusal[verdict.reason]} />
            <Row
              label={b.client}
              value={interpolate(b.clientValue, { name: contact?.displayName ?? project.clientName ?? copy.detail.noClient, receipt })}
            />
            <Row
              label={b.notCollectable}
              value={others.length > 0 ? interpolate(b.notCollectableValue, { count: others.length }) : b.nothingElse}
              dim={others.length === 0}
            />
          </div>

          <div className={cn(POS_SURFACE, "px-4 py-3.5")}>
            <p className={cn("m-0 mb-1", POS_EYEBROW, "tracking-[0.08em]")}>{b.records}</p>
            {project.balances.length === 0 ? (
              <p className="m-0 text-[14px] text-admin-ink-muted">{copy.money.noOrders}</p>
            ) : (
              <ul className="m-0 list-none p-0" data-pos-projects-rows>
                {project.balances.map((bal) => {
                  const owed = balanceOwedCents(bal);
                  const facts = factsFor(bal.orderId);
                  const link = props.receiptHrefFor(facts?.receiptCode ?? null);
                  return (
                    <li key={bal.orderId} className="flex items-center justify-between gap-3 border-b border-admin-border-soft py-2 text-[14px] last:border-b-0" data-pos-projects-row={bal.orderId}>
                      <span className="min-w-0">
                        <span className="font-mono text-[13px] text-admin-ink">{shortId(bal.orderId)}</span>
                        <span className="text-admin-ink-muted"> · {isOrderStatus(bal.status) ? copy.orderStatus[bal.status] : bal.status}</span>
                        {link ? (
                          <a href={link} target="_blank" rel="noopener noreferrer" className="ml-2 text-[13px] text-admin-ink underline">
                            {copy.receipts.open}
                          </a>
                        ) : null}
                      </span>
                      <span className={cn("shrink-0 text-right", POS_NUM)}>
                        <span className="text-admin-ink-muted">{formatOrderMoney(bal.totalCents, bal.currency)}</span>
                        <span className="ml-2 font-semibold text-admin-ink" data-pos-projects-row-outstanding>
                          {formatOrderMoney(owed, bal.currency)}
                        </span>
                        {owed === 0 && bal.totalCents > 0 && bal.status !== "paid" ? <span className="block text-[12px] text-admin-ink-muted">{copy.money.notCounted}</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <a href={`${props.workspacePath}/projects/${project.id}`} className={cn(POS_SECONDARY_ACTION, "h-14")}>
              {b.openWorkspace}
            </a>
            <button type="button" disabled title={b.sendLinkUnavailable} className={cn(POS_OUTLINE_ACTION, "h-14")}>
              {b.sendLink}
            </button>
            <button type="button" disabled title={b.transferUnavailable} className={cn(POS_SECONDARY_ACTION, "h-14")}>
              {b.transfer}
            </button>
          </div>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-3 border-t border-admin-border bg-admin-card px-[22px] py-3.5">
        <span className="text-[14px] text-admin-ink-muted">{props.cashierLine}</span>
        <span className="flex-1" />
        {verdict.ok ? (
          <button type="button" className={cn(POS_PRIMARY_ACTION, "h-[60px] px-7 text-[18px]")} disabled={props.busy} onClick={props.onCollect} data-pos-projects-open-collect>
            {interpolate(copy.collect.open, { amount: formatOrderMoney(verdict.outstandingCents, verdict.currency) })}
          </button>
        ) : (
          <p className="m-0 max-w-[520px] text-right text-[13.5px] text-admin-ink-muted" data-pos-projects-collect-refused={verdict.reason}>
            {copy.refusal[verdict.reason]}
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, dim }: { label: string; value: ReactNode; dim?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-admin-border-soft py-2 text-[15px] last:border-b-0">
      <span className="text-admin-ink-muted">{label}</span>
      <span className={cn("text-right font-semibold", POS_NUM, dim ? "text-admin-ink-dim" : "text-admin-ink")}>{value}</span>
    </div>
  );
}

export function EmptyDetail({ copy }: { copy: ProjectsModeCopy }) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center px-8 text-center text-[16px] text-admin-ink-muted" data-pos-collect-empty>
      {copy.board.pickOne}
    </div>
  );
}
