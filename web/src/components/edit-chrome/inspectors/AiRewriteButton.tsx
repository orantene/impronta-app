"use client";

/**
 * Phase 14-lite — AI rewrite affordance.
 *
 * A small "AI rewrite" button placed next to a section's text fields in
 * the inspector. Click to open a popover with an instruction input
 * ("make it more playful", "tighten to 80 chars", "translate to es").
 * Submit calls the server action which round-trips through the
 * tenant's configured AI provider.
 *
 * The proposed text is shown in a preview card with Apply / Discard
 * buttons. We never auto-apply — the operator owns the call.
 */

import { useCallback, useState, useTransition, type ReactElement } from "react";

import {
  rewriteFieldWithAi,
  type AiRewriteResult,
} from "@/lib/site-admin/edit-mode/ai-rewrite-action";
import { PortaledOverlay, useAnchoredPopover } from "../kit";
import { useModalFocusTrap } from "../modal-focus-trap";

interface AiRewriteButtonProps {
  sectionTypeKey: string;
  fieldName: string;
  /** Current value of the field (we send this to the AI). */
  currentValue: string;
  /** Called when the operator clicks Apply on a proposed rewrite. */
  onApply: (next: string) => void;
  /** Other field values from the same section (context for the prompt). */
  siblingContext?: Record<string, string>;
}

const PRESETS: ReadonlyArray<{ label: string; instruction: string }> = [
  { label: "Polish", instruction: "Polish lightly, keep meaning, tighten phrasing." },
  { label: "Shorter", instruction: "Cut to roughly half the length, keep the most concrete details." },
  { label: "Punchier", instruction: "Make it sharper and more confident. Drop hedging." },
  { label: "Friendlier", instruction: "Warmer, more conversational, less corporate." },
];

export function AiRewriteButton({
  sectionTypeKey,
  fieldName,
  currentValue,
  onApply,
  siblingContext,
}: AiRewriteButtonProps): ReactElement | null {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [proposed, setProposed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { triggerRef, popoverRef, position } = useAnchoredPopover<
    HTMLButtonElement,
    HTMLDivElement
  >({ open, onClose: () => setOpen(false), width: 300, align: "right" });

  // FIX #7 (a11y) — this popover declares `role="dialog"` but shipped with
  // neither a focus trap nor Escape handling, so keyboard users tabbed straight
  // out of it into the inspector behind and had no way to dismiss it without a
  // mouse. Reuse the repo's working trap (the same one kit/drawer.tsx wires).
  const trapRef = useModalFocusTrap<HTMLDivElement>(open, () => setOpen(false));
  // Merge the trap container ref with the anchored-popover ref so ONE DOM node
  // feeds both systems (positioning + trapping), mirroring drawer.tsx.
  const setPopoverNode = useCallback(
    (node: HTMLDivElement | null) => {
      popoverRef.current = node;
      trapRef.current = node;
    },
    [popoverRef, trapRef],
  );

  function trigger(text: string) {
    setInstruction(text);
    setError(null);
    setProposed(null);
    startTransition(async () => {
      const result: AiRewriteResult = await rewriteFieldWithAi({
        sectionTypeKey,
        fieldName,
        currentValue,
        instruction: text,
        siblingContext,
      });
      if (result.ok) {
        setProposed(result.text);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Rewrite with AI"
        aria-label={`Rewrite ${fieldName} with AI`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500 hover:bg-white hover:border-stone-300 transition-colors"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" />
          <path d="M19 14l.7 1.6L21 16l-1.3.4L19 18l-.7-1.6L17 16l1.3-.4z" />
        </svg>
        AI
      </button>
      {open ? (
        <PortaledOverlay>
        <div
          ref={setPopoverNode}
          role="dialog"
          aria-label={`Rewrite ${fieldName}`}
          data-edit-overlay="ai-rewrite-popover"
          className="w-[300px] rounded-lg border border-[#e5e0d5] bg-[#faf9f6] p-3 text-xs shadow-xl"
          style={{
            position: "fixed",
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            zIndex: 200,
            opacity: position ? 1 : 0,
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
            Rewrite {fieldName}
          </div>
          <div className="mb-2 flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                disabled={pending}
                onClick={() => trigger(p.instruction)}
                className="rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-2 py-0.5 text-[10px] text-stone-600 hover:bg-white hover:border-stone-300 disabled:opacity-50 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
          <textarea
            className="mb-2 w-full rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-3 py-2 text-[12px] text-stone-800 placeholder:text-stone-500 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/15 transition-colors"
            rows={2}
            placeholder='Or your own instruction (e.g. "translate to Spanish")'
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={pending}
          />
          <div className="mb-2 flex justify-end gap-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-1 text-[10px] text-stone-500 hover:bg-[#faf9f6]"
            >
              Close
            </button>
            <button
              type="button"
              disabled={pending || !instruction.trim()}
              onClick={() => trigger(instruction)}
              className="rounded-md border border-violet-600 bg-violet-600 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Thinking…" : "Rewrite"}
            </button>
          </div>
          {error ? (
            <div className="rounded-md border border-blue-500/40 bg-blue-500/10 p-2 text-[11px] text-blue-700 dark:text-blue-300">
              {error}
            </div>
          ) : null}
          {proposed ? (
            <div className="mt-1 flex flex-col gap-1.5">
              <div className="rounded-lg border border-[#e5e0d5] bg-[#faf9f6]/40 p-2 text-[12px] leading-snug text-stone-800">
                {proposed}
              </div>
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setProposed(null);
                  }}
                  className="rounded-md px-2 py-1 text-[10px] text-stone-500 hover:bg-[#faf9f6]"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApply(proposed);
                    setProposed(null);
                    setOpen(false);
                  }}
                  className="rounded-md border border-emerald-700 bg-emerald-700 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-800"
                >
                  Apply
                </button>
              </div>
            </div>
          ) : null}
        </div>
        </PortaledOverlay>
      ) : null}
    </div>
  );
}
