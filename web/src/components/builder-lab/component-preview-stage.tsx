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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getTemplateById } from "@/lib/site-admin/builder-core/templates/registry-admin-actions";
import { BuilderEditorMount } from "@/lib/site-admin/builder-core/mount/BuilderEditorMount";
import { buildPlatformLabBuilderConfig } from "@/lib/site-admin/builder-core/config";
import {
  createPlatformLabAdapter,
  emptyLabComposition,
} from "@/lib/site-admin/builder-core/adapters/platform-lab-adapter";
import type { InEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import { useEditContext } from "@/components/edit-chrome/edit-context";
import { getAddGalleryItemById } from "@/lib/site-admin/add-gallery/registry";
import { resolveAddGalleryInsertAction } from "@/lib/site-admin/add-gallery/insert";
import { createBuilderSectionEmbed } from "@/lib/site-admin/builder-node/section-embed-presets";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { CHROME } from "@/components/edit-chrome/kit/tokens";

import { LAB } from "./ui";
import {
  PREVIEW_SURFACE_DESCRIPTORS,
  previewSubjectKindForSurface,
  type PreviewSurfaceTarget,
} from "./preview-surface-target";
import { type PreviewSubject } from "./preview-subject-picker";
import { SurfaceSubjectPicker } from "./surface-subject-picker";

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
  /** Catalog metadata surfaced in the Settings panel (read-only here). */
  category?: string;
  talentVisible?: boolean;
  workspaceVisible?: boolean;
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
  category?: string;
  talentVisible?: boolean;
  workspaceVisible?: boolean;
}): CatalogItemPreview {
  const base = {
    id: row.id,
    label: row.label,
    source: row.source,
    category: row.category,
    talentVisible: row.talentVisible,
    workspaceVisible: row.workspaceVisible,
  };

  // DB templates aren't in the code registry — their tree lives in builder_tree
  // (a server round-trip). The async `buildTemplateItemPreview` path resolves
  // them via `getTemplateById`; this synchronous fast-path only covers code rows,
  // so a template row reaching here is a programming error — surface a note.
  if (row.source === "template") {
    return {
      ...base,
      tree: [],
      codeJson: "",
      available: false,
      note: "Resolving template preview…",
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
          note: "Dynamic Tulala component, it renders against live data in a real builder, so the canvas shows its placeholder here.",
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

/**
 * Resolve a persisted-template catalog row → a previewable seed tree by loading
 * its authored `builder_tree` via the super_admin-gated `getTemplateById`. The
 * result feeds the SAME ephemeral platform-lab adapter the code-component path
 * uses — no second render fork. Returns an `available:false` preview (with a
 * reason) when the row can't be loaded.
 */
export async function buildTemplateItemPreview(row: {
  id: string;
  label: string;
  category?: string;
  talentVisible?: boolean;
  workspaceVisible?: boolean;
}): Promise<CatalogItemPreview> {
  const base = {
    id: row.id,
    label: row.label,
    source: "template" as const,
    category: row.category,
    talentVisible: row.talentVisible,
    workspaceVisible: row.workspaceVisible,
  };

  try {
    const loaded = await getTemplateById(row.id);
    if (!loaded.ok) {
      return { ...base, tree: [], codeJson: "", available: false, note: loaded.error };
    }
    const tree = Array.isArray(loaded.data.builder_tree) ? loaded.data.builder_tree : [];
    if (tree.length === 0) {
      return {
        ...base,
        tree: [],
        codeJson: "",
        available: false,
        note: "This template has no authored content yet.",
      };
    }
    return {
      ...base,
      label: loaded.data.title || row.label,
      tree,
      codeJson: JSON.stringify(tree, null, 2),
      available: true,
    };
  } catch {
    return { ...base, tree: [], codeJson: "", available: false, note: "Couldn't load this template." };
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
  const [showSettings, setShowSettings] = useState(false);
  // X8 — which of the four real surfaces (or the generic Lab default) the
  // connected component previews against. Default `lab` keeps F5's behaviour:
  // the generic Lab subject (tenant default, previewSubjectKind null).
  const [surfaceTarget, setSurfaceTarget] = useState<PreviewSurfaceTarget>("lab");
  // The real subject (talent / workspace) picked for the chosen surface, plus the
  // canvas render data rebuilt against it — a reactive prop, so connected nodes
  // re-hydrate in place when it changes (same pattern as BuilderLabStage).
  const [subject, setSubject] = useState<PreviewSubject | null>(null);
  const [canvasRenderData, setCanvasRenderData] =
    useState<InEditorCanvasRenderData | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    stageRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Switching surface clears any subject/canvas hydration from the prior surface
  // so the new surface starts from its own clean state.
  const onSurfaceChange = useCallback((next: PreviewSurfaceTarget) => {
    setSurfaceTarget(next);
    setSubject(null);
    setCanvasRenderData(null);
  }, []);

  const onSubjectResolved = useCallback(
    (next: PreviewSubject, data: InEditorCanvasRenderData) => {
      setSubject(next);
      setCanvasRenderData(data);
    },
    [],
  );

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
  // X8 — the config's previewSubjectKind is now derived from the chosen surface,
  // mirroring that surface's real config builder (talent_page → "talent"; the
  // shells / cms_page → null). `lab` keeps the F5 generic default (null).
  const surfaceConfig = useMemo(
    () =>
      buildPlatformLabBuilderConfig(
        adapter,
        previewSubjectKindForSurface(surfaceTarget),
      ),
    [adapter, surfaceTarget],
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
            canvasRenderData={canvasRenderData}
            headerVariant="lab"
            onExit={onExit}
            exitLabel="Close preview"
            previewSubjectChip={
              <PreviewChip
                label={preview.label}
                surfaceTarget={surfaceTarget}
                subject={subject}
              />
            }
            labHeaderActions={
              <PreviewHeaderActions
                surfaceTarget={surfaceTarget}
                onSurfaceChange={onSurfaceChange}
                subject={subject}
                tenantId={tenantId}
                locale={locale}
                onSubjectResolved={onSubjectResolved}
                onOpenSettings={() => setShowSettings(true)}
              />
            }
          >
            <SeedPreviewing />
          </BuilderEditorMount>
          <CodeInspector
            json={preview.codeJson}
            note={preview.note}
            open={showCode}
            onToggle={() => setShowCode((v) => !v)}
          />
          <SettingsPanel
            preview={preview}
            open={showSettings}
            onClose={() => setShowSettings(false)}
          />
        </>
      ) : (
        <Unavailable label={preview.label} note={preview.note} onExit={onExit} />
      )}
    </div>
  );
}

/** A read-only chip in the topbar showing what's being previewed — and, when a
 *  non-Lab surface is chosen, which surface (+ subject) it hydrates against. */
function PreviewChip({
  label,
  surfaceTarget,
  subject,
}: {
  label: string;
  surfaceTarget: PreviewSurfaceTarget;
  subject: PreviewSubject | null;
}) {
  const surfaceLabel =
    surfaceTarget === "lab"
      ? null
      : PREVIEW_SURFACE_DESCRIPTORS.find((d) => d.target === surfaceTarget)
          ?.label ?? null;
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
      {surfaceLabel ? (
        <span style={{ opacity: 0.75, fontWeight: 500 }}>
          · {surfaceLabel}
          {subject ? ` (${subject.label})` : ""}
        </span>
      ) : null}
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

/** Surface switcher + subject picker + Lock + Settings in the lab topbar.
 *  Rendered INSIDE the editor provider (via labHeaderActions) so the lock can
 *  read/toggle the live `previewing` state AND the subject picker can read the
 *  live builder tree (`useBuilderTree`) when rebuilding canvas data against a
 *  picked subject. Lock semantics: locked = read-only (look-only), unlocked =
 *  editable preview. */
function PreviewHeaderActions({
  surfaceTarget,
  onSurfaceChange,
  subject,
  tenantId,
  locale,
  onSubjectResolved,
  onOpenSettings,
}: {
  surfaceTarget: PreviewSurfaceTarget;
  onSurfaceChange: (next: PreviewSurfaceTarget) => void;
  subject: PreviewSubject | null;
  tenantId: string;
  locale?: string;
  onSubjectResolved: (s: PreviewSubject, data: InEditorCanvasRenderData) => void;
  onOpenSettings: () => void;
}) {
  const { previewing, setPreviewing } = useEditContext();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <SurfaceSubjectPicker
        surfaceTarget={surfaceTarget}
        onSurfaceChange={onSurfaceChange}
        subject={subject}
        tenantId={tenantId}
        locale={locale}
        onSubjectResolved={onSubjectResolved}
      />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <HeaderIconBtn
          active={previewing}
          title={
            previewing
              ? "Locked (read-only), click to edit this preview"
              : "Editable, click to lock (read-only)"
          }
          ariaLabel={previewing ? "Locked, read only" : "Unlocked, editable"}
          onClick={() => setPreviewing(!previewing)}
        >
          <LockGlyph locked={previewing} />
        </HeaderIconBtn>
        <HeaderIconBtn
          title="Component settings"
          ariaLabel="Component settings"
          onClick={onOpenSettings}
        >
          <GearGlyph />
        </HeaderIconBtn>
      </span>
    </span>
  );
}

function HeaderIconBtn({
  children,
  onClick,
  title,
  ariaLabel,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  ariaLabel: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 30,
        height: 30,
        borderRadius: 8,
        border: `1px solid ${active ? CHROME.accent : CHROME.controlBorder}`,
        background: active ? "rgba(124,58,237,0.10)" : CHROME.controlFill,
        color: active ? CHROME.accent : CHROME.text,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function LockGlyph({ locked }: { locked?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      {locked ? (
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      ) : (
        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
      )}
    </svg>
  );
}

function GearGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/** Read-only Settings panel — the component's catalog metadata at a glance.
 *  (Editing these overrides stays on the Catalog row's accordion.) */
function SettingsPanel({
  preview,
  open,
  onClose,
}: {
  preview: CatalogItemPreview;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-label="Component settings"
      style={{
        position: "fixed",
        top: 60,
        right: 16,
        zIndex: 95,
        width: "min(320px, 92vw)",
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
          Component settings
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          style={{ border: "none", background: "transparent", color: LAB.inkMuted, cursor: "pointer", fontSize: 16, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 9 }}>
        <SettingRow label="Name" value={preview.label} />
        <SettingRow label="Component id" value={preview.id} mono />
        <SettingRow label="Source" value={preview.source === "template" ? "Template" : "Built-in (code)"} />
        {preview.category ? <SettingRow label="Category" value={preview.category} /> : null}
        <SettingRow
          label="Talent-Max"
          value={preview.talentVisible == null ? "—" : preview.talentVisible ? "Visible" : "Hidden"}
          tone={preview.talentVisible === false ? "off" : "on"}
        />
        <SettingRow
          label="Workspace"
          value={preview.workspaceVisible == null ? "—" : preview.workspaceVisible ? "Visible" : "Hidden"}
          tone={preview.workspaceVisible === false ? "off" : "on"}
        />
      </div>
      <div style={{ padding: "0 14px 12px", fontSize: 11, color: LAB.inkDim, lineHeight: 1.45 }}>
        Rename, re-icon, re-category or toggle per-surface visibility from the
        component&rsquo;s row in the Catalog.
      </div>
    </div>
  );
}

function SettingRow({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "on" | "off";
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 11, color: LAB.inkDim }}>{label}</span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: tone === "off" ? LAB.no : tone === "on" ? LAB.yes : LAB.ink,
          fontFamily: mono ? "ui-monospace, monospace" : undefined,
          textAlign: "right",
          wordBreak: "break-word",
        }}
      >
        {value}
      </span>
    </div>
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
