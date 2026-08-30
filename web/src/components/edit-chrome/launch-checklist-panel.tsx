"use client";

/**
 * Guided first-edit launch checklist (ONB-2).
 *
 * Shown after a starter is applied (or when the tree already has a section).
 * Completion is derived from real editor actions, not from the starter's
 * section count: every seeded page already has more than one section, so
 * counting nodes would mark "Add a section" done on first paint.
 *
 * Suppressed on `platform_lab`.
 */

import { useCallback, useEffect, useState } from "react";

import { useEditContext } from "./edit-context";
import { useBuilderTree } from "./builder-tree-bridge";
import { useSelectedSectionId } from "./selection-bridge";
import { CHROME_SHADOWS } from "./kit";
import { useEditorLocale } from "./use-editor-locale";
import {
  loadChecklistState,
  saveChecklistState,
  deriveContentDone,
  derivePublishDone,
  LAUNCH_CHECKLIST_STEPS,
} from "./launch-checklist";

export function MakeItYoursChecklist() {
  const {
    openTheme,
    openPublish,
    toggleAddMenu,
    themeOpen,
    addMenuOpen,
    surfaceKind,
    liveSitePublishedAt,
  } = useEditContext();
  const { t } = useEditorLocale();
  const selectedSectionId = useSelectedSectionId();
  const builderTree = useBuilderTree();

  const [pageKey] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const url = window.location.href;
      const segments = url.replace(/[?#].*$/, "").split("/").filter(Boolean);
      const last = segments[segments.length - 1] ?? "";
      return last.length > 3 ? `page:${last}` : `session:${Date.now()}`;
    }
    return `session:${Date.now()}`;
  });

  const isLabSurface = surfaceKind === "platform_lab";

  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(() => loadChecklistState(pageKey).done);
  const [dismissed, setDismissed] = useState(
    () => loadChecklistState(pageKey).dismissed,
  );

  useEffect(() => {
    if (isLabSurface || dismissed || visible) return;
    if (deriveContentDone(builderTree)) {
      setVisible(true);
    }
  }, [builderTree, visible, dismissed, isLabSurface]);

  useEffect(() => {
    if (isLabSurface) return;
    function onApplied() {
      if (dismissed) return;
      setVisible(true);
    }
    window.addEventListener("impronta:starter-applied", onApplied);
    return () =>
      window.removeEventListener("impronta:starter-applied", onApplied);
  }, [dismissed, isLabSurface]);

  useEffect(() => {
    if (selectedSectionId) {
      setDone((prev) => {
        if (prev.content) return prev;
        const next = { ...prev, content: true };
        saveChecklistState(pageKey, { dismissed, done: next });
        return next;
      });
    }
  }, [selectedSectionId, dismissed, pageKey]);

  useEffect(() => {
    if (themeOpen) {
      setDone((prev) => {
        if (prev.theme) return prev;
        const next = { ...prev, theme: true };
        saveChecklistState(pageKey, { dismissed, done: next });
        return next;
      });
    }
  }, [themeOpen, dismissed, pageKey]);

  // Opening the add panel is the only honest signal. Starters already have
  // many sections, so a node-count would complete this step on first paint.
  useEffect(() => {
    if (addMenuOpen) {
      setDone((prev) => {
        if (prev.addSection) return prev;
        const next = { ...prev, addSection: true };
        saveChecklistState(pageKey, { dismissed, done: next });
        return next;
      });
    }
  }, [addMenuOpen, dismissed, pageKey]);

  useEffect(() => {
    if (derivePublishDone(liveSitePublishedAt)) {
      setDone((prev) => {
        if (prev.publish) return prev;
        const next = { ...prev, publish: true };
        saveChecklistState(pageKey, { dismissed, done: next });
        return next;
      });
    }
  }, [liveSitePublishedAt, dismissed, pageKey]);

  const dismiss = useCallback(() => {
    setVisible(false);
    setDismissed(true);
    saveChecklistState(pageKey, { dismissed: true, done });
  }, [pageKey, done]);

  const focusFirstSection = useCallback(() => {
    if (typeof document === "undefined") return;
    const first = document.querySelector<HTMLElement>("[data-cms-section]");
    if (first) {
      first.scrollIntoView({ behavior: "smooth", block: "center" });
      first.click();
    }
    setDone((prev) => {
      if (prev.content) return prev;
      const next = { ...prev, content: true };
      saveChecklistState(pageKey, { dismissed, done: next });
      return next;
    });
  }, [pageKey, dismissed]);

  const actionMap: Record<string, () => void> = {
    content: focusFirstSection,
    theme: openTheme,
    addSection: toggleAddMenu,
    publish: openPublish,
  };

  const steps = LAUNCH_CHECKLIST_STEPS.map((step) => ({
    ...step,
    label: t(step.label),
    hint: t(step.hint),
    cta: t(step.cta),
    action: actionMap[step.key] ?? (() => undefined),
  }));

  const doneCount = steps.filter((step) => done[step.key]).length;
  const allDone = doneCount === steps.length;

  useEffect(() => {
    if (!allDone || !visible) return;
    const timer = setTimeout(() => {
      dismiss();
    }, 3000);
    return () => clearTimeout(timer);
  }, [allDone, visible, dismiss]);

  if (!visible || dismissed || isLabSurface) return null;

  return (
    <div
      data-edit-overlay="launch-checklist"
      className="pointer-events-auto fixed bottom-5 right-5 z-[89] w-[300px] overflow-hidden rounded-xl"
      style={{
        background: "rgba(255, 255, 255, 0.98)",
        border: "1px solid rgba(24, 24, 27, 0.10)",
        boxShadow: CHROME_SHADOWS.popover,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        fontSize: 12,
        color: "#27272a",
      }}
    >
      <div
        className="flex items-start justify-between gap-2 px-3.5 pt-3"
        style={{ paddingBottom: 6 }}
      >
        <div>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            {allDone ? t("You're ready to publish.") : t("Launch checklist")}
          </div>
          <div
            style={{
              marginTop: 2,
              fontSize: 11,
              color: "rgba(39, 39, 42, 0.6)",
            }}
          >
            {allDone
              ? t("All steps done. Your page is ready.")
              : t("{done} of {total} steps done")
                  .replace("{done}", String(doneCount))
                  .replace("{total}", String(steps.length))}
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("Dismiss launch checklist")}
          className="inline-flex size-[20px] shrink-0 items-center justify-center rounded-full transition hover:bg-black/5"
          style={{
            color: "rgba(39, 39, 42, 0.45)",
            border: "none",
            background: "transparent",
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: "2px 8px 10px" }}>
        {steps.map((step) => {
          const isDone = done[step.key];
          return (
            <li
              key={step.key}
              className="rounded-lg px-2.5 py-2 transition hover:bg-black/[0.03]"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-flex size-[16px] shrink-0 items-center justify-center rounded-full"
                  style={{
                    border: isDone
                      ? "1px solid rgba(22, 163, 74, 0.9)"
                      : "1px solid rgba(24, 24, 27, 0.25)",
                    background: isDone
                      ? "rgba(22, 163, 74, 0.9)"
                      : "transparent",
                  }}
                >
                  {isDone ? (
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : null}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: isDone ? "rgba(39, 39, 42, 0.5)" : "#27272a",
                    textDecoration: isDone ? "line-through" : "none",
                  }}
                >
                  {step.label}
                </span>
                {!isDone ? (
                  <button
                    type="button"
                    onClick={step.action}
                    className="ml-auto rounded-md px-2 py-0.5 text-[11px] font-semibold transition"
                    style={{
                      color: "#fff",
                      background: "#2a3147",
                      border: "none",
                    }}
                  >
                    {step.cta}
                  </button>
                ) : null}
              </div>
              {!isDone ? (
                <p
                  style={{
                    margin: "3px 0 0 24px",
                    fontSize: 11,
                    lineHeight: 1.4,
                    color: "rgba(39, 39, 42, 0.6)",
                  }}
                >
                  {step.hint}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
