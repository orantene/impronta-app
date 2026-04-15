"use client";

import { useActionState } from "react";
import { requestPasswordReset, type AuthActionState } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function ForgotPasswordForm({ defaultEmail }: { defaultEmail?: string }) {
  const [state, formAction, pending] = useActionState<
    AuthActionState,
    FormData
  >(requestPasswordReset, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.message ? (
        <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground">
          {state.message}
        </p>
      ) : null}
      <div className="space-y-2">
        <label htmlFor="reset-email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="reset-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={defaultEmail}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          Back to log in
        </Link>
      </p>
    </form>
  );
}
