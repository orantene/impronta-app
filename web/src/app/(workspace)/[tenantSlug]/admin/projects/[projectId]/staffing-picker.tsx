"use client";

/**
 * TUL-1373: the staffing picker on the Team tab. The coordinator filters the roster by availability for the
 * job's window and rating, picks people, and holds their dates before anything is confirmed. Held people can
 * be released. Everything the engine decides (is the person really free) is answered by the server action.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { canHold, pickerRows, type PickerCandidate } from "@/lib/coordinator/staffing-picker-view";
import { holdTalentsForProjectAction, releaseProjectHoldAction } from "./staffing-actions";
import { BTN_PRIMARY, BTN_ROW, BTN_SECONDARY, Card, Pill } from "../_shared";

export type StaffingCopy = {
  title: string;
  hint: string;
  showBusy: string;
  minRating: string;
  anyRating: string;
  free: string;
  busy: string;
  unknown: string;
  onJob: string;
  held: string;
  hold: string;
  release: string;
  none: string;
  noInquiry: string;
  outcomes: Record<string, string>;
  refusals: Record<string, string>;
};

export function StaffingPicker({
  bookingId,
  candidates,
  assignedIds,
  holds,
  canWrite,
  copy,
}: {
  bookingId: string;
  candidates: PickerCandidate[];
  assignedIds: string[];
  holds: Array<{ id: string; talentProfileId: string }>;
  canWrite: boolean;
  copy: StaffingCopy;
}) {
  const router = useRouter();
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [minRating, setMinRating] = useState<number | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const holdByTalent = useMemo(() => new Map(holds.map((h) => [h.talentProfileId, h.id])), [holds]);
  const rows = useMemo(
    () => pickerRows(candidates, { assignedIds, heldIds: holds.map((h) => h.talentProfileId) }, { showUnavailable, minRating, sortBy: "best" }),
    [candidates, assignedIds, holds, showUnavailable, minRating],
  );
  const tag = { free: copy.free, busy: copy.busy, unknown: copy.unknown } as const;

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const hold = () => {
    setMessage(null);
    startTransition(async () => {
      const r = await holdTalentsForProjectAction({ bookingId, talentProfileIds: picked });
      if (!r.ok) {
        setMessage(copy.refusals[r.reason] ?? copy.refusals.unavailable);
        return;
      }
      const problems = r.outcomes.filter((o) => o.outcome !== "held").map((o) => copy.outcomes[o.outcome] ?? copy.outcomes.failed);
      setMessage(problems.length > 0 ? [...new Set(problems)].join(" ") : null);
      setPicked([]);
      router.refresh();
    });
  };

  const release = (holdId: string) => {
    setMessage(null);
    startTransition(async () => {
      const r = await releaseProjectHoldAction({ bookingId, holdId });
      if (!r.ok) {
        setMessage(copy.refusals[r.reason] ?? copy.refusals.unavailable);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Card>
      <div className="flex flex-col gap-2 px-4 py-3" data-staffing-picker>
        <p className="m-0 text-[12.5px] text-admin-ink-muted">{copy.hint}</p>
        <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-admin-ink">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showUnavailable} onChange={(e) => setShowUnavailable(e.target.checked)} data-staffing-show-busy />
            {copy.showBusy}
          </label>
          <label className="flex items-center gap-1.5">
            {copy.minRating}
            <select
              value={minRating ?? ""}
              onChange={(e) => setMinRating(e.target.value === "" ? null : Number(e.target.value))}
              data-staffing-min-rating
              className="h-[30px] rounded-[8px] border border-admin-border bg-admin-card px-2 text-[12.5px]"
            >
              <option value="">{copy.anyRating}</option>
              <option value="4">4.0★</option>
              <option value="4.5">4.5★</option>
            </select>
          </label>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="m-0 border-t px-4 py-3 text-[13px] text-admin-ink-muted">{copy.none}</p>
      ) : (
        <ul className="m-0 list-none p-0" data-staffing-rows>
          {rows.map((r) => {
            const holdId = holdByTalent.get(r.talentProfileId);
            return (
              <li key={r.talentProfileId} data-staffing-row={r.talentProfileId} className="flex items-center justify-between gap-3 border-t px-4 py-2.5">
                <label className="flex items-center gap-2 text-[13px] text-admin-ink">
                  <input
                    type="checkbox"
                    disabled={!canWrite || !canHold(r) || pending}
                    checked={picked.includes(r.talentProfileId)}
                    onChange={() => toggle(r.talentProfileId)}
                  />
                  <b>{r.name}</b>
                  {r.rating != null ? <span className="text-admin-ink-muted">{r.rating.toFixed(1)}★</span> : null}
                </label>
                <span className="flex items-center gap-2">
                  <Pill tone={r.availability === "free" ? "green" : r.availability === "busy" ? "coral" : "slate"}>{tag[r.availability]}</Pill>
                  {r.assigned ? <Pill tone="indigo">{copy.onJob}</Pill> : null}
                  {holdId ? (
                    <>
                      <Pill tone="indigo">{copy.held}</Pill>
                      {canWrite ? (
                        <button type="button" disabled={pending} onClick={() => release(holdId)} className={`${BTN_SECONDARY} ${BTN_ROW}`} data-staffing-release={holdId}>
                          {copy.release}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5">
        <span role="status" className="text-[12.5px] text-admin-ink-muted" data-staffing-message>
          {message}
        </span>
        <button type="button" disabled={!canWrite || picked.length === 0 || pending} onClick={hold} className={BTN_PRIMARY} data-staffing-hold>
          {copy.hold}
        </button>
      </div>
    </Card>
  );
}
