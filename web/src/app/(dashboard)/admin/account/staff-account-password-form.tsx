"use client";

import { useActionState } from "react";
import {
  setStaffAccountPasswordOAuthOnly,
  updateStaffAccountPassword,
  type StaffAccountPasswordState,
} from "@/app/(dashboard)/admin/account-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADMIN_FORM_CONTROL, LUXURY_GOLD_BUTTON_CLASS } from "@/lib/dashboard-shell-classes";

function FormMessage({ state }: { state: StaffAccountPasswordState }) {
  if (!state) return null;
  if (state.error) {
    return (
      <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {state.error}
      </p>
    );
  }
  if (state.success && state.message) {
    return (
      <p className="rounded-md border border-emerald-500/35 bg-emerald-500/[0.09] px-3 py-2 text-sm text-emerald-950 dark:text-emerald-50">
        {state.message}
      </p>
    );
  }
  return null;
}

export function StaffAccountPasswordForm({ hasEmailPassword }: { hasEmailPassword: boolean }) {
  const [state, formAction, pending] = useActionState<
    StaffAccountPasswordState,
    FormData
  >(updateStaffAccountPassword, undefined);

  const [oauthState, oauthFormAction, oauthPending] = useActionState<
    StaffAccountPasswordState,
    FormData
  >(setStaffAccountPasswordOAuthOnly, undefined);

  if (!hasEmailPassword) {
    return (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          You currently sign in with Google. Add a password if you want to log in with email and
          password as well.
        </p>
        <form action={oauthFormAction} className="space-y-4">
          <FormMessage state={oauthState} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="staff_oauth_new">New password</Label>
              <Input
                id="staff_oauth_new"
                name="new_password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className={ADMIN_FORM_CONTROL}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff_oauth_confirm">Confirm password</Label>
              <Input
                id="staff_oauth_confirm"
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className={ADMIN_FORM_CONTROL}
              />
            </div>
          </div>
          <Button type="submit" className={LUXURY_GOLD_BUTTON_CLASS} disabled={oauthPending}>
            {oauthPending ? "Saving…" : "Save password"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <div className="space-y-2">
        <Label htmlFor="staff_current_password">Current password</Label>
        <Input
          id="staff_current_password"
          name="current_password"
          type="password"
          autoComplete="current-password"
          required
          className={ADMIN_FORM_CONTROL}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="staff_new_password">New password</Label>
          <Input
            id="staff_new_password"
            name="new_password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className={ADMIN_FORM_CONTROL}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff_confirm_password">Confirm new password</Label>
          <Input
            id="staff_confirm_password"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className={ADMIN_FORM_CONTROL}
          />
        </div>
      </div>
      <Button type="submit" className={LUXURY_GOLD_BUTTON_CLASS} disabled={pending}>
        {pending ? "Updating…" : "Change password"}
      </Button>
    </form>
  );
}
