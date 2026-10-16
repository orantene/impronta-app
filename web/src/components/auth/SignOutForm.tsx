"use client";

import type { CSSProperties, ReactNode } from "react";

import { clearBrowserAuthState } from "@/lib/auth/sign-out-client";
import { SIGN_OUT_PATH } from "@/lib/auth/sign-out-paths";

/**
 * Declarative Log out (S1): a plain top-level POST to the sign-out route that
 * also works without JavaScript. With JS, the browser auth state is cleared
 * first (see `signOutEverywhere`). Drop-in for `<form action={signOut}>`.
 */
export function SignOutForm({
  children,
  className,
  style,
  path = SIGN_OUT_PATH,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  path?: string;
}) {
  return (
    <form
      method="post"
      action={path}
      className={className}
      style={style}
      onSubmit={() => {
        try {
          clearBrowserAuthState();
        } catch {
          // The POST still signs out server-side.
        }
      }}
    >
      {children}
    </form>
  );
}
