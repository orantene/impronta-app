"use client";

/**
 * Inspector kit — per-PROP lock affordance (INS-1).
 *
 * Builder Studio's per-prop locks (`node.lockedProps: string[]` dot-paths) are
 * re-asserted server-trustedly in `patchBuilderNodeProps` / the whole-tree
 * `enforceLockedPropsOnTree` backstop, and `stripLockedKeysFromPatch` guards the
 * single-node inspector patch. Until now the only CLIENT affordance lived in the
 * Content tab (`builder-node-content.tsx` commitPatch) plus a prose banner in the
 * inspector dock — so a locked `style.textColor` / `layout.padding` / `data.source`
 * still *looked* editable in the Style, Layout, and Data tabs and silently no-op'd
 * on save.
 *
 * This module is the SHARED affordance every inspector panel reuses so a locked
 * prop reads as locked in EVERY tab, not just Content. It is a single shared kit
 * home (no per-surface fork): all four surfaces (Builder Lab, Admin storefront,
 * Talent Max profile, Talent Max site) mount the same Style/Layout/Data panels
 * through `inspector-dock.tsx`, so wiring the affordance here lands it on every
 * surface at once.
 *
 * Pure UI + a thin `isPropLocked` wrapper — no I/O, no surfaceKind branch.
 */

import type { CSSProperties, ReactNode } from "react";

import { isPropLocked } from "@/lib/site-admin/builder-node/prop-lock";

/** Minimal node shape the affordance needs — a real BuilderNode satisfies it. */
export interface LockableInspectorNode {
  lockedProps?: readonly string[] | null;
}

export interface LockedFieldsApi {
  /** Whether the node carries ANY per-prop lock. */
  readonly hasAnyLock: boolean;
  /** The normalized list of locked dot-paths (valid, non-empty strings). */
  readonly lockedPaths: readonly string[];
  /** Does the node lock this exact dot-path (e.g. `"style.textColor"`)? */
  isLocked(path: string): boolean;
  /**
   * Is this dot-path locked, OR is any deeper leaf under it locked (e.g.
   * `isLockedBranch("style")` is true when `"style.textColor"` is locked)?
   * Lets a panel SECTION badge itself when any field inside it is frozen.
   */
  isLockedBranch(prefix: string): boolean;
}

/**
 * Resolve the per-prop lock state for a node. Stable shape so panels can call it
 * unconditionally at the top of render (hooks rules) and pass dot-paths in.
 */
export function useLockedFields(
  node: LockableInspectorNode | null | undefined,
): LockedFieldsApi {
  const lockedPaths = Array.isArray(node?.lockedProps)
    ? node!.lockedProps!.filter(
        (k): k is string => typeof k === "string" && k.length > 0,
      )
    : [];
  const isLocked = (path: string): boolean => isPropLocked(node, path);
  const isLockedBranch = (prefix: string): boolean =>
    lockedPaths.some(
      (p) => p === prefix || p.startsWith(`${prefix}.`),
    );
  return {
    hasAnyLock: lockedPaths.length > 0,
    lockedPaths,
    isLocked,
    isLockedBranch,
  };
}

/** Tooltip copy shared by every locked affordance. */
export const LOCKED_FIELD_TITLE =
  "Locked by the platform admin. This keeps the component on-brand and can’t be changed here.";

/**
 * The 🔒 badge — matches the inspector-dock locked-props banner palette (the
 * mint/emerald accent) so a self-badged field reads as the same lock primitive.
 */
export function LockBadge({
  label = "Locked",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={className}
      title={LOCKED_FIELD_TITLE}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        borderRadius: 6,
        padding: "1px 6px",
        fontSize: 10,
        fontWeight: 600,
        lineHeight: 1.4,
        letterSpacing: "0.02em",
        color: "#047857",
        background: "rgba(93,211,160,0.12)",
        border: "1px solid rgba(93,211,160,0.30)",
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden="true">🔒</span>
      {label}
    </span>
  );
}

/**
 * Per-tab locked-props banner. Rendered at the top of a panel's body when the
 * selected node has any lock that the tab can show, so Style / Layout / Data each
 * carry the SAME explanation the inspector-dock banner gives, scoped to the tab's
 * relevant paths. Matches the dock banner palette (mint/emerald).
 */
export function LockedFieldsBanner({
  paths,
  noun = "settings",
}: {
  /** The locked dot-paths relevant to this tab (already filtered). */
  paths: readonly string[];
  /** What the locked items are, e.g. "styles", "layout settings", "data bindings". */
  noun?: string;
}) {
  if (paths.length === 0) return null;
  return (
    <div
      role="note"
      data-locked-fields-banner=""
      className="rounded-lg px-3 py-2.5 text-[11.5px] leading-snug"
      style={{
        background: "rgba(93,211,160,0.08)",
        border: "1px solid rgba(93,211,160,0.28)",
        color: "#1f2937",
      }}
    >
      <span style={{ fontWeight: 600 }}>🔒 Locked by the platform admin</span>
      <span style={{ display: "block", marginTop: 2, opacity: 0.85 }}>
        These {noun} keep this component on-brand and can&apos;t be changed here:{" "}
        <span style={{ fontFamily: "var(--font-mono, monospace)" }}>
          {paths.join(", ")}
        </span>
        . You can still edit everything else.
      </span>
    </div>
  );
}

/**
 * Disabled wrapper for a locked field/group. When `locked`, the children render
 * dimmed + non-interactive (pointer-events:none, aria-disabled) with a trailing
 * lock badge — a clear "frozen" affordance that mirrors the Content tab. When
 * not locked, children pass through untouched (zero layout/behavior change), so
 * the wrapper is safe to wrap every control unconditionally.
 */
export function LockedFieldWrapper({
  locked,
  label,
  children,
  style,
}: {
  locked: boolean;
  /** Badge label (e.g. "Locked", "Text color locked"). Defaults to "Locked". */
  label?: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  if (!locked) return <>{children}</>;
  return (
    <div
      data-locked-field=""
      title={LOCKED_FIELD_TITLE}
      style={{ position: "relative", ...style }}
    >
      <div
        aria-disabled="true"
        style={{ opacity: 0.5, pointerEvents: "none", userSelect: "none" }}
      >
        {children}
      </div>
      <div style={{ marginTop: 6 }}>
        <LockBadge label={label ?? "Locked"} />
      </div>
    </div>
  );
}
