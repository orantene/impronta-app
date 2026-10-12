"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { QaImpersonationState } from "@/lib/server-actions/admin-impersonation";

const initialState: QaImpersonationState = { error: null };

export function QaImpersonationButton({
  action,
  label,
  unavailableLabel,
  icon,
  formClassName,
  buttonClassName,
}: {
  action: (prev: QaImpersonationState) => Promise<QaImpersonationState>;
  label: string;
  unavailableLabel: string;
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
          {unavailableLabel}
        </p>
      ) : null}
    </form>
  );
}
