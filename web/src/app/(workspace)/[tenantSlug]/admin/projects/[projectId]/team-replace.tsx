"use client";

/**
 * W48's interactive half: the assignment rows with `Replace…`, and the
 * replace sheet showing the impact before anything is confirmed.
 *
 * WIRED (Package 2, closing D-POS-38). `Replacement` lists the workspace's
 * roster (`loadReplacementCandidates`); `Replace and invite` calls
 * `projectReplaceTalentAction`, which moves the `booking_talent` row and the
 * firm holds under one operation key and refuses `talent_unavailable` or
 * `already_started` as a sentence. The impact rows are the record's own
 * facts (the date, the fee line, that client money stands), which is what
 * the board promises to show first. An assignment with no profile behind it
 * (a name typed on the offer) cannot be replaced and its button says so.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { projectReplaceTalentAction } from "@/lib/server-actions/scheduling-engine";
import { schedulingEngineSentence, type SchedulingEngineSentences } from "@/lib/scheduling/engine-refusals";
import { BTN_PRIMARY, BTN_ROW, BTN_SECONDARY, Eyebrow, KeyValue, ListRow, Pill } from "../_shared";
import { RecordSheet } from "../_sheet";

export type TeamRowView = {
  id: string;
  talentProfileId: string | null;
  name: string;
  roleLine: string;
  feeLine: string;
  stateLabel: string;
};

export type TeamCandidate = { talentProfileId: string; name: string };

export type TeamReplaceCopy = {
  replace: string;
  replaceNoProfile: string;
  sheetTitle: string;
  sheetSubtitle: string;
  closeLabel: string;
  replacement: string;
  replacementPick: string;
  replacementNone: string;
  impact: string;
  schedule: string;
  scheduleValue: string;
  fee: string;
  clientMoney: string;
  clientMoneyValue: string;
  outgoing: string;
  outgoingValue: string;
  client: string;
  clientValue: string;
  note: string;
  cancel: string;
  confirm: string;
  engine: SchedulingEngineSentences;
};

const COLS = "grid-cols-[110px_1.3fr_1.5fr_170px_100px]";

function operationKey(): string {
  return `replace-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export function TeamRows({
  bookingId,
  rows,
  candidates,
  copy,
}: {
  bookingId: string;
  rows: TeamRowView[];
  candidates: TeamCandidate[];
  copy: TeamReplaceCopy;
}) {
  const router = useRouter();
  const [replacing, setReplacing] = useState<TeamRowView | null>(null);
  const [toTalentId, setToTalentId] = useState("");
  const [opKey, setOpKey] = useState(operationKey);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = (row: TeamRowView) => {
    setReplacing(row);
    setToTalentId("");
    setNote(null);
    setOpKey(operationKey());
  };
  const close = () => setReplacing(null);
  const options = candidates.filter((c) => c.talentProfileId !== replacing?.talentProfileId);
  const replacement = options.find((c) => c.talentProfileId === toTalentId) ?? null;

  const confirm = () => {
    if (!replacing?.talentProfileId || !replacement) return;
    setNote(null);
    startTransition(async () => {
      const result = await projectReplaceTalentAction({
        bookingId,
        fromTalentId: replacing.talentProfileId ?? "",
        toTalentId: replacement.talentProfileId,
        operationKey: opKey,
      });
      if (!result.ok) {
        setNote(schedulingEngineSentence(result.reason, copy.engine));
        return;
      }
      setReplacing(null);
      router.refresh();
    });
  };

  return (
    <>
      <ul className="m-0 list-none p-0" data-project-team>
        {rows.map((row) => (
          <li key={row.id}>
            <ListRow cols={COLS} className="border-t">
              <b>{row.name}</b>
              <span className="text-admin-ink-muted">{row.roleLine}</span>
              <span className="text-admin-ink-muted">{row.feeLine}</span>
              <span>
                <Pill tone="slate">{row.stateLabel}</Pill>
              </span>
              <span className="flex justify-end">
                <button
                  type="button"
                  disabled={!row.talentProfileId}
                  title={row.talentProfileId ? undefined : copy.replaceNoProfile}
                  onClick={() => open(row)}
                  className={cn(BTN_SECONDARY, BTN_ROW)}
                  data-team-replace={row.id}
                >
                  {copy.replace}
                </button>
              </span>
            </ListRow>
          </li>
        ))}
      </ul>
      <RecordSheet
        open={replacing !== null}
        name="replace"
        title={replacing ? copy.sheetTitle.replace("{name}", replacing.name) : copy.sheetTitle}
        subtitle={copy.sheetSubtitle}
        closeLabel={copy.closeLabel}
        onClose={close}
        footerStart={
          <button type="button" onClick={close} className={BTN_SECONDARY}>
            {copy.cancel}
          </button>
        }
        footerEnd={
          <button type="button" disabled={!replacement || pending} onClick={confirm} className={BTN_PRIMARY} data-team-replace-confirm>
            {replacement ? copy.confirm.replace("{name}", replacement.name) : copy.confirm.replace("{name}", "").trim()}
          </button>
        }
      >
        {replacing ? (
          <>
            <div>
              <label htmlFor="team-replacement" className="mb-1.5 block text-[12px] font-semibold text-admin-ink">
                {copy.replacement}
              </label>
              <select
                id="team-replacement"
                value={toTalentId}
                disabled={pending || options.length === 0}
                onChange={(e) => setToTalentId(e.target.value)}
                data-team-replacement
                className="h-9 w-full rounded-[9px] border border-admin-border bg-admin-card px-3 text-[13px] text-admin-ink disabled:cursor-not-allowed disabled:text-admin-ink-dim"
              >
                <option value="">{options.length === 0 ? copy.replacementNone : copy.replacementPick}</option>
                {options.map((c) => (
                  <option key={c.talentProfileId} value={c.talentProfileId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <Eyebrow>{copy.impact}</Eyebrow>
            <div className="rounded-[12px] border border-admin-border bg-admin-card px-4 py-3">
              <KeyValue label={copy.schedule} value={copy.scheduleValue} />
              <KeyValue label={copy.fee} value={replacing.feeLine} />
              <KeyValue label={copy.clientMoney} value={copy.clientMoneyValue} />
              <KeyValue label={replacing.name} value={copy.outgoingValue} />
              <KeyValue label={copy.client} value={copy.clientValue} />
            </div>
            <p className="m-0 rounded-[10px] bg-admin-surface-alt px-3 py-2.5 text-[12.5px] text-admin-ink-muted">{copy.note}</p>
            {note ? (
              <p role="alert" className="m-0 rounded-[10px] bg-admin-critical-soft px-3 py-2.5 text-[12.5px] text-admin-red">
                {note}
              </p>
            ) : null}
          </>
        ) : null}
      </RecordSheet>
    </>
  );
}
