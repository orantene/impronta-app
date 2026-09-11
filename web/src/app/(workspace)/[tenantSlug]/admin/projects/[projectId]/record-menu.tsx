"use client";

/**
 * W42's `More ▾` menu and W50, the close sheet it opens.
 *
 * THE SHEET SHOWS WHAT IS OUTSTANDING FIRST. Client money, work and talent
 * are read off the record (`closeReadiness`, `projectMoney`) before any
 * choice is drawn, and each of the four choices carries its own verdict
 * from `closeOptions`: Complete only when nothing is outstanding and the
 * engine's `closeBookingAction` will accept the status; Cancel whenever
 * `cancelBookingAction` will; Archive when the project is completed or
 * cancelled and Reopen when it is archived (Package 2's `project_archive`
 * / `project_reopen`, closing D-POS-39). Every engine refusal comes back
 * as a sentence, never as a silent close.
 */

import { useCallback, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import {
  closeOptions,
  milestonesOutstanding,
  projectMoney,
  remainingCents,
  type CloseOption,
  type CloseOptionRefusal,
  type ProjectRecord,
} from "@/lib/projects/project-record";
import { projectArchiveAction, projectReopenAction } from "@/lib/server-actions/scheduling-engine";
import { schedulingEngineSentence, type SchedulingEngineSentences } from "@/lib/scheduling/engine-refusals";
import { cancelBookingAction, closeBookingAction } from "../../_pipeline-actions";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Eyebrow, KeyValue } from "../_shared";
import { RecordSheet } from "../_sheet";

export type CloseSheetCopy = {
  title: string;
  subtitle: string;
  closeLabel: string;
  outstanding: string;
  clientMoney: string;
  work: string;
  talent: string;
  remaining: string;
  nothingOwed: string;
  milestonesOpen: string;
  allDelivered: string;
  assigned: string;
  nobodyAssigned: string;
  choose: string;
  complete: string;
  completeBody: string;
  cancel: string;
  cancelBody: string;
  cancelNote: string;
  archive: string;
  archiveBody: string;
  reopen: string;
  reopenBody: string;
  reason: Record<CloseOptionRefusal, string>;
  back: string;
  confirmComplete: string;
  confirmCancel: string;
  confirmArchive: string;
  confirmReopen: string;
  refused: string;
  done: string;
  engine: SchedulingEngineSentences;
};

export type RecordMenuCopy = {
  more: string;
  menuLabel: string;
  close: string;
  visibility: string;
  conversation: string;
  client: string;
  sheet: CloseSheetCopy;
};

const MENU_ITEM = "flex h-9 w-full items-center rounded-[7px] px-3 text-left text-[13px] text-admin-ink no-underline hover:bg-admin-surface-alt";

