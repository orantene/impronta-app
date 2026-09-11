"use client";

/**
 * ProjectsScreen — the Projects destination of the Collect mode: the list
 * of every project with its one next action, and, once one is open, the
 * journey the boards draw for it: O03's four steps (Inquiry → Offer →
 * Agreement → Project) over the `MONEY · KEPT DISTINCT` strip, the
 * milestones and deliverables, and, while a version is out with the
 * client on top of an accepted one, O06's three columns (accepted · kept,
 * proposed, if the client accepts).
 *
 * NOT WIRED (D-POS-43): `Send vN` and `Discard proposal` belong to the
 * conversation's offer composer (`sendOffer` needs the composer's line
 * items and approvals); both are drawn disabled with that sentence and the
 * door to the workspace beside them.
 */

import { X } from "lucide-react";
import type { ReactNode } from "react";

import {
  POS_CLOSE_ACTION,
  POS_EYEBROW,
  POS_NUM,
  POS_PILL,
  POS_PILL_CORAL,
  POS_PILL_GREEN,
  POS_PILL_INDIGO,
  POS_PILL_SLATE,
  POS_PRIMARY_ACTION,
  POS_SECONDARY_ACTION,
  POS_SURFACE,
} from "@/components/admin/pos/pos-classes";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import {
  acceptedAgreement,
  liveAgreement,
  nextProjectAction,
  priorAgreements,
  projectMoney,
  zonedDate,
  type ProjectRecord,
} from "@/lib/projects/project-record";

import type { ProjectsModeCopy } from "./projects-copy";
import type { CollectVerdict, ProjectsModeRow } from "./projects-mode-model";

function shortId(id: string): string {
  return id.slice(0, 8);
}

