"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { QaSwitchReason } from "@/lib/impersonation/validate";
import type { QaImpersonationState } from "@/lib/server-actions/admin-impersonation";

const initialState: QaImpersonationState = { error: null };

export function QaImpersonationButton({
  action,
  label,
  unavailableLabel,
  reasonLabels,
  icon,
  formClassName,
  buttonClassName,
}: {
  action: (prev: QaImpersonationState) => Promise<QaImpersonationState>;
  label: string;
  unavailableLabel: string;
  /** Specific reason copy for the super admin; falls back to `unavailableLabel`. */
  reasonLabels?: Partial<Record<QaSwitchReason, string>>;
  icon: ReactNode;
  formClassName?: string;
  buttonClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className={formClassName}>
      <Button type="submit" variant="outline" size="sm" className={buttonClassName} disabled={pending}>
        {icon}
        {label}
      </Button>
      {state.error ? (
        <p role="alert" className="mt-1 max-w-[16rem] text-[11px] leading-snug text-destructive">
          {(state.reason && reasonLabels?.[state.reason]) || unavailableLabel}
        </p>
      ) : null}
    </form>
  );
}
