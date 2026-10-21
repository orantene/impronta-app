"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { leaveWorkspaceAction } from "@/lib/talent/leave-workspace-actions";
import { leaveCopy, type LeaveOutcome } from "@/lib/talent/leave-workspace";

/** TUL-1469 · "Leave" for one workspace, behind a confirm that says what happens. */
export function LeaveWorkspaceButton({ tenantId, name, locale }: { tenantId: string; name: string; locale: string }) {
  const c = leaveCopy(locale);
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<LeaveOutcome | null>(null);
  const [pending, start] = useTransition();

  function go() {
    start(async () => {
      const { outcome } = await leaveWorkspaceAction({ tenantId });
      setMessage(outcome);
      setAsking(false);
      if (outcome === "left" || outcome === "not_member") router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2" data-testid={`leave-${tenantId}`}>
      {asking ? (
        <div role="alertdialog" aria-label={c.confirmTitle(name)} className="flex flex-col gap-2 rounded-lg border px-3 py-2">
          <p className="m-0 font-medium">{c.confirmTitle(name)}</p>
          <p className="m-0 text-sm">{c.confirmBody}</p>
          <div className="flex gap-2">
            <button type="button" onClick={go} disabled={pending} className="min-h-[44px] rounded-full border px-4 text-sm font-medium disabled:opacity-50">{c.confirm}</button>
            <button type="button" onClick={() => setAsking(false)} className="min-h-[44px] rounded-full border px-4 text-sm">{c.cancel}</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => { setMessage(null); setAsking(true); }} className="min-h-[44px] self-start rounded-full border px-4 text-sm">{c.leave}</button>
      )}
      {message ? <p role="status" className="m-0 text-sm">{c[message]}</p> : null}
    </div>
  );
}
