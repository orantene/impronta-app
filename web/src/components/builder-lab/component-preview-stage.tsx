"use client";

/**
 * BuilderLabComponentPreview — opens the ONE Page Builder Core as a full-screen
 * popup that PREVIEWS a single catalog component exactly as a tenant / talent
 * user sees it after picking it from the "+" Add gallery.
 *
 * The seed tree is the SAME default BuilderNode the "+" gallery inserts
 * (resolved client-side via resolveAddGalleryInsertAction — see
 * `buildCatalogItemPreview`). Persistence is the ephemeral no-op sink (a fresh
 * `createPlatformLabAdapter` whose `loadInitialComposition` returns the seed) —
 * nothing is ever written. The editor mounts in read-only `previewing` mode
 * (look-only), with a bottom-center Code Inspector that shows the component's
 * declarative BuilderNode JSON (the literal insert payload).
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { BuilderEditorMount } from "@/lib/site-admin/builder-core/mount/BuilderEditorMount";
import { buildPlatformLabBuilderConfig } from "@/lib/site-admin/builder-core/config";
import {
  createPlatformLabAdapter,
  emptyLabComposition,
} from "@/lib/site-admin/builder-core/adapters/platform-lab-adapter";
import { useEditContext } from "@/components/edit-chrome/edit-context";
import { getAddGalleryItemById } from "@/lib/site-admin/add-gallery/registry";
import { resolveAddGalleryInsertAction } from "@/lib/site-admin/add-gallery/insert";
import { createBuilderSectionEmbed } from "@/lib/site-admin/builder-node/section-embed-presets";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { LAB } from "./ui";

export type CatalogItemPreview = {
  id: string;
  label: string;
  source: "code" | "template";
  /** The default node subtree the "+" gallery inserts. Empty when unavailable. */
  tree: BuilderNode[];
  /** Pretty-printed BuilderNode JSON for the code inspector. */
  codeJson: string;
  /** False → nothing previewable (template w/o tree, coming-soon, embed-only). */
  available: boolean;
  /** Optional explanatory note (e.g. dynamic component, coming soon). */
  note?: string;
};

/**
 * Resolve a catalog row → a previewable seed tree, CLIENT-SIDE. Mirrors exactly
 * what the "+" Add gallery does on click (resolveAddGalleryInsertAction), so the
 * preview is byte-faithful to what a tenant/talent gets.
 */
export function buildCatalogItemPreview(row: {
  id: string;
  source: "code" | "template";
  label: string;
}): CatalogItemPreview {
  const base = { id: row.id, label: row.label, source: row.source };

  // DB templates aren't in the code registry — their tree lives in builder_tree
  // (a server round-trip). Out of scope for the client-side fast path; show a note.
  if (row.source === "template") {
    return {
      ...base,
      tree: [],
      codeJson: "",
      available: false,
      note: "Published-template preview is coming soon — open it from Playground for now.",
    };
  }

  const item = getAddGalleryItemById(row.id);
  if (!item) {
    return { ...base, tree: [], codeJson: "", available: false, note: "Not a previewable component." };
  }

  try {
    const action = resolveAddGalleryInsertAction(item);
    switch (action.type) {
      case "nativeNode":
      case "sectionTemplate":
      case "dbTemplate": {
        return {
          ...base,
          tree: [action.node],
          codeJson: JSON.stringify(action.node, null, 2),
          available: true,
        };
      }
      case "sectionEmbed":
      case "connectedNode": {
        const node = createBuilderSectionEmbed(action.sectionTypeKey);
        return {
          ...base,
          tree: [node],
          codeJson: JSON.stringify(node, null, 2),
          available: true,
          note: "Dynamic Tulala component — it renders against live data in a real builder, so the canvas shows its placeholder here.",
        };
      }
      case "noop":
      default:
        return {
          ...base,
          tree: [],
          codeJson: "",
          available: false,
          note: "This component isn't available to add yet (coming soon).",
        };
    }
  } catch {
    return { ...base, tree: [], codeJson: "", available: false, note: "Couldn't resolve this component's definition." };
  }
}

/** Child mounted INSIDE the editor provider — flips it into read-only preview
 *  (look-only) on mount. `previewing`/`setPreviewing` live on the edit context. */
function SeedPreviewing() {
  const { setPreviewing } = useEditContext();
  useEffect(() => {
    setPreviewing(true);
  }, [setPreviewing]);
  return null;
}