export function RecordMenu({
  tenantSlug,
  project,
  primaryIsClose,
  hrefs,
  copy,
}: {
  tenantSlug: string;
  project: ProjectRecord;
  primaryIsClose: boolean;
  hrefs: { visibility: string; conversation: string | null; client: string | null; list: string };
  copy: RecordMenuCopy;
}) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const menuId = useId();
  const closeSheet = useCallback(() => setSheet(false), []);
  return (
    <>
      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((v) => !v)}
          className={BTN_SECONDARY}
          data-project-more
        >
          {copy.more}
          <ChevronDown aria-hidden size={12} strokeWidth={1.75} className="text-admin-ink-dim" />
        </button>
        {open ? (
          <ul
            id={menuId}
            role="menu"
            aria-label={copy.menuLabel}
            className="absolute right-0 top-[calc(100%+6px)] z-30 m-0 min-w-[220px] list-none rounded-[10px] border border-admin-border bg-admin-card p-1 shadow-admin-hover"
          >
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className={MENU_ITEM}
                data-project-menu-close
                onClick={() => {
                  setOpen(false);
                  setSheet(true);
                }}
              >
                {copy.close}
              </button>
            </li>
            <li role="none">
              <Link role="menuitem" href={hrefs.visibility} className={MENU_ITEM} onClick={() => setOpen(false)}>
                {copy.visibility}
              </Link>
            </li>
            {hrefs.conversation ? (
              <li role="none">
                <Link role="menuitem" href={hrefs.conversation} className={MENU_ITEM} onClick={() => setOpen(false)}>
                  {copy.conversation}
                </Link>
              </li>
            ) : null}
            {hrefs.client ? (
              <li role="none">
                <Link role="menuitem" href={hrefs.client} className={MENU_ITEM} onClick={() => setOpen(false)}>
                  {copy.client}
                </Link>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      {primaryIsClose ? (
        <button type="button" className={BTN_PRIMARY} onClick={() => setSheet(true)} data-project-primary="close">
          {copy.close}
        </button>
      ) : null}
      <CloseSheet
        open={sheet}
        onClose={closeSheet}
        tenantSlug={tenantSlug}
        project={project}
        listHref={hrefs.list}
        copy={copy.sheet}
      />
    </>
  );
}

function CloseSheet({
  open,
  onClose,
  tenantSlug,
  project,
  listHref,
  copy,
}: {
  open: boolean;
  onClose: () => void;
  tenantSlug: string;
  project: ProjectRecord;
  listHref: string;
  copy: CloseSheetCopy;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<CloseOption | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const money = projectMoney(project);
  const options = closeOptions(project);
  const remaining = remainingCents(money);
  const openWork = milestonesOutstanding(project).length + project.milestones.filter((m) => m.status === "submitted").length;

  const confirm = () => {
    if (!choice) return;
    setRefusal(null);
    startTransition(async () => {
      if (choice === "archive" || choice === "reopen") {
        const result =
          choice === "archive"
            ? await projectArchiveAction({ bookingId: project.id, reason: "" })
            : await projectReopenAction({ bookingId: project.id, reason: "" });
        if (!result.ok) {
          setRefusal(schedulingEngineSentence(result.reason, copy.engine));
          return;
        }
      } else {
        const result =
          choice === "complete"
            ? await closeBookingAction(tenantSlug, project.id, null)
            : await cancelBookingAction(tenantSlug, project.id, null);
        if (!result.ok) {
          setRefusal(`${copy.refused} ${result.error}`);
          return;
        }
      }
      setDone(true);
      router.refresh();
    });
  };

  const rows: { option: CloseOption; title: string; body: string; foot: string }[] = options.map((v) => ({
    option: v.option,
    title: copy[v.option],
    body: v.option === "complete" ? copy.completeBody : v.option === "cancel" ? copy.cancelBody : v.option === "archive" ? copy.archiveBody : copy.reopenBody,
    foot: v.ok ? (v.option === "cancel" ? copy.cancelNote : "") : copy.reason[v.reason],
  }));
  const chosen = options.find((v) => v.option === choice);
  const canConfirm = Boolean(chosen && chosen.ok) && !pending && !done;
  const confirmLabel =
    choice === "cancel" ? copy.confirmCancel : choice === "archive" ? copy.confirmArchive : choice === "reopen" ? copy.confirmReopen : copy.confirmComplete;

  return (
    <RecordSheet
      open={open}
      name="close"
      title={copy.title}
      subtitle={copy.subtitle}
      closeLabel={copy.closeLabel}
      onClose={onClose}
      footerStart={
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>
          {copy.back}
        </button>
      }
      footerEnd={
        done ? (
          <Link href={listHref} className={BTN_PRIMARY}>
            {copy.done}
          </Link>
        ) : (
          <button
            type="button"
            disabled={!canConfirm}
            onClick={confirm}
            className={choice === "cancel" ? BTN_DANGER : BTN_PRIMARY}
            data-project-close-confirm={choice ?? ""}
          >
            {confirmLabel}
          </button>
        )
      }
    >
      <Eyebrow>{copy.outstanding}</Eyebrow>
      <div className="rounded-[12px] border border-admin-border bg-admin-card px-4 py-3">
        <KeyValue
          label={copy.clientMoney}
          value={
            money.dueCents > 0
              ? `${formatOrderMoney(money.dueCents, money.currency)} ${copy.remaining}`
              : remaining !== null && remaining > 0
                ? `${formatOrderMoney(remaining, money.currency)} ${copy.remaining}`
                : copy.nothingOwed
          }
        />
        <KeyValue label={copy.work} value={openWork > 0 ? copy.milestonesOpen.replace("{count}", String(openWork)) : copy.allDelivered} />
        <KeyValue
          label={copy.talent}
          value={
            project.assignments.length > 0
              ? copy.assigned.replace("{names}", project.assignments.map((a) => a.name).filter(Boolean).join(", "))
              : copy.nobodyAssigned
          }
        />
      </div>
      <Eyebrow>{copy.choose}</Eyebrow>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label={copy.choose}>
        {rows.map((row) => {
          const verdict = options.find((v) => v.option === row.option);
          const enabled = Boolean(verdict?.ok);
          const active = choice === row.option;
          return (
            <button
              key={row.option}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!enabled || done}
              onClick={() => setChoice(row.option)}
              data-project-close-option={row.option}
              className={cn(
                "rounded-[12px] border px-3.5 py-3 text-left disabled:cursor-not-allowed",
                enabled ? "border-admin-border bg-admin-card" : "border-admin-border-soft bg-admin-surface-alt opacity-70",
                active && "border-admin-brand",
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "inline-block h-4 w-4 rounded-full border-[1.5px]",
                    active ? "border-admin-brand bg-admin-brand" : "border-admin-border-strong",
                  )}
                />
                <b className="text-[13.5px] text-admin-ink">{row.title}</b>
              </span>
              <span className="ml-6 block text-[12.5px] text-admin-ink-muted">{row.body}</span>
              <span className="ml-6 block text-[12px] text-admin-ink-dim">{row.foot || "—"}</span>
            </button>
          );
        })}
      </div>
      {refusal ? (
        <p role="alert" className="m-0 rounded-[10px] bg-admin-critical-soft px-3 py-2.5 text-[12.5px] text-admin-red">
          {refusal}
        </p>
      ) : null}
    </RecordSheet>
  );
}
