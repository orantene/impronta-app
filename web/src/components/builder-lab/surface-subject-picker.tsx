"use client";

/**
 * SurfaceSubjectPicker (X8) — the surface switcher + preview-subject picker in
 * the Lab component-preview topbar.
 *
 * Choosing one of the four real surfaces derives that surface's
 * `previewSubjectKind` (the parent threads it into `buildPlatformLabBuilderConfig`)
 * AND, for talent / workspace surfaces, shows a `PreviewSubjectPicker` so the
 * operator picks a REAL subject. Picking one rebuilds the canvas render data
 * against the LIVE tree (read here via `useBuilderTree` — which is why this lives
 * INSIDE the editor provider, mounted via `labHeaderActions`) scoped to the
 * subject. The connected card then hydrates exactly as it would on that surface.
 * The `lab` default keeps F5's behaviour (generic Lab subject = tenant default).
 *
 * Extracted from `component-preview-stage.tsx` to keep that file under the
 * max-lines budget; the stage owns the surface/subject STATE and feeds it back
 * down as the editor's `canvasRenderData` (a reactive prop, so connected nodes
 * re-hydrate in place without a remount).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { buildLabCanvasRenderData } from "@/lib/site-admin/builder-core/lab/lab-canvas-render-data";
import type { InEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import { useBuilderTree } from "@/components/edit-chrome/builder-tree-bridge";
import { CHROME } from "@/components/edit-chrome/kit/tokens";

import { PillToggle } from "./ui";
import {
  PREVIEW_SURFACE_DESCRIPTORS,
  pickerKindForSurface,
  type PreviewSurfaceTarget,
} from "./preview-surface-target";
import { PreviewSubjectPicker, type PreviewSubject } from "./preview-subject-picker";

export function SurfaceSubjectPicker({
  surfaceTarget,
  onSurfaceChange,
  subject,
  tenantId,
  locale,
  onSubjectResolved,
}: {
  surfaceTarget: PreviewSurfaceTarget;
  onSurfaceChange: (next: PreviewSurfaceTarget) => void;
  subject: PreviewSubject | null;
  tenantId: string;
  locale?: string;
  onSubjectResolved: (s: PreviewSubject, data: InEditorCanvasRenderData) => void;
}) {
  const tree = useBuilderTree();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  const pickerKind = pickerKindForSurface(surfaceTarget);

  // Dismiss the open dropdown on Escape / outside-click (scoped via the data-attr
  // so it never touches the editor's own Escape handling).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && !t.closest("[data-lab-component-surface-picker]")) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const buildFor = useCallback(
    async (next: PreviewSubject) => {
      setPending(true);
      setError(null);
      const res = await buildLabCanvasRenderData({
        tenantId,
        tree,
        locale,
        previewSubject: { kind: next.kind, id: next.id },
      });
      setPending(false);
      if (res.ok) {
        onSubjectResolved(next, res.data);
      } else {
        setError(res.error);
      }
    },
    [tenantId, tree, locale, onSubjectResolved],
  );

  const activeLabel =
    surfaceTarget === "lab"
      ? "Surface: Lab"
      : `Surface: ${
          PREVIEW_SURFACE_DESCRIPTORS.find((d) => d.target === surfaceTarget)
            ?.label ?? surfaceTarget
        }`;

  return (
    <div data-lab-component-surface-picker style={{ position: "relative" }}>
      <button
        type="button"
        ref={triggerRef}
        onClick={() =>
          setOpen((v) => {
            const next = !v;
            if (next && triggerRef.current) {
              const rect = triggerRef.current.getBoundingClientRect();
              const MENU_W = 300;
              const left = Math.max(
                8,
                Math.min(rect.left, window.innerWidth - MENU_W - 8),
              );
              setMenuPos({ top: rect.bottom + 6, left });
            }
            return next;
          })
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "5px 12px",
          borderRadius: 999,
          border: `1px solid ${
            surfaceTarget === "lab" ? CHROME.controlBorder : CHROME.accent
          }`,
          background:
            surfaceTarget === "lab" ? CHROME.controlFill : "rgba(124,58,237,0.10)",
          color: surfaceTarget === "lab" ? CHROME.text : CHROME.accent,
          fontSize: 11.5,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {activeLabel}
        {subject ? (
          <span style={{ opacity: 0.8, fontWeight: 500 }}>· {subject.label}</span>
        ) : null}
        <span aria-hidden style={{ fontSize: 9, opacity: 0.7 }}>
          {open ? "▲" : "▼"}
        </span>
        {pending ? (
          <span style={{ fontSize: 10, color: CHROME.muted, fontWeight: 500 }}>
            loading…
          </span>
        ) : null}
      </button>

      {open && menuPos ? (
        <div
          role="dialog"
          aria-label="Preview surface and subject"
          style={{
            position: "fixed",
            top: menuPos.top,
            left: menuPos.left,
            zIndex: 120,
            width: 300,
            maxWidth: "90vw",
            background: "#16161A",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
            padding: 12,
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: "rgba(245,242,235,0.55)",
              marginBottom: 8,
            }}
          >
            Preview against surface
          </div>
          <PillToggle
            ariaLabel="Preview surface"
            size="sm"
            value={surfaceTarget}
            onChange={onSurfaceChange}
            options={PREVIEW_SURFACE_DESCRIPTORS.map((d) => ({
              key: d.target,
              label: d.label,
            }))}
          />
          {pickerKind ? (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  color: "rgba(245,242,235,0.55)",
                  marginBottom: 8,
                }}
              >
                Pick a {pickerKind} to preview against
              </div>
              {error ? (
                <div
                  style={{
                    fontSize: 11.5,
                    color: "#F36772",
                    background: "rgba(243,103,114,0.12)",
                    borderRadius: 8,
                    padding: "6px 9px",
                    marginBottom: 8,
                  }}
                >
                  {error}
                </div>
              ) : null}
              <PreviewSubjectPicker
                key={pickerKind}
                kind={pickerKind}
                selectedId={
                  subject && subject.kind === pickerKind ? subject.id : null
                }
                onSelect={(s) => void buildFor(s)}
              />
            </div>
          ) : (
            <div
              style={{
                marginTop: 10,
                fontSize: 11,
                color: "rgba(245,242,235,0.5)",
                lineHeight: 1.45,
              }}
            >
              The Lab default previews against the active tenant, no subject to
              pick.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
