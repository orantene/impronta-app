"use client";

/**
 * WorkspaceLifecycleDialog
 *
 * One dialog, two modes:
 *   • "leave"    — non-owner self-removal. Soft confirmation.
 *   • "archive"  — owner-only soft delete. Typed slug confirmation.
 *
 * Both actions land via the corresponding server action in
 * `lib/server-actions/workspace-lifecycle.ts`. On success we push the
 * user to `/talent` (they no longer have admin access here).
 *
 * Visual register matches the Tulala marketing palette (parchment +
 * forest accent) so it reads as a deliberate, branded action rather
 * than generic shadcn chrome.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import {
  archiveOwnedWorkspace,
  leaveWorkspace,
} from "@/lib/server-actions/workspace-lifecycle";

type Mode = "leave" | "archive";

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  tenantId: string;
  workspaceName: string;
  workspaceSlug: string;
}

export function WorkspaceLifecycleDialog({
  open,
  onOpenChange,
  mode,
  tenantId,
  workspaceName,
  workspaceSlug,
}: Props) {
  const router = useRouter();
  const [mounted, setMounted] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [submitState, setSubmitState] = React.useState<SubmitState>({
    status: "idle",
  });

  React.useEffect(() => setMounted(true), []);

  // Lock body scroll while open.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Reset state every time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setTyped("");
      setSubmitState({ status: "idle" });
    }
  }, [open]);

  // Close on Escape.
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && submitState.status !== "submitting") {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange, submitState.status]);

  if (!mounted || !open) return null;

  const isArchive = mode === "archive";
  const archiveReady =
    !isArchive || typed.trim().toLowerCase() === workspaceSlug.toLowerCase();

  async function handleConfirm() {
    setSubmitState({ status: "submitting" });
    const result = isArchive
      ? await archiveOwnedWorkspace(tenantId, typed)
      : await leaveWorkspace(tenantId);
    if (!result.ok) {
      setSubmitState({
        status: "error",
        message: result.error ?? "Something went wrong.",
      });
      return;
    }
    onOpenChange(false);
    router.replace("/talent");
    router.refresh();
  }

  return createPortal(
    <div data-platform-surface="marketing">
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200] bg-[rgba(15,23,20,0.55)] backdrop-blur-sm"
        aria-hidden="true"
        onClick={() => {
          if (submitState.status !== "submitting") onOpenChange(false);
        }}
      />

      {/* Dialog wrapper */}
      <div
        className="fixed inset-0 z-[201] flex items-center justify-center overflow-y-auto p-4 sm:p-8"
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="workspace-lifecycle-title"
          className="relative w-full max-w-[460px] rounded-[28px] p-7 sm:p-9"
          style={{
            background: "var(--plt-bg-elevated)",
            border: "1px solid var(--plt-hairline-strong)",
            boxShadow:
              "0 30px 80px -30px rgba(15,23,20,0.45), 0 2px 8px -2px rgba(15,23,20,0.08)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close */}
          <button
            type="button"
            onClick={() => {
              if (submitState.status !== "submitting") onOpenChange(false);
            }}
            aria-label="Close"
            disabled={submitState.status === "submitting"}
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-50"
            style={{ color: "var(--plt-muted)" }}
          >
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:bg-[var(--plt-bg-raised)]"
              style={{ borderColor: "var(--plt-hairline)" }}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path
                  d="M1 1L13 13M13 1L1 13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </button>

          {/* Header */}
          <p
            className="plt-mono text-[0.625rem] font-semibold uppercase tracking-[0.22em]"
            style={{ color: isArchive ? "#9b1c14" : "var(--plt-muted)" }}
          >
            {isArchive ? "Archive workspace" : "Leave workspace"}
          </p>
          <h2
            id="workspace-lifecycle-title"
            className="plt-display mt-2 text-[1.5rem] font-semibold leading-[1.15] tracking-[-0.02em]"
            style={{ color: "var(--plt-ink)" }}
          >
            {isArchive ? "Archive " : "Leave "}
            <span
              style={{ color: isArchive ? "#9b1c14" : "var(--plt-forest)" }}
            >
              {workspaceName}
            </span>
            ?
          </h2>

          {/* Body copy */}
          <div
            className="mt-3 space-y-2.5 text-[0.875rem] leading-[1.55]"
            style={{ color: "var(--plt-muted)" }}
          >
            {isArchive ? (
              <>
                <p>
                  The workspace will be hidden from the public site and admin
                  shell. Your roster, inquiries, media and history are kept —
                  this is reversible from Platform admin.
                </p>
                <p>
                  You&apos;ll be returned to your talent dashboard. To re-open
                  the workspace later, contact support.
                </p>
              </>
            ) : (
              <>
                <p>
                  You&apos;ll lose admin access to this workspace and stop
                  receiving its notifications. Your talent profile here (if
                  any) is unaffected.
                </p>
                <p>
                  You&apos;ll be returned to your talent dashboard.
                </p>
              </>
            )}
          </div>

          {/* Typed-confirmation gate (archive only) */}
          {isArchive && (
            <div className="mt-5">
              <label className="block">
                <span
                  className="plt-mono mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  Type the workspace slug to confirm
                </span>
                <span
                  className="mb-2 block text-[0.75rem]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  <code
                    className="rounded px-1.5 py-0.5"
                    style={{
                      background: "var(--plt-bg-raised)",
                      color: "var(--plt-ink)",
                      fontSize: "0.75rem",
                    }}
                  >
                    {workspaceSlug}
                  </code>
                </span>
                <input
                  type="text"
                  value={typed}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={workspaceSlug}
                  className="flex h-12 w-full rounded-2xl px-4 text-[0.9375rem] leading-none outline-none transition-[border-color,box-shadow] placeholder:text-[var(--plt-muted-soft)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,#9b1c14_18%,transparent)]"
                  style={{
                    backgroundColor: "var(--plt-bg)",
                    border: "1px solid var(--plt-hairline-strong)",
                    color: "var(--plt-ink)",
                  }}
                  disabled={submitState.status === "submitting"}
                />
              </label>
            </div>
          )}

          {/* Error surface */}
          {submitState.status === "error" && (
            <p
              role="alert"
              className="mt-4 rounded-xl px-3 py-2 text-[0.8125rem]"
              style={{
                background: "rgba(180, 35, 24, 0.08)",
                color: "#9b1c14",
                border: "1px solid rgba(180, 35, 24, 0.18)",
              }}
            >
              {submitState.message}
            </p>
          )}

          {/* Actions */}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={submitState.status === "submitting"}
              className="inline-flex items-center justify-center rounded-full border px-5 py-2.5 text-[0.875rem] font-medium transition-colors disabled:opacity-60"
              style={{
                borderColor: "var(--plt-hairline-strong)",
                color: "var(--plt-ink)",
                background: "var(--plt-bg-raised)",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={
                submitState.status === "submitting" ||
                (isArchive && !archiveReady)
              }
              className="group inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-[0.875rem] font-medium leading-none transition-[background] duration-200 disabled:cursor-not-allowed disabled:opacity-60"
              style={
                isArchive
                  ? {
                      background: "#9b1c14",
                      color: "#fff5f5",
                      boxShadow: "0 8px 24px -10px rgba(155, 28, 20, 0.45)",
                    }
                  : {
                      background: "var(--plt-forest)",
                      color: "var(--plt-forest-on)",
                      boxShadow: "var(--plt-shadow-forest)",
                    }
              }
            >
              {submitState.status === "submitting"
                ? isArchive
                  ? "Archiving…"
                  : "Leaving…"
                : isArchive
                  ? "Archive workspace"
                  : "Leave workspace"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
