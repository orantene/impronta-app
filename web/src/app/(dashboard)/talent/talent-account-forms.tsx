"use client";

import { useActionState } from "react";
import {
  setTalentAccountPasswordOAuthOnly,
  updateTalentAccountDisplayName,
  updateTalentAccountEmail,
  updateTalentAccountPassword,
  type TalentAccountActionState,
} from "@/app/(dashboard)/talent/account-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const inputTalent =
  "h-11 rounded-xl border-border/60 bg-background/80 px-3.5 text-[15px] shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-[var(--impronta-gold)]/50 focus-visible:ring-[var(--impronta-gold)]/25";

const submitTalent =
  "h-11 rounded-2xl bg-[var(--impronta-gold)] px-5 text-[15px] font-semibold text-white shadow-md shadow-black/10 hover:bg-[var(--impronta-gold)]/92 disabled:opacity-60";

function FormMessage({ state }: { state: TalentAccountActionState }) {
  if (!state) return null;
  if (state.error) {
    return (
      <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive">
        {state.error}
      </p>
    );
  }
  if (state.success && state.message) {
    return (
      <p className="rounded-2xl border border-emerald-500/35 bg-emerald-500/[0.09] px-4 py-3 text-sm leading-relaxed text-emerald-950 dark:text-emerald-50">
        {state.message}
      </p>
    );
  }
  return null;
}

export function TalentAccountDisplayNameForm({
  defaultDisplayName,
}: {
  defaultDisplayName: string;
}) {
  const [state, formAction, pending] = useActionState<
    TalentAccountActionState,
    FormData
  >(updateTalentAccountDisplayName, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <div className="space-y-2">
        <Label htmlFor="display_name" className="text-sm font-medium">
          Display name
        </Label>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Shown in the dashboard and to the agency. This is not your public profile name on the
          site — edit that under Profile.
        </p>
        <Input
          id="display_name"
          name="display_name"
          defaultValue={defaultDisplayName}
          autoComplete="nickname"
          className={inputTalent}
        />
      </div>
      <Button type="submit" className={submitTalent} disabled={pending}>
        {pending ? "Saving…" : "Save display name"}
      </Button>
    </form>
  );
}

export function TalentAccountEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction, pending] = useActionState<
    TalentAccountActionState,
    FormData
  >(updateTalentAccountEmail, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <div className="space-y-2">
        <Label htmlFor="account_email_new" className="text-sm font-medium">
          Email address
        </Label>
        <p className="text-xs leading-relaxed text-muted-foreground">
          We will send a confirmation link. You may need to confirm from both inboxes while the
          change is pending.
        </p>
        <Input
          id="account_email_new"
          name="email"
          type="email"
          defaultValue={currentEmail}
          autoComplete="email"
          required
          className={inputTalent}
        />
      </div>
      <Button type="submit" className={submitTalent} disabled={pending}>
        {pending ? "Sending…" : "Update email"}
      </Button>
    </form>
  );
}

export function TalentAccountPasswordForm({
  hasEmailPassword,
}: {
  hasEmailPassword: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    TalentAccountActionState,
    FormData
  >(updateTalentAccountPassword, undefined);

  const [oauthState, oauthFormAction, oauthPending] = useActionState<
    TalentAccountActionState,
    FormData
  >(setTalentAccountPasswordOAuthOnly, undefined);

  if (!hasEmailPassword) {
    return (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          You currently sign in with Google (or another provider). You can add an email password so
          you can also log in with your address and password — for example when Google is
          unavailable.
        </p>
        <form action={oauthFormAction} className="space-y-4">
          <FormMessage state={oauthState} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="oauth_new_password" className="text-sm font-medium">
                New password
              </Label>
              <Input
                id="oauth_new_password"
                name="new_password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className={inputTalent}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="oauth_confirm_password" className="text-sm font-medium">
                Confirm password
              </Label>
              <Input
                id="oauth_confirm_password"
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className={inputTalent}
              />
            </div>
          </div>
          <Button type="submit" className={submitTalent} disabled={oauthPending}>
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
        <Label htmlFor="current_password" className="text-sm font-medium">
          Current password
        </Label>
        <Input
          id="current_password"
          name="current_password"
          type="password"
          autoComplete="current-password"
          required
          className={inputTalent}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="new_password" className="text-sm font-medium">
            New password
          </Label>
          <Input
            id="new_password"
            name="new_password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className={inputTalent}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm_password" className="text-sm font-medium">
            Confirm new password
          </Label>
          <Input
            id="confirm_password"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className={inputTalent}
          />
        </div>
      </div>
      <Button type="submit" className={submitTalent} disabled={pending}>
        {pending ? "Updating…" : "Change password"}
      </Button>
    </form>
  );
}