export function ProjectsList({
  copy,
  rows,
  listOk,
  activeId,
  onOpen,
}: {
  copy: ProjectsModeCopy;
  rows: readonly ProjectsModeRow[];
  listOk: boolean;
  activeId: string | null;
  onOpen: (projectId: string) => void;
}) {
  if (!listOk) return <p role="alert" className="m-0 px-1 text-[15px] text-admin-red">{copy.search.unavailable}</p>;
  if (rows.length === 0) return <p className="m-0 px-1 text-[15px] text-admin-ink-muted">{copy.search.none}</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0" data-pos-projects-list aria-label={copy.list.caption}>
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            onClick={() => onOpen(row.id)}
            aria-current={row.id === activeId ? "true" : undefined}
            data-pos-project-row={row.id}
            className={cn(
              "flex w-full items-center gap-3 rounded-[14px] border-[1.5px] px-4 py-3.5 text-left",
              row.id === activeId ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:bg-admin-surface-alt",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-semibold text-admin-ink">
                {row.clientName ? `${row.clientName} · ${row.title}` : row.title}
              </span>
              <span className="mt-0.5 block text-[13.5px] text-admin-ink-muted">
                {shortId(row.id)} · {row.collect.ok ? copy.action.collect_balance : copy.action[row.action.id]}
              </span>
            </span>
            <span className={cn("shrink-0 text-[17px] font-bold", POS_NUM, row.dueCents > 0 ? "text-admin-ink" : "text-admin-ink-muted")} data-pos-project-owed>
              {formatOrderMoney(row.dueCents, row.currency)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Step({ n, title, line1, line2, pill, tone }: { n: number; title: string; line1: string; line2: string; pill: string; tone: string }) {
  return (
    <div className={cn(POS_SURFACE, "flex min-w-0 flex-col gap-2 p-4")}>
      <div className="flex items-center gap-2">
        <span className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-admin-brand-soft text-[13px] font-bold text-admin-brand">{n}</span>
        <span className="text-[16px] font-bold text-admin-ink">{title}</span>
      </div>
      <p className="m-0 text-[14px] text-admin-ink-muted">{line1}</p>
      <p className="m-0 text-[14px] text-admin-ink">{line2}</p>
      <span className="flex-1" />
      <span className={cn(POS_PILL, "self-start text-[13px]", tone)}>{pill}</span>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-admin-surface-alt p-3">
      <p className="m-0 text-[12.5px] text-admin-ink-muted">{label}</p>
      <p className={cn("m-0 text-[18px] font-bold text-admin-ink", POS_NUM)}>{value}</p>
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

export function ProjectDetail({
  copy,
  project,
  verdict,
  workspacePath,
  onClose,
  onCollect,
}: {
  copy: ProjectsModeCopy;
  project: ProjectRecord;
  verdict: CollectVerdict;
  workspacePath: string;
  onClose: () => void;
  /** `Collect $X`: takes the operator to the Collect destination on this project. */
  onCollect: () => void;
}) {
  const b = copy.board;
  const money = projectMoney(project);
  const accepted = acceptedAgreement(project);
  const live = liveAgreement(project);
  // THE KEPT VERSION. Sending an amendment moves the accepted row to
  // `superseded` (one live version per conversation), so while a proposal
  // is out the terms the work continues under are the newest superseded
  // version, not an accepted one. That is the row O06's left column shows.
  const kept = accepted ?? priorAgreements(project)[0] ?? null;
  const proposed = live && live.status !== "accepted" && kept ? live : null;
  const sent = project.agreements.filter((a) => a.sentAt).sort((x, y) => x.version - y.version);
  const currency = project.currency;
  const noDate = copy.detail.noDate;
  const tz = project.timeZone;
  const names = project.assignments.map((a) => a.name).filter(Boolean);
  const conversation = project.inquiryId ? `${workspacePath}/messages/${project.inquiryId}` : null;

  const offerLine =
    sent.length > 0
      ? sent
          .map((a) =>
            a.status === "accepted"
              ? interpolate(b.chainAccepted, { n: a.version, date: zonedDate(a.acceptedAt, tz, noDate) })
              : interpolate(b.chainSent, { n: a.version, date: zonedDate(a.sentAt, tz, noDate) }),
          )
          .join(" · ")
      : b.chainNoOffer;

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
        <button type="button" aria-label={b.closeDetail} onClick={onClose} className={POS_CLOSE_ACTION}>
          <X aria-hidden size={18} strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-[22px] py-[18px]">
        {!verdict.ok && (money.dueCents > 0 || verdict.reason === "agreement_awaiting" || verdict.reason === "milestone_awaiting") ? (
          <p className="m-0 rounded-[12px] bg-admin-coral-soft px-4 py-3 text-[14px] text-admin-coral-deep" data-pos-projects-collect-refused={verdict.reason}>
            {copy.refusal[verdict.reason]}
          </p>
        ) : null}
        {proposed && kept ? (
          <div className={cn(POS_SURFACE, "p-4")} data-pos-projects-amendment>
            <p className="m-0 text-[16px] font-bold text-admin-ink">
              {interpolate(b.amendmentTitle, { client: project.clientName ?? copy.detail.noClient, title: project.title })}
            </p>
            <p className="m-0 mb-3 text-[13px] text-admin-ink-muted">{interpolate(b.amendmentSubtitle, { a: kept.version, b: proposed.version })}</p>
            <div className="grid grid-cols-1 gap-3.5 2xl:grid-cols-3">
              <div>
                <p className={cn("m-0 mb-1.5", POS_EYEBROW, "tracking-[0.08em]")}>{interpolate(b.amendmentKept, { n: kept.version })}</p>
                <div className="rounded-[12px] border border-admin-border px-3.5 py-1">
                  <Row label={b.total} value={formatOrderMoney(kept.totalClientCents, currency)} />
                  <Row label={b.amendmentCoordinatorFee} value={formatOrderMoney(kept.coordinatorFeeCents, currency)} />
                  <Row label={b.amendmentNotes} value={kept.notes ?? "—"} dim={!kept.notes} />
                </div>
              </div>
              <div>
                <p className={cn("m-0 mb-1.5", POS_EYEBROW, "tracking-[0.08em]")}>{interpolate(b.amendmentProposed, { n: proposed.version })}</p>
                <div className="rounded-[12px] border border-admin-border px-3.5 py-1">
                  <Row label={b.total} value={`${formatOrderMoney(kept.totalClientCents, currency)} → ${formatOrderMoney(proposed.totalClientCents, currency)}`} />
                  <Row label={b.amendmentCoordinatorFee} value={`${formatOrderMoney(kept.coordinatorFeeCents, currency)} → ${formatOrderMoney(proposed.coordinatorFeeCents, currency)}`} />
                  <Row label={b.amendmentNotes} value={proposed.notes ?? "—"} dim={!proposed.notes} />
                  <Row label={copy.list.colNext} value={proposed.status === "draft" ? b.amendmentDraft : interpolate(b.amendmentSentOn, { date: zonedDate(proposed.sentAt, tz, noDate) })} />
                </div>
              </div>
              <div className="rounded-[12px] bg-admin-surface-alt p-3.5">
                <p className={cn("m-0 mb-1.5", POS_EYEBROW, "tracking-[0.08em]")}>{interpolate(b.amendmentIf, { name: project.clientName ?? copy.detail.noClient })}</p>
                <Row
                  label={b.amendmentOutstanding}
                  value={`${formatOrderMoney(Math.max(0, kept.totalClientCents - money.collectedCents), currency)} → ${formatOrderMoney(Math.max(0, proposed.totalClientCents - money.collectedCents), currency)}`}
                />
                <Row label={interpolate(b.amendmentKept, { n: kept.version })} value={b.amendmentStaysOnFile} />
                <div className="mt-3 flex flex-col gap-2">
                  <button type="button" disabled title={b.amendmentUnavailable} className={cn(POS_PRIMARY_ACTION, "w-full")}>
                    {interpolate(b.amendmentSend, { n: proposed.version })}
                  </button>
                  <button type="button" disabled title={b.amendmentUnavailable} className={cn(POS_SECONDARY_ACTION, "w-full")}>
                    {b.amendmentDiscard}
                  </button>
                  {conversation ? (
                    <a href={conversation} className={cn(POS_SECONDARY_ACTION, "w-full")}>
                      {copy.detail.openWorkspace}
                    </a>
                  ) : null}

        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
          <Step
            n={1}
            title={b.chainInquiry}
            line1={project.inquiryId ? shortId(project.inquiryId) : b.chainNoInquiry}
            line2={project.title}
            pill={project.inquiryId ? b.chainReceived : b.chainNoInquiry}
            tone={POS_PILL_SLATE}
          />
          <Step
            n={2}
            title={b.chainOffer}
            line1={offerLine}
            line2={accepted ? formatOrderMoney(accepted.totalClientCents, currency) : live ? formatOrderMoney(live.totalClientCents, currency) : "—"}
            pill={
              accepted
                ? interpolate(b.chainStatusAccepted, { n: accepted.version })
                : live
                  ? live.status === "sent"
                    ? interpolate(b.chainSent, { n: live.version, date: zonedDate(live.sentAt, tz, noDate) })
                    : b.amendmentDraft
                  : b.chainStatusNone
            }
            tone={accepted ? POS_PILL_GREEN : POS_PILL_SLATE}
          />
          <Step
            n={3}
            title={b.chainAgreement}
            line1={kept ? interpolate(b.chainFrozen, { n: kept.version }) : b.chainNoAgreement}
            line2={kept ? `${copy.money.collected} ${formatOrderMoney(money.collectedCents, currency)}` : "—"}
            pill={kept ? b.chainStatusActive : b.chainStatusNone}
            tone={kept ? POS_PILL_GREEN : POS_PILL_SLATE}
          />
          <Step
            n={4}
            title={b.chainProject}
            line1={`${shortId(project.id)} · ${names.length > 0 ? interpolate(b.chainAssigned, { names: names.join(", ") }) : b.chainNoneAssigned}`}
            line2={copy.status[project.status]}
            pill={copy.status[project.status]}
            tone={project.status === "in_progress" ? POS_PILL_INDIGO : project.status === "cancelled" ? POS_PILL_CORAL : POS_PILL_SLATE}
          />
        </div>

        <div className={cn(POS_SURFACE, "px-4 py-3.5")}>
          <p className={cn("m-0 mb-2", POS_EYEBROW, "tracking-[0.08em]")}>{b.moneyTitle}</p>
          <div className="grid gap-2.5 md:grid-cols-3 xl:grid-cols-5">
            <Tile label={interpolate(b.moneyQuoted, { n: kept?.version ?? 0 })} value={kept ? formatOrderMoney(kept.totalClientCents, currency) : "—"} />
            <Tile label={b.moneyCollected} value={formatOrderMoney(money.collectedCents, currency)} />
            <Tile
              label={b.moneyFees}
              value={
                project.assignments.length > 0
                  ? project.assignments.map((a) => `${a.name || "?"} ${formatOrderMoney(a.talentCostCents, a.currency)}`).join(" · ")
                  : "—"
              }
            />
            <Tile label={b.moneyEarned} value={b.moneyNotRecorded} />
            <Tile label={b.moneyPaidOut} value={b.moneyNotRead} />
          </div>
          <p className="m-0 mt-2.5 text-[13.5px] text-admin-ink-muted">{b.moneyNote}</p>
        </div>

                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className={cn(POS_SURFACE, "px-4 py-3.5")} data-pos-projects-milestones>
          <p className={cn("m-0 mb-1", POS_EYEBROW, "tracking-[0.08em]")}>{copy.milestones.title}</p>
          {project.milestones.length === 0 ? (
            <p className="m-0 text-[14px] text-admin-ink-muted">{copy.milestones.none}</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {project.milestones.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 border-b border-admin-border-soft py-2 text-[15px] last:border-b-0">
                  <span className="min-w-0">
                    <span className="font-semibold text-admin-ink">{m.title}</span>
                    <span className="block text-[13px] text-admin-ink-muted">
                      {zonedDate(m.dueAt, tz, copy.milestones.noDue)} · {interpolate(copy.milestones.revisionsUsed, { used: m.revision, limit: m.revisionLimit })}
                    </span>
                  </span>
                  <span className={cn(POS_PILL, "text-[13px]", m.status === "submitted" ? POS_PILL_CORAL : m.status === "approved" ? POS_PILL_GREEN : POS_PILL_SLATE)}>
                    {copy.milestoneStatus[m.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <a href={`${workspacePath}/projects/${project.id}`} className={cn(POS_SECONDARY_ACTION, "h-14")}>
            {b.openWorkspace}
          </a>
          {verdict.ok ? (
            <button type="button" className={cn(POS_PRIMARY_ACTION, "h-14")} onClick={onCollect} data-pos-projects-open-collect>
              {interpolate(copy.collect.open, { amount: formatOrderMoney(verdict.outstandingCents, verdict.currency) })}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