export function BuilderLabComponentPreview({
  preview,
  tenantId,
  workspacePlan,
  locale,
  onExit,
}: {
  preview: CatalogItemPreview;
  tenantId: string;
  workspacePlan?: string | null;
  locale?: string;
  onExit: () => void;
}) {
  const [showCode, setShowCode] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    stageRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Ephemeral adapter seeded with the component's default tree (no draft, no I/O).
  const adapter = useMemo(
    () =>
      createPlatformLabAdapter({
        loadInitialComposition: (ctx) => {
          const empty = emptyLabComposition(ctx);
          return {
            ...empty,
            metadata: { ...empty.metadata, title: preview.label },
            builderTree: preview.tree,
          };
        },
      }),
    [preview.tree, preview.label],
  );
  const surfaceConfig = useMemo(
    () => buildPlatformLabBuilderConfig(adapter, null),
    [adapter],
  );

  return (
    <div
      data-builder-lab-stage
      ref={stageRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Component preview: ${preview.label}`}
      tabIndex={-1}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "#E9E9EE",
        overflow: "auto",
        outline: "none",
      }}
    >
      {preview.available ? (
        <>
          <BuilderEditorMount
            surfaceConfig={surfaceConfig}
            tenantId={tenantId}
            workspacePlan={workspacePlan ?? null}
            locale={locale}
            pageSlug={null}
            headerVariant="lab"
            onExit={onExit}
            exitLabel="Close preview"
            previewSubjectChip={<PreviewChip label={preview.label} />}
          >
            <SeedPreviewing />
          </BuilderEditorMount>
          <CodeInspector
            json={preview.codeJson}
            note={preview.note}
            open={showCode}
            onToggle={() => setShowCode((v) => !v)}
          />
        </>
      ) : (
        <Unavailable label={preview.label} note={preview.note} onExit={onExit} />
      )}
    </div>
  );
}

/** A read-only chip in the topbar showing what's being previewed. */
function PreviewChip({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 12px",
        borderRadius: 999,
        border: `1px solid ${CHIP_BORDER}`,
        background: CHIP_BG,
        color: CHIP_INK,
        fontSize: 11.5,
        fontWeight: 600,
      }}
    >
      <span aria-hidden style={{ fontSize: 12 }}>👁</span>
      Previewing: {label}
    </span>
  );
}

const CHIP_BORDER = "rgba(124,58,237,0.35)";
const CHIP_BG = "rgba(124,58,237,0.08)";
const CHIP_INK = "#6D28D9";

/** Bottom-center Code Inspector — toggles a panel showing the component's
 *  declarative BuilderNode JSON (the literal "+"-gallery insert payload). */
function CodeInspector({
  json,
  note,
  open,
  onToggle,
}: {
  json: string;
  note?: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      {open ? (
        <div
          role="dialog"
          aria-label="Component code"
          style={{
            position: "fixed",
            left: "50%",
            bottom: 64,
            transform: "translateX(-50%)",
            zIndex: 95,
            width: "min(680px, 92vw)",
            maxHeight: "56vh",
            display: "flex",
            flexDirection: "column",
            background: LAB.card,
            border: `1px solid ${LAB.border}`,
            borderRadius: 14,
            boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: `1px solid ${LAB.borderSoft}`,
            }}
          >
            <span style={{ color: LAB.ink, fontWeight: 700, fontSize: 12.5 }}>
              Component definition (BuilderNode)
            </span>
            <button
              type="button"
              onClick={onToggle}
              aria-label="Close code inspector"
              style={{
                border: "none",
                background: "transparent",
                color: LAB.inkMuted,
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
          {note ? (
            <div style={{ padding: "8px 14px", fontSize: 11.5, color: LAB.amber, borderBottom: `1px solid ${LAB.borderSoft}` }}>
              {note}
            </div>
          ) : null}
          <pre
            style={{
              margin: 0,
              padding: "12px 14px",
              overflow: "auto",
              fontSize: 11.5,
              lineHeight: 1.5,
              color: LAB.inkMuted,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              whiteSpace: "pre",
            }}
          >
            {json}
          </pre>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={open}
        aria-label="Toggle code inspector"
        style={{
          position: "fixed",
          left: "50%",
          bottom: 18,
          transform: "translateX(-50%)",
          zIndex: 95,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 16px",
          borderRadius: 999,
          border: `1px solid ${open ? LAB.accent : "rgba(255,255,255,0.14)"}`,
          background: open ? LAB.accent : "#16161A",
          color: open ? LAB.accentInk : LAB.ink,
          fontSize: 12.5,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }}
      >
        <span aria-hidden style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
          {"</>"}
        </span>
        {open ? "Hide code" : "View code"}
      </button>
    </>
  );
}

/** Shown when there's nothing to render (template, coming-soon, embed-only). */
function Unavailable({
  label,
  note,
  onExit,
}: {
  label: string;
  note?: string;
  onExit: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: 24,
        textAlign: "center",
        color: "#1a1a1f",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 13, color: "#52525b", maxWidth: 420, lineHeight: 1.5 }}>
        {note ?? "This component can't be previewed here."}
      </div>
      <button
        type="button"
        onClick={onExit}
        style={{
          marginTop: 4,
          padding: "9px 18px",
          borderRadius: 10,
          border: "1px solid #d4d4d8",
          background: "#fff",
          color: "#18181b",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Close
      </button>
    </div>
  );
}
