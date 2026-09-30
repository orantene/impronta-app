"use client";

/**
 * InspectorAccordion — collapsible titled block for inspector groups.
 * Carved out of `inspector-ui.tsx` for the Round 3 max-lines gate.
 */

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { CHROME } from "../../kit/tokens";
import {
  useInspectorSearchFilter,
  useInspectorSearchQuery,
} from "./inspector-search";
import { InspectorInfoTip } from "./inspector-info-tip";
import { useInspectorT } from "./use-inspector-t";

// Keep in sync with inspector-ui.tsx typography tokens (avoid circular import).
const SECTION_TITLE =
  "text-[13px] font-semibold tracking-[-0.015em] text-stone-900";
const HELP_TEXT = "text-[12px] leading-snug text-stone-500";
const SECTION_GAP = 10;

export function InspectorAccordion({
  title,
  description,
  descriptionPlacement = "tip",
  defaultOpen = true,
  onToggle,
  searchTerms,
  children,
}: {
  title: string;
  description?: string;
  /** "tip" (default) hangs the description off an ⓘ beside the title. */
  descriptionPlacement?: "tip" | "inline";
  defaultOpen?: boolean;
  /**
   * Reports every user toggle with the NEW open state. The accordion stays
   * uncontrolled; this exists so a wrapper (InspectorGroup) can persist the
   * choice.
   */
  onToggle?: (open: boolean) => void;
  /**
   * D5 — extra keywords "Find a setting" matches beyond the visible title.
   */
  searchTerms?: ReadonlyArray<string>;
  children: ReactNode;
}) {
  const { t, to } = useInspectorT();
  const localizedTitle = t(title);
  const localizedDescription = to(description);
  const hidden = useInspectorSearchFilter([
    localizedTitle,
    localizedDescription ?? "",
    ...(searchTerms ?? []).flatMap((term) => [term, t(term)]),
  ]);
  const [open, setOpen] = useState(defaultOpen);
  const searchQuery = useInspectorSearchQuery();
  const shown = open || searchQuery.trim().length > 0;
  const panelId = useId();
  if (hidden) return null;

  return (
    <div
      className="overflow-hidden rounded-[12px]"
      data-inspector-accordion=""
      data-open={shown ? "true" : "false"}
      style={{
        border: `1px solid ${shown ? "rgba(124,58,237,0.22)" : CHROME.lineStrong}`,
        background: CHROME.surface,
        boxShadow: shown
          ? "0 1px 4px rgba(124,58,237,0.08)"
          : "0 1px 2px rgba(17,24,39,0.04)",
        transition: "border-color 160ms ease, box-shadow 160ms ease",
      }}
    >
      <div
        className="flex w-full items-center pr-3 transition-colors duration-150"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(124,58,237,0.04)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        <button
          type="button"
          aria-expanded={shown}
          aria-controls={panelId}
          onClick={() => {
            const next = !open;
            setOpen(next);
            onToggle?.(next);
          }}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-none bg-transparent px-3.5 py-3 text-left"
          style={{ color: CHROME.ink }}
        >
          {shown ? (
            <ChevronDown
              size={15}
              strokeWidth={2.25}
              aria-hidden
              style={{ color: CHROME.accent }}
            />
          ) : (
            <ChevronRight
              size={15}
              strokeWidth={2.25}
              aria-hidden
              style={{ color: CHROME.muted }}
            />
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={SECTION_TITLE}>{localizedTitle}</span>
            {localizedDescription &&
            descriptionPlacement === "inline" &&
            !shown ? (
              <span className={`truncate ${HELP_TEXT}`}>
                {localizedDescription}
              </span>
            ) : null}
          </span>
        </button>
        {description && descriptionPlacement === "tip" ? (
          <InspectorInfoTip content={description} title={title} />
        ) : null}
      </div>
      {shown ? (
        <div
          id={panelId}
          className="flex flex-col border-t px-3.5 pb-3.5 pt-2.5"
          style={{
            borderColor: "rgba(124,58,237,0.12)",
            gap: SECTION_GAP,
            background: "rgba(124,58,237,0.015)",
          }}
        >
          {localizedDescription && descriptionPlacement === "inline" ? (
            <p className={HELP_TEXT}>{localizedDescription}</p>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
