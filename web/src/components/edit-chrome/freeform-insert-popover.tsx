"use client";

/**
 * Inline insert popover for the freeform layers tree — reuses the governed
 * `ElementLibraryInsertPicker` (the same UI the Navigator / canvas / inspector
 * use), scoped to the target container's allowed kinds. Extracted from
 * `freeform-layers-tree.tsx` to keep that file under the max-lines budget.
 *
 * Indented to sit under its trigger row; calm surface, no harsh border, matching
 * NodeInsertMenu.
 */
import { useState } from "react";
import { X } from "lucide-react";

import {
  ElementLibraryInsertPicker,
} from "./element-library-insert-picker";
import { AIBriefInput } from "./ai-brief-input";
import { CHROME, CHROME_RADII } from "./kit";
import type { BuilderNodeKind } from "@/lib/site-admin/builder-node";

const ROOT_PADDING = 8;

export interface FreeformInsertPopoverTarget {
  key: string;
  label: string;
  allowedKinds: ReadonlyArray<BuilderNodeKind>;
}

export function FreeformInsertPopover({
  target,
  indent = ROOT_PADDING,
  onPick,
  onPickSectionEmbed,
  onGenerateSection,
  onDismiss,
}: {
  target: FreeformInsertPopoverTarget;
  indent?: number;
  onPick: (kind: BuilderNodeKind) => void;
  onPickSectionEmbed: (sectionTypeKey: string) => void;
  /**
   * When provided, shows a one-line "Generate a section with AI" affordance at
   * the top of the picker: the brief is composed into a real editable section
   * inserted at this target. Absent → the popover is the plain element picker.
   */
  onGenerateSection?: (brief: string) => Promise<{ ok: boolean; error?: string }>;
  onDismiss: () => void;
}) {
  const [aiPending, setAiPending] = useState(false);
  return (
    <div
      data-freeform-insert-menu={target.key}
      role="dialog"
      aria-label={`Add block to ${target.label}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onDismiss();
        }
      }}
      style={{
        marginLeft: indent,
        marginRight: 6,
        marginTop: 4,
        marginBottom: 6,
        padding: "8px 9px 9px",
        borderRadius: CHROME_RADII.sm,
        border: `1px solid ${CHROME.line}`,
        background: CHROME.surface,
        boxShadow: "0 8px 22px rgba(15,23,42,0.10)",
        display: "flex",
        flexDirection: "column",
        gap: 7,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: CHROME.muted2,
            }}
          >
            Add block
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: CHROME.text,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {target.label}
          </div>
        </div>
        <button
          type="button"
          aria-label="Close add block menu"
          onClick={onDismiss}
          style={{
            width: 20,
            height: 20,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            borderRadius: 6,
            background: "transparent",
            color: CHROME.muted,
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
          }}
        >
          <X size={14} strokeWidth={2.2} aria-hidden />
        </button>
      </div>
      {onGenerateSection ? (
        <AIBriefInput
          onCompose={async (brief) => {
            setAiPending(true);
            try {
              return await onGenerateSection(brief);
            } finally {
              setAiPending(false);
            }
          }}
          pending={aiPending}
          title="Generate a section"
          description="Describe a section to add here — AI builds it as editable blocks."
          ctaLabel="Generate"
          pendingLabel="Generating…"
          placeholder="e.g. a services section with three cards and a booking button"
        />
      ) : null}
      <ElementLibraryInsertPicker
        variant="navigator"
        allowedKinds={target.allowedKinds}
        onPick={(kind) => onPick(kind)}
        onPickSectionEmbed={(sectionTypeKey) => onPickSectionEmbed(sectionTypeKey)}
      />
    </div>
  );
}
