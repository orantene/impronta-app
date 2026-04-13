"use client";

import { useActionState } from "react";
import {
  completeRecoveryPasswordUpdate,
  type PasswordRecoveryActionState,
} from "@/app/auth/password-actions";
import { Button } from "@/components/ui/button";

export function UpdatePasswordForm() {
  const [state, formAction, pending] = useActionState<
    PasswordRecoveryActionState,
    FormData
  >(completeRecoveryPasswordUpdate, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-m text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="space-y-2">
        <label htmlFor="recovery-new" className="text-m font-medium">
          New password
        </label>
        <input
          id="recovery-new"
          name="new_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-m shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="recovery-confirm" className="text-m font-medium">
          Confirm new password
        </label>
        <input
          id="recovery-confirm"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-m shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Update password and continue"}
      </Button>
    </form>
  );
}
