"use client";

import { useActionState } from "react";
import { signUpWithEmail, type AuthActionState } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function RegisterForm({ nextPath }: { nextPath?: string }) {
  const [state, formAction, pending] = useActionState<
    AuthActionState,
    FormData
  >(signUpWithEmail, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {nextPath ? (
        <input type="hidden" name="next" value={nextPath} />
      ) : null}
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
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-sm text-smuted-foreground">At least 8 characters.</p>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Sign up with email"}
      </Button>
      <p className="text-center text-sm text-smuted-foreground">
        Already have an account?{" "}
        <Link
          href={nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"}
          className="text-primary underline-offset-4 hover:underline"
        >
          Log in
        </Link>
      </p>
    </form>
  );
}
