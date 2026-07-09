"use client";

/**
 * AiReviseModal — the centered "revise / extend THIS block with AI" popup.
 *
 * The third AI entry point (after the empty-canvas "Design with AI" band and
 * the "+ Add block → Generate with AI" field): the user selects any block in the
 * builder, opens this modal from the block toolbar, describes a change in plain
 * language, and the model rewrites the block's EXISTING content (keeping what it
 * isn't asked to touch). Nothing is inserted automatically — the revised block
 * is previewed here at desktop + mobile (via the shared DevicePreviewFrame the
 * Add Gallery uses), and the user stays in control: Replace the original, Insert
 * below it, or keep refining before committing.
 *
 * All model work runs through `reviseBuilderNodeAction` (Opus, effort:xhigh);
 * the parent supplies the undoable Replace / Insert-below mutations.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { reviseBuilderNodeAction } from "@/lib/site-admin/builder-core/ai/revise-nodes-action";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { MediaProgressBar } from "@/components/media/media-progress-bar";

import { CHROME, Segmented, PortaledOverlay, Z_INDEX } from "../kit";
import { useModalFocusTrap } from "../modal-focus-trap";
import { acquireBehindDrawerInert } from "../kit/drawer-modal-inert";
import {
  DevicePreviewFrame,
  DesktopGlyph,
  MobileGlyph,
  type PreviewDevice,
} from "../preview/device-preview-frame";

type Phase = "compose" | "thinking" | "preview";

/** A few one-tap starting points so the empty state isn't a blank box. */
const SUGGESTIONS = [
  "Make the copy shorter and punchier",
  "Add a clear call-to-action button",
  "Warmer, more editorial tone",
  "Turn this into a 3-column feature grid",
];

function SparkleGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8L12 3Z" />
      <path d="M19 14l.7 1.9 1.9.7-1.9.7L19 19.2l-.7-1.9-1.9-.7 1.9-.7L19 14Z" />
    </svg>
  );
}

function readBackgroundMode(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.documentElement.getAttribute("data-token-background-mode") ?? undefined;
}

