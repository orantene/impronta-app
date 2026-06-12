"use client";

/**
 * InEditorEmptyCanvas — the empty-state affordance shown on the NON-homepage
 * builder surfaces (workspace_page / talent_page / platform_lab) when the page
 * has no nodes yet.
 *
 * It is deliberately adapter-NEUTRAL: it does not write any seed content (unlike
 * the homepage `EmptyCanvasStarter`, which seeds `cms_page_sections`). It only
 * opens the Add Gallery via the shared editor context action, so the operator
 * adds the first section through the same flow every surface uses.
 */

import type { ReactNode } from "react";

import { useEditContext } from "./edit-context";

export function InEditorEmptyCanvas(): ReactNode {
  const { toggleAddMenu } = useEditContext();

  return (
    <div
      data-in-editor-empty-canvas
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        minHeight: "60vh",
        padding: "48px 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "#1A1A1A",
        }}
      >
        This page is empty
      </div>
      <div
        style={{
          fontSize: 13,
          color: "rgba(0,0,0,0.55)",
          maxWidth: 360,
        }}
      >
        Add your first section to start building this page.
      </div>
      <button
        type="button"
        onClick={() => toggleAddMenu()}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          marginTop: 4,
          padding: "9px 18px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "#111",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        + Add your first section
      </button>
    </div>
  );
}
