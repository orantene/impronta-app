"use client";

/**
 * EditPill — idle-state floating CTA.
 *
 * Anchored bottom-right on the live storefront. Visible only to authenticated
 * staff on a tenant public host (mount is gated server-side by
 * EditChromeMount). Submitting flips the tenant into edit mode by calling
 * `enterEditModeAction`, which sets both the preview JWT (for draft render)
 * and the edit marker cookie, then revalidates the layout so the chrome
 * switches to the engaged shell on the next render.
 *
 * Form-based invocation is deliberate: a <form action={serverAction}> submit
 * goes through the browser's native submit path, so it works even before
 * React hydration finishes. A plain onClick would silently fail during that
 * window. `useFormStatus` provides the pending UI state once hydration lands.
 *
 * Visual intent: understated, premium, unambiguous affordance. Pencil icon +
 * label. One clear action: "Edit".
 */

import { useFormStatus } from "react-dom";

import { enterEditModeAction } from "@/lib/site-admin/edit-mode/server";

export function EditPill() {
  return (
    <form
      action={enterEditModeAction}
      className="pointer-events-none fixed inset-0 z-[80] flex items-end justify-end p-4 sm:p-6"
    >
      <EditPillButton />
    </form>
  );
}

function EditPillButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-black/10 bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)] transition hover:bg-zinc-800 disabled:opacity-60 data-[pending=true]:opacity-60"
      data-pending={pending}
      aria-label={pending ? "Entering edit mode" : "Edit this page"}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
      {pending ? "Loading editor…" : "Edit"}
    </button>
  );
}
