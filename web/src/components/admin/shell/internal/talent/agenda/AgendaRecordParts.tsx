"use client";

import { useState, type ReactNode } from "react";
import { useAgendaCopy } from "./use-agenda-copy";

// ─── More menu ────────────────────────────────────────────────────────────────

export type MoreMenuAction = {
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** Always-visible helper line (mockup: Cancel says what it shows first). */
  hint?: string;
  onClick: () => void;
};

export function MoreMenu({ actions }: { actions: MoreMenuAction[] }) {
  const copy = useAgendaCopy();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={copy.t("More actions")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-black/10 bg-white text-[20px] leading-none text-[var(--tc-muted)]"
      >
        ···
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 top-full z-20 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-black/8 bg-white shadow-md"
          >
            {actions.map((a) => (
              <button
                key={a.label}
                role="menuitem"
                type="button"
                disabled={a.disabled}
                title={a.disabled ? a.disabledReason : undefined}
                onClick={() => {
                  if (a.disabled) return;
                  setOpen(false);
                  a.onClick();
                }}
                className={`flex w-full flex-col items-start px-4 py-3 text-left text-[13px] font-medium transition-colors hover:bg-[rgba(11,11,13,0.04)] disabled:cursor-not-allowed disabled:opacity-50 ${
                  a.destructive ? "text-[var(--tc-risk)]" : "text-[var(--tc-primary)]"
                }`}
              >
                <span>{a.label}</span>
                {a.hint && !a.disabled ? (
                  <span className="mt-0.5 text-[11px] font-normal text-[var(--tc-muted)]">{a.hint}</span>
                ) : null}
                {a.disabled && a.disabledReason ? (
                  <span className="mt-0.5 text-[11px] font-normal text-[var(--tc-muted)]">{a.disabledReason}</span>
                ) : null}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  children?: ReactNode;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const copy = useAgendaCopy();
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
      <div className="max-h-[90vh] w-full max-w-[420px] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-[16px] font-semibold text-[var(--tc-primary)]">{title}</h2>
        {body ? <p className="mt-2 text-[13px] text-[var(--tc-muted)]">{body}</p> : null}
        {children ? <div className="mt-3 space-y-3 text-[13px]">{children}</div> : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-full border border-black/10 px-4 py-2 text-[13px]"
          >
            {cancelLabel ?? copy.t("Cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-[44px] rounded-full px-4 py-2 text-[13px] text-white ${
              destructive ? "bg-[var(--tc-risk)]" : "bg-[var(--tc-primary)]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
