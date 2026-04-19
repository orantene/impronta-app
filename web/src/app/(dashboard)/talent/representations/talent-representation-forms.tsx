"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  talentApplyToAgencyAction,
  talentRequestHubVisibilityAction,
  talentWithdrawRepresentationRequestAction,
  type TalentRepresentationActionState,
} from "./actions";

type AgencyOption = { id: string; name: string };

/** Apply to an agency (target_type='agency'). */
export function TalentApplyToAgencyForm({
  agencies,
}: {
  agencies: AgencyOption[];
}) {
  const [state, action, pending] = useActionState<
    TalentRepresentationActionState,
    FormData
  >(talentApplyToAgencyAction, undefined);

  if (agencies.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No agencies are accepting applications right now. Check back later.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Agency</span>
        <select
          name="target_tenant_id"
          required
          className="rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          defaultValue=""
        >
          <option value="" disabled>
            Select an agency…
          </option>
          {agencies.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Note (optional)</span>
        <textarea
          name="note"
          rows={3}
          placeholder="Anything the reviewer should know…"
          className="rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send application"}
        </Button>
        {state && !state.ok ? (
          <p className="text-xs text-destructive">{state.error}</p>
        ) : null}
        {state && state.ok ? (
          <p className="text-xs text-emerald-500">{state.message}</p>
        ) : null}
      </div>
    </form>
  );
}

/** Submit a hub visibility request (target_type='hub'). */
export function TalentHubVisibilityForm({
  alreadyOpen,
}: {
  alreadyOpen: boolean;
}) {
  const [state, action, pending] = useActionState<
    TalentRepresentationActionState,
    FormData
  >(talentRequestHubVisibilityAction, undefined);

  if (alreadyOpen) {
    return (
      <p className="text-sm text-muted-foreground">
        A hub visibility request is already open. You can track or withdraw it
        below.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Note (optional)</span>
        <textarea
          name="note"
          rows={3}
          placeholder="Anything the hub reviewer should know…"
          className="rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Request hub visibility"}
        </Button>
        {state && !state.ok ? (
          <p className="text-xs text-destructive">{state.error}</p>
        ) : null}
        {state && state.ok ? (
          <p className="text-xs text-emerald-500">{state.message}</p>
        ) : null}
      </div>
    </form>
  );
}

/** Withdraw a pending request. */
export function TalentWithdrawRequestButton({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState<
    TalentRepresentationActionState,
    FormData
  >(talentWithdrawRepresentationRequestAction, undefined);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        onClick={() => setConfirming(true)}
      >
        Withdraw
      </Button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="request_id" value={requestId} />
      <Button type="submit" size="sm" variant="destructive" disabled={pending}>
        {pending ? "Withdrawing…" : "Confirm"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setConfirming(false)}
        disabled={pending}
      >
        Cancel
      </Button>
      {state && !state.ok ? (
        <span className="text-xs text-destructive">{state.error}</span>
      ) : null}
    </form>
  );
}