export function AiReviseModal({
  node,
  locale,
  onClose,
  onReplace,
  onInsertBelow,
}: {
  /** The selected subtree to revise. */
  node: BuilderNode;
  locale?: string;
  onClose: () => void;
  /** Undoable replace-in-place of the original node with the candidate. */
  onReplace: (candidate: BuilderNode) => Promise<{ ok: boolean; error?: string }>;
  /** Undoable insert of the candidate as a sibling directly after the original. */
  onInsertBelow: (candidate: BuilderNode) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [phase, setPhase] = useState<Phase>("compose");
  const [instruction, setInstruction] = useState("");
  const [candidate, setCandidate] = useState<BuilderNode | null>(null);
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [committing, setCommitting] = useState(false);

  const modalRef = useModalFocusTrap<HTMLDivElement>(true, onClose);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mark the editor chrome behind the modal inert (pointer + focus) while open.
  useEffect(() => acquireBehindDrawerInert(), []);

  const stopProgress = useCallback(() => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  }, []);

  useEffect(() => stopProgress, [stopProgress]);

  // The block the model reads: the current candidate once one exists (so "make
  // another change" compounds), else the original selection.
  const baseNode = candidate ?? node;
  const trimmed = instruction.trim();
  const canSubmit = trimmed.length >= 2 && phase !== "thinking" && !committing;

  const runRevise = useCallback(async () => {
    if (trimmed.length < 2) return;
    setError(null);
    setPhase("thinking");
    setProgress(6);
    stopProgress();
    // Eased fake progress: climb toward ~92% while the model thinks, so the bar
    // always moves even though the provider gives no token-level progress.
    progressTimer.current = setInterval(() => {
      setProgress((p) => (p >= 92 ? 92 : p + Math.max(1, (92 - p) * 0.07)));
    }, 220);

    const res = await reviseBuilderNodeAction({
      nodeJson: JSON.stringify(baseNode),
      instruction: trimmed,
      locale,
      backgroundMode: readBackgroundMode(),
    });

    stopProgress();
    if (!res.ok) {
      setProgress(0);
      setPhase(candidate ? "preview" : "compose");
      setError(res.error);
      return;
    }
    setProgress(100);
    setCandidate(res.node);
    setInstruction("");
    // Small beat so the bar visibly completes before the preview swaps in.
    setTimeout(() => setPhase("preview"), 240);
  }, [trimmed, baseNode, locale, candidate, stopProgress]);

  const commit = useCallback(
    async (kind: "replace" | "insert") => {
      if (!candidate || committing) return;
      setCommitting(true);
      setError(null);
      const res = kind === "replace" ? await onReplace(candidate) : await onInsertBelow(candidate);
      setCommitting(false);
      if (!res.ok) {
        setError(res.error ?? "Could not apply the change. Try again.");
        return;
      }
      onClose();
    },
    [candidate, committing, onReplace, onInsertBelow, onClose],
  );

  const kindLabel = (node as { kind?: string }).kind ?? "block";

  return (
    <PortaledOverlay>
      <div
        className="fixed inset-0 flex items-center justify-center p-[24px]"
        style={{ zIndex: Z_INDEX.modalOverlay, background: "rgba(15, 23, 42, 0.5)", backdropFilter: "blur(3px)" }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !committing) onClose();
        }}
      >
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label="Revise this block with AI"
          className="flex max-h-[90vh] w-[min(940px,95vw)] flex-col overflow-hidden rounded-[18px] border"
          style={{
            background: CHROME.surface,
            borderColor: CHROME.line,
            boxShadow: "0 40px 96px -36px rgba(15, 23, 42, 0.55)",
          }}
        >
          {/* Header */}
          <div
            className="flex shrink-0 items-center gap-[12px] border-b px-[20px] py-[14px]"
            style={{ borderColor: CHROME.line }}
          >
            <span
              className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full"
              style={{ background: "rgba(124, 58, 237, 0.1)", color: "#7c3aed" }}
            >
              <SparkleGlyph />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold" style={{ color: CHROME.ink }}>
                Revise with AI
              </div>
              <div className="truncate text-[11px]" style={{ color: CHROME.muted }}>
                Editing your selected {kindLabel} block. Nothing changes until you apply it.
              </div>
            </div>
            {phase === "preview" ? (
              <Segmented
                value={device}
                onChange={setDevice}
                compact
                options={[
                  { value: "desktop", label: "Desktop", icon: <DesktopGlyph /> },
                  { value: "mobile", label: "Mobile", icon: <MobileGlyph /> },
                ]}
              />
            ) : null}
            <button
              type="button"
              onClick={() => !committing && onClose()}
              aria-label="Close"
              className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] border-none bg-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40"
              style={{ color: CHROME.muted }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(24, 24, 27, 0.06)";
                e.currentTarget.style.color = CHROME.ink2;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = CHROME.muted;
              }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {/* Body (scrolls) */}
          <div className="min-h-0 flex-1 overflow-auto p-[20px]" style={{ background: CHROME.paper }}>
            {/* Prompt field — persistent so the user can keep refining. */}
            <label className="block text-[12px] font-medium" style={{ color: CHROME.ink2 }}>
              {candidate ? "Make another change" : "What would you like to change or add?"}
            </label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSubmit) {
                  e.preventDefault();
                  void runRevise();
                }
              }}
              rows={3}
              disabled={phase === "thinking" || committing}
              placeholder="e.g. Rewrite the headline to be bolder, add a short subheading, and include a Book talent button."
              className="mt-[6px] w-full resize-y rounded-[10px] border px-[12px] py-[10px] text-[13px] leading-relaxed outline-none transition-colors focus:border-[#7c3aed]"
              style={{ borderColor: CHROME.lineStrong, background: CHROME.surface, color: CHROME.ink }}
            />

            {/* Suggestion chips (compose only) */}
            {phase !== "thinking" ? (
              <div className="mt-[10px] flex flex-wrap gap-[6px]">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={committing}
                    onClick={() => setInstruction(s)}
                    className="rounded-full border px-[10px] py-[4px] text-[11px] transition-colors"
                    style={{ borderColor: CHROME.lineStrong, color: CHROME.ink2, background: CHROME.surface }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#7c3aed";
                      e.currentTarget.style.color = "#7c3aed";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = CHROME.lineStrong;
                      e.currentTarget.style.color = CHROME.ink2;
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-[12px] flex items-center gap-[10px]">
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => void runRevise()}
                className="inline-flex items-center gap-[7px] rounded-[10px] px-[16px] py-[9px] text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
                style={{ background: "#7c3aed" }}
              >
                <SparkleGlyph size={14} />
                {candidate ? "Revise again" : "Revise with AI"}
              </button>
              {candidate ? (
                <button
                  type="button"
                  disabled={committing || phase === "thinking"}
                  onClick={() => {
                    setCandidate(null);
                    setError(null);
                    setPhase("compose");
                  }}
                  className="text-[12px] underline-offset-2 hover:underline"
                  style={{ color: CHROME.muted }}
                >
                  Start from the original
                </button>
              ) : (
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Cmd/Ctrl + Enter
                </span>
              )}
            </div>

            {error ? (
              <div
                className="mt-[12px] rounded-[8px] border px-[12px] py-[8px] text-[12px]"
                style={{ borderColor: "rgba(220, 38, 38, 0.3)", background: "rgba(220, 38, 38, 0.06)", color: "#b91c1c" }}
                role="alert"
              >
                {error}
              </div>
            ) : null}

            {/* Thinking */}
            {phase === "thinking" ? (
              <div className="mt-[22px]">
                <div className="mb-[8px] flex items-center justify-between text-[12px]" style={{ color: CHROME.ink2 }}>
                  <span className="inline-flex items-center gap-[7px]">
                    <span className="inline-block h-[7px] w-[7px] animate-pulse rounded-full" style={{ background: "#7c3aed" }} />
                    Claude is revising your block…
                  </span>
                  <span style={{ color: CHROME.muted }}>{Math.round(progress)}%</span>
                </div>
                <MediaProgressBar value={progress} />
                <p className="mt-[10px] text-[11px]" style={{ color: CHROME.muted }}>
                  Reading the existing content and applying your change while keeping the rest intact.
                </p>
              </div>
            ) : null}

            {/* Preview */}
            {phase === "preview" && candidate ? (
              <div className="mt-[18px]">
                <div className="mb-[10px] flex items-center gap-[8px]">
                  <span className="text-[12px] font-semibold" style={{ color: CHROME.ink }}>
                    Revised block preview
                  </span>
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    {device === "desktop" ? "Desktop 1280px" : "Mobile 390px"}
                  </span>
                </div>
                <DevicePreviewFrame node={candidate} device={device} inheritThemeFromParent />
              </div>
            ) : null}
          </div>

          {/* Footer (preview only) — the commit controls */}
          {phase === "preview" && candidate ? (
            <div
              className="flex shrink-0 items-center justify-between gap-[10px] border-t px-[20px] py-[13px]"
              style={{ borderColor: CHROME.line, background: CHROME.surface }}
            >
              <span className="text-[11px]" style={{ color: CHROME.muted }}>
                Keep tweaking above, or add it to the page.
              </span>
              <div className="flex items-center gap-[8px]">
                <button
                  type="button"
                  disabled={committing}
                  onClick={() => void commit("insert")}
                  className="rounded-[9px] border px-[14px] py-[8px] text-[12px] font-medium transition-colors disabled:opacity-50"
                  style={{ borderColor: CHROME.lineStrong, color: CHROME.ink, background: CHROME.surface }}
                >
                  {committing ? "Working…" : "Insert below original"}
                </button>
                <button
                  type="button"
                  disabled={committing}
                  onClick={() => void commit("replace")}
                  className="rounded-[9px] px-[14px] py-[8px] text-[12px] font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{ background: CHROME.ink }}
                >
                  {committing ? "Working…" : "Replace original"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </PortaledOverlay>
  );
}
