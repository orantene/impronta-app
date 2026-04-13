"use client";

import { useActionState } from "react";
import {
  setClientAccountPasswordOAuthOnly,
  updateClientAccountPassword,
  type ClientAccountPasswordState,
} from "@/app/(dashboard)/client/account-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const inputClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-m shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function FormMessage({ state }: { state: ClientAccountPasswordState }) {
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

export function ClientAccountPasswordForm({ hasEmailPassword }: { hasEmailPassword: boolean }) {
  const [state, formAction, pending] = useActionState<
    ClientAccountPasswordState,
    FormData
  >(updateClientAccountPassword, undefined);

  const [oauthState, oauthFormAction, oauthPending] = useActionState<
    ClientAccountPasswordState,
    FormData
  >(setClientAccountPasswordOAuthOnly, undefined);

  if (!hasEmailPassword) {
    return (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          You currently sign in with Google (or another provider). Add a password if you want to log
          in with your email and password as well.
        </p>
        <form action={oauthFormAction} className="space-y-4">
          <FormMessage state={oauthState} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="client_oauth_new">New password</Label>
              <Input
                id="client_oauth_new"
                name="new_password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_oauth_confirm">Confirm password</Label>
              <Input
                id="client_oauth_confirm"
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className={inputClass}
              />
            </div>
          </div>
          <Button type="submit" disabled={oauthPending}>
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
        <Label htmlFor="client_current_password">Current password</Label>
        <Input
          id="client_current_password"
          name="current_password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="client_new_password">New password</Label>
          <Input
            id="client_new_password"
            name="new_password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="client_confirm_password">Confirm new password</Label>
          <Input
            id="client_confirm_password"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className={inputClass}
          />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Updating…" : "Change password"}
      </Button>
    </form>
  );
}
