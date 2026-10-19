"use client";

import type { CSSProperties, ReactNode } from "react";

import { prepareBrowserSignOut } from "@/lib/auth/sign-out-client";
import { SIGN_OUT_PATH } from "@/lib/auth/sign-out-paths";

/**
 * Declarative Log out (S1): a plain top-level POST to the sign-out route that
 * also works without JavaScript. With JS, the browser is prepared first
 * (see `prepareBrowserSignOut`: storage cleared, cookies left for the POST). Drop-in for `<form action={signOut}>`.
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
          // Cookies stay attached to this POST so the server can revoke the session.
          prepareBrowserSignOut();
        } catch {
          // The POST still signs out server-side.
        }
      }}
    >
      {children}
    </form>
  );
}
