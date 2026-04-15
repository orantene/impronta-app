"use client";

import { useActionState } from "react";
import { signInWithEmail, type AuthActionState } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function LoginForm({ nextPath, defaultEmail }: { nextPath?: string; defaultEmail?: string }) {
  const [state, formAction, pending] = useActionState<
    AuthActionState,
    FormData
  >(signInWithEmail, undefined);

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
          defaultValue={defaultEmail}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <Link
            href="/forgot-password"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Log in with email"}
      </Button>
      <p className="text-center text-sm text-smuted-foreground">
        No account?{" "}
        <Link
          href={nextPath ? `/register?next=${encodeURIComponent(nextPath)}` : "/register"}
          className="text-primary underline-offset-4 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </form>
  );
}
