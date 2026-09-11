"use client";

/**
 * W47 `Add milestone`: the inline form (title · due date) that writes one
 * draft deliverable through `addProjectMilestone`. Every refusal is the
 * page's sentence; the row appears on refresh.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { BTN_PRIMARY, BTN_ROW, BTN_SECONDARY } from "../_shared";
import { addProjectMilestone } from "./actions";
import type { MilestoneRefusalCopy } from "./milestone-decisions";

export function AddMilestone({
  bookingId,
  copy,
}: {
  bookingId: string;
  copy: MilestoneRefusalCopy & { add: string; title: string; due: string; save: string; cancel: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={cn(BTN_SECONDARY, BTN_ROW)} data-milestone-add>
        {copy.add}
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      data-milestone-add-form
      onSubmit={(e) => {
        e.preventDefault();
        setNote(null);
        startTransition(async () => {
          const result = await addProjectMilestone({ bookingId, title, dueAt: due || null });
          if (!result.ok) {
            setNote(
              result.reason === "invalid" ? copy.invalid : result.reason === "not_allowed" ? copy.notAllowed : result.reason === "not_found" ? copy.notFound : copy.unavailable,
            );
            return;
          }
          setOpen(false);
          setTitle("");
          setDue("");
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-admin-ink-muted">
        {copy.title}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          disabled={pending}
          data-milestone-add-title
          className="h-[30px] w-[220px] rounded-[8px] border border-admin-border bg-admin-card px-2 text-[13px] font-normal text-admin-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-admin-ink-muted">
        {copy.due}
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          disabled={pending}
          data-milestone-add-due
          className="h-[30px] rounded-[8px] border border-admin-border bg-admin-card px-2 text-[13px] font-normal text-admin-ink"
        />
      </label>
      <button type="submit" disabled={pending || title.trim().length === 0} className={cn(BTN_PRIMARY, BTN_ROW)} data-milestone-add-save>
        {copy.save}
      </button>
      <button type="button" disabled={pending} onClick={() => setOpen(false)} className={cn(BTN_SECONDARY, BTN_ROW)}>
        {copy.cancel}
      </button>
      {note ? (
        <span role="status" className="basis-full text-[12px] text-admin-red">
          {note}
        </span>
      ) : null}
    </form>
  );
}
