"use client";

/**
 * WS4-TASK2: SectionAiRewritePanel — AI rewrite affordance for the Content tab.
 *
 * Renders a collapsible "AI Rewrite" group at the foot of the Content tab
 * (alongside AiTranslateSectionButton). For each AI-rewritable text field on
 * the current section, it shows the field's current value truncated and an
 * AiRewriteButton that the operator can click to get a rewrite suggestion.
 *
 * When the operator clicks Apply on a suggestion, the `onPatch` callback is
 * called with `{ [fieldName]: newText }` and the parent (inspector-dock) merges
 * it into `draftProps` and marks the section dirty.
 *
 * The panel is only rendered when the section type has at least one rewritable
 * field (checked via the client-safe `getAiRewritableFields` utility).
 *
 * Wired into inspector-dock.tsx in the `tab === "content"` branch.
 */

import { useState } from "react";
import type { ReactElement } from "react";

import { CHROME } from "../kit";
import { AiRewriteButton } from "./AiRewriteButton";
import { getAiRewritableFields } from "@/lib/site-admin/edit-mode/ai-rewrite-fields";

interface SectionAiRewritePanelProps {
  sectionTypeKey: string;
  draftProps: Record<string, unknown>;
  /** Called with the patched field(s) when the operator applies a rewrite. */
  onPatch: (patch: Record<string, string>) => void;
}

/** Capitalise the first letter and replace underscores with spaces. */
function humanizeFieldName(field: string): string {
  return field
    .replace(/_/g, " ")
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

export function SectionAiRewritePanel({
  sectionTypeKey,
  draftProps,
  onPatch,
}: SectionAiRewritePanelProps): ReactElement | null {
  const rewritableFields = getAiRewritableFields(sectionTypeKey);

  // Filter to fields that actually have a non-empty string value in draftProps.
  const presentFields = rewritableFields.filter(
    (f) => typeof draftProps[f] === "string" && (draftProps[f] as string).trim().length > 0,
  );

  // No rewritable content — don't render the panel at all.
  if (presentFields.length === 0) return null;

  // Build sibling context for the AI: all rewritable fields (trimmed).
  const siblingContext: Record<string, string> = {};
  for (const f of rewritableFields) {
    if (typeof draftProps[f] === "string" && (draftProps[f] as string).trim()) {
      siblingContext[f] = (draftProps[f] as string).trim();
    }
  }

  return (
    <AiRewritePanelInner
      sectionTypeKey={sectionTypeKey}
      presentFields={presentFields}
      draftProps={draftProps}
      siblingContext={siblingContext}
      onPatch={onPatch}
    />
  );
}

function AiRewritePanelInner({
  sectionTypeKey,
  presentFields,
  draftProps,
  siblingContext,
  onPatch,
}: {
  sectionTypeKey: string;
  presentFields: string[];
  draftProps: Record<string, unknown>;
  siblingContext: Record<string, string>;
  onPatch: (patch: Record<string, string>) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        borderTop: `1px solid ${CHROME.line}`,
        marginTop: 16,
        paddingTop: 12,
      }}
    >
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
        aria-expanded={open}
        aria-controls="ai-rewrite-panel-body"
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: CHROME.muted,
            textTransform: "uppercase",
          }}
        >
          {/* spark icon */}
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" />
            <path d="M19 14l.7 1.6L21 16l-1.3.4L19 18l-.7-1.6L17 16l1.3-.4z" />
          </svg>
          AI Rewrite
        </span>
        {/* chevron */}
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 150ms ease",
            color: CHROME.muted,
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open ? (
        <div
          id="ai-rewrite-panel-body"
          style={{
            marginTop: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {presentFields.map((field) => {
            const currentValue = (draftProps[field] as string) ?? "";
            // Truncate preview text for the label row.
            const preview =
              currentValue.length > 60
                ? currentValue.slice(0, 57) + "…"
                : currentValue;

            return (
              <div
                key={field}
                style={{
                  background: CHROME.surface2,
                  border: `1px solid ${CHROME.line}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
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
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      color: CHROME.muted,
                      textTransform: "uppercase",
                    }}
                  >
                    {humanizeFieldName(field)}
                  </span>
                  <AiRewriteButton
                    sectionTypeKey={sectionTypeKey}
                    fieldName={field}
                    currentValue={currentValue}
                    siblingContext={siblingContext}
                    onApply={(next) => onPatch({ [field]: next })}
                  />
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: CHROME.text2,
                    lineHeight: 1.45,
                    wordBreak: "break-word",
                  }}
                  title={currentValue}
                >
                  {preview}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
