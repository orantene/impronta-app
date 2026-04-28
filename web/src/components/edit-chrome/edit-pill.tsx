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
 * window. `useFormStatus` provides the pending UI state once hydration lands;
 * `useActionState` surfaces server-side failures (no scope, JWT mint error)
 * inline so a click never silently no-ops.
 *
 * Auto-engage: when `autoEnter` is true the pill submits the form as soon as
 * it hydrates. Used by deep links from the admin shell — `/?edit=1` lands on
 * the storefront and immediately flips into edit mode without a second click.
 *
 * Visual intent: understated, premium, unambiguous affordance. Pencil icon +
 * label. One clear action: "Edit".
 */

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import {
  enterEditModeAction,
  type EnterEditModeResult,
} from "@/lib/site-admin/edit-mode/server";

interface EditPillProps {
  /** When true, submit the form on first hydrate. Used by `/?edit=1`. */
  autoEnter?: boolean;
}

const INITIAL_STATE: EnterEditModeResult = { ok: true };

// Adapter: useActionState passes (prevState, formData) to the action; the
// underlying server action is parameterless and returns the result envelope.
async function enterAction(
  _prev: EnterEditModeResult,
  _formData: FormData,
): Promise<EnterEditModeResult> {
  return enterEditModeAction();
}

export function EditPill({ autoEnter = false }: EditPillProps) {
  const [state, formAction] = useActionState(enterAction, INITIAL_STATE);
  const formRef = useRef<HTMLFormElement | null>(null);
  const autoFiredRef = useRef(false);

  useEffect(() => {
    if (!autoEnter || autoFiredRef.current) return;
    if (!formRef.current) return;
    autoFiredRef.current = true;
    // T1-1 — Strip `?edit=1` from the URL on first auto-fire. Without
    // this, a failed enter (no staff session, no tenant scope, JWT mint
    // error, network drop on a different host like impronta.lvh.me)
    // leaves the intent param in place; on reload the auto-enter fires
    // again, fails again, and the operator gets stuck in a retry loop
    // with no way to recover. The success path also benefits: copying
    // the URL after entering edit mode no longer carries a stale intent
    // flag that would trigger a re-enter on the next visit.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("edit")) {
        url.searchParams.delete("edit");
        const next = url.pathname + (url.search ? url.search : "") + url.hash;
        window.history.replaceState(null, "", next);
      }
    }
    // requestSubmit goes through React's form-action path so the action
    // result lands in `state` exactly like a manual click.
    formRef.current.requestSubmit();
  }, [autoEnter]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="pointer-events-none fixed inset-0 z-[80] flex items-end justify-end p-4 sm:p-6"
    >
      {/* T3-2 — Top-of-viewport progress bar during pending entry. The
          corner pill alone can be missed when the operator's eyes are on
          the page; a thin animated bar at viewport top is unmissable and
          mirrors the pattern modern apps use (Vercel, Linear, GitHub) to
          telegraph "something is loading globally." Only renders during
          the auto-enter or post-click pending window — once edit mode
          engages, EditChromeMount swaps the whole tree to EditShell and
          the bar unmounts with the pill. */}
      <EntryProgressBar autoEnter={autoEnter} />
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        {state && state.ok === false && state.error ? (
          <div
            role="alert"
            className="max-w-[280px] rounded-lg border border-rose-300/60 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-900 shadow-md"
          >
            {state.error}
          </div>
        ) : null}
        <EditPillButton autoEnter={autoEnter} />
      </div>
    </form>
  );
}

/**
 * Slim 2px progress bar pinned to the top of the viewport during the
 * enter-edit-mode round trip. Indeterminate animation (a moving glow)
 * because we don't know the action's actual duration. Renders nothing
 * when idle so it doesn't ghost over the storefront.
 */
function EntryProgressBar({ autoEnter }: { autoEnter: boolean }) {
  const { pending } = useFormStatus();
  if (!pending && !autoEnter) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[2px] overflow-hidden"
      style={{ background: "rgba(11, 11, 13, 0.06)" }}
    >
      <style>{`
        @keyframes entry-progress-glide {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
      <div
        className="h-full w-1/3"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(11,11,13,0.85) 50%, transparent)",
          animation: "entry-progress-glide 1.1s ease-in-out infinite",
        }}
      />
    </div>
  );
}

function EditPillButton({ autoEnter }: { autoEnter: boolean }) {
  const { pending } = useFormStatus();
  // While auto-engaging, render the loading state immediately so the user
  // sees "Loading editor…" the instant the page paints, not only after the
  // action handler kicks the pending state on. The auto-fire effect runs
  // post-mount so without this hint the button briefly says "Edit".
  const showPending = pending || autoEnter;
  return (
    <button
      type="submit"
      disabled={showPending}
      aria-busy={showPending}
      className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-black/10 bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)] transition hover:bg-zinc-800 disabled:opacity-60 data-[pending=true]:opacity-60"
      data-pending={showPending}
      aria-label={showPending ? "Entering edit mode" : "Edit this page"}
    >
      {showPending ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-spin"
          aria-hidden
        >
          <path d="M21 12a9 9 0 1 1-6.22-8.56" />
        </svg>
      ) : (
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
      )}
      {showPending ? "Loading editor…" : "Edit"}
    </button>
  );
}
