"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import {
  assignInquiryToCurrentStaffForm,
  quickPatchInquiryStatus,
  type AdminActionState,
} from "@/app/(dashboard)/admin/actions";
import { Button } from "@/components/ui/button";
import {
  ADMIN_ACTION_TERTIARY_CLASS,
  ADMIN_FORM_CONTROL,
  LUXURY_GOLD_BUTTON_CLASS,
} from "@/lib/dashboard-shell-classes";
import { INQUIRY_STATUS_VALUES } from "@/lib/admin/validation";
import { INQUIRY_STATUS_LABELS } from "@/lib/inquiries";
import { cn } from "@/lib/utils";

export function AdminInquiryListRowActions({
  inquiryId,
  status,
  assignedStaffId,
  currentUserId,
  buildDuplicateHref,
  buildFilterByAccountHref,
  clientAccountId,
}: {
  inquiryId: string;
  status: string;
  assignedStaffId: string | null;
  currentUserId: string | null;
  buildDuplicateHref: string;
  buildFilterByAccountHref: string | null;
  clientAccountId: string | null;
}) {
  const router = useRouter();
  const [state, action] = useActionState(
    async (_p: AdminActionState | undefined, fd: FormData) => {
      const next = await quickPatchInquiryStatus(fd);
      if (!next?.error) router.refresh();
      return next;
    },
    undefined as AdminActionState | undefined,
  );

  const showAssign = Boolean(currentUserId && assignedStaffId !== currentUserId);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <form action={action} className="flex items-center gap-1">
        <input type="hidden" name="inquiry_id" value={inquiryId} />
        <label htmlFor={`inq-st-${inquiryId}`} className="sr-only">
          Status
        </label>
        <select
          id={`inq-st-${inquiryId}`}
          name="status"
          className={cn(ADMIN_FORM_CONTROL, "h-8 min-w-[148px] py-0 text-xs")}
          defaultValue={status}
          onChange={(e) => {
            e.currentTarget.form?.requestSubmit();
          }}
        >
          {INQUIRY_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {INQUIRY_STATUS_LABELS[s] ?? s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </form>
      {state?.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
      {showAssign ? (
        <form action={assignInquiryToCurrentStaffForm}>
          <input type="hidden" name="inquiry_id" value={inquiryId} />
          <Button size="sm" variant="outline" className="h-8 text-xs">
            {assignedStaffId ? "Take ownership" : "Assign to me"}
          </Button>
        </form>
      ) : null}
      <Button size="sm" className={cn("h-8 rounded-xl text-xs", LUXURY_GOLD_BUTTON_CLASS)} asChild>
        <Link href={`/admin/inquiries/${inquiryId}`} scroll={false}>
          Open
        </Link>
      </Button>
      <Button variant="ghost" size="sm" className={cn("h-8 px-2 text-xs", ADMIN_ACTION_TERTIARY_CLASS)} asChild>
        <Link href={buildDuplicateHref} scroll={false}>
          Duplicate
        </Link>
      </Button>
      {clientAccountId && buildFilterByAccountHref ? (
        <Button variant="ghost" size="sm" className={cn("h-8 px-2 text-xs", ADMIN_ACTION_TERTIARY_CLASS)} asChild>
          <Link href={buildFilterByAccountHref} scroll={false}>
            Same account
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
