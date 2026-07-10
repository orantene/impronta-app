"use client";

/**
 * W1-L3 — the inline-editor's two text-commit helpers, extracted verbatim from
 * `InlineEditor` (which sits at the shared edit-chrome max-lines budget). The
 * commit SEMANTICS live in the PURE functions `runCommitText` /
 * `runCommitBuilderNodeText` (unit-tested in `use-inline-text-commit.test.ts`);
 * the hook only pins them to stable `useCallback` identities:
 *
 *   - `commitText` — legacy CMS-section path. Rewrites the draft-props tree via
 *     `findPathByValue` (fails loudly on not-found / ambiguous) and marks dirty.
 *   - `commitBuilderNodeText` — freeform builder-node path. Patches the node
 *     prop (or its `section_embed` config key / WS5 i18n overlay) through
 *     `patchBuilderNodeProps`, which records undo history + coalesces the save.
 *
 * BOTH return whether the edit was actually APPLIED — the caller uses that to
 * trigger the optimistic canvas repaint (`inline-editor-repaint.ts`) only when
 * something really changed. A no-op / empty / not-found / failed save returns
 * false and leaves the canvas untouched.
 */

import { useCallback, type MutableRefObject } from "react";

import { findPathByValue, setByPath } from "@/lib/site-admin/edit-mode/prop-path";
import { findBuilderNodeById } from "./inline-editor-builder-resolvers";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node";
import { isLocalizableProp } from "@/lib/i18n/builder-i18n-props";
import { setOverlayProp } from "@/lib/site-admin/builder-node/i18n-overlay";

/** The builder-node identity an inline canvas edit writes to. */
export interface InlineBuilderNodeTextTarget {
  id: string;
  propKey: "text" | "label" | "title" | "brand";
  /** Patches `section_embed.props.config[sectionEmbedConfigKey]` when set. */
  sectionEmbedConfigKey?: string;
  /**
   * WS5 — the content locale this edit authors, captured when the overlay
   * opened. Default locale → writes the base prop; a secondary locale →
   * writes `node.i18n[locale][propKey]`. `sectionEmbedConfigKey` edits stay
   * base-only (curated section_embed config has no per-element overlay).
   */
  locale: string;
}

export interface InlineTextCommitDeps {
  draftPropsRef: MutableRefObject<Record<string, unknown> | null>;
  builderTreeRef: MutableRefObject<BuilderNodeTree>;
  defaultLocale: string;
  patchBuilderNodeProps: (
    nodeId: string,
    patch: Record<string, unknown>,
  ) => Promise<{ ok: boolean; error?: string }>;
  reportMutationError: (message: string) => void;
  setBanner: (banner: { kind: "error"; text: string }) => void;
  setDraftProps: (updater: Record<string, unknown> | null) => void;
  setDirty: (d: boolean) => void;
}

export interface InlineTextCommitApi {
  /** Legacy CMS-section commit. Returns true iff the draft tree changed. */
  commitText: (original: string, next: string) => boolean;
  /** Builder-node commit. Resolves true iff the node patch was applied. */
  commitBuilderNodeText: (
    target: InlineBuilderNodeTextTarget,
    original: string,
    next: string,
  ) => Promise<boolean>;
}

/** Pure commit logic — legacy CMS-section path. Returns true iff applied. */
export function runCommitText(
  deps: Pick<
    InlineTextCommitDeps,
    "draftPropsRef" | "setBanner" | "setDraftProps" | "setDirty"
  >,
  original: string,
  next: string,
): boolean {
  if (next === original) return false;
  const tree = deps.draftPropsRef.current;
  if (!tree) return false;
  const hit = findPathByValue(tree, original);
  if (!hit) {
    deps.setBanner({
      kind: "error",
      text: "Couldn't find this text to save. Open the inspector to edit this field.",
    });
    return false;
  }
  if (hit.occurrences > 1) {
    deps.setBanner({
      kind: "error",
      text: "This text appears more than once in this section — edit it from the inspector to disambiguate.",
    });
    return false;
  }
  const updated = setByPath(tree, hit.path, next);
  deps.setDraftProps(updated);
  deps.setDirty(true);
  return true;
}

/** Pure commit logic — freeform builder-node path. Resolves true iff applied. */
export async function runCommitBuilderNodeText(
  deps: Pick<
    InlineTextCommitDeps,
    | "builderTreeRef"
    | "defaultLocale"
    | "patchBuilderNodeProps"
    | "reportMutationError"
    | "setBanner"
  >,
  target: InlineBuilderNodeTextTarget,
  original: string,
  next: string,
): Promise<boolean> {
  if (next === original) return false;
  if (next.trim().length === 0) {
    deps.setBanner({
      kind: "error",
      text: "This block cannot be saved empty. Use delete if you want to remove it.",
    });
    return false;
  }
  if (target.sectionEmbedConfigKey) {
    const node = findBuilderNodeById(deps.builderTreeRef.current, target.id);
    if (!node || node.kind !== "section_embed") {
      deps.setBanner({
        kind: "error",
        text: "Couldn't find this Tulala component to save.",
      });
      return false;
    }
    const config = {
      ...((node.props.config ?? {}) as Record<string, unknown>),
      [target.sectionEmbedConfigKey]: next.trim(),
    };
    const result = await deps.patchBuilderNodeProps(target.id, { config });
    if (!result.ok) {
      const text = result.error ?? "Couldn't save this block. Try the inspector.";
      deps.reportMutationError(text);
      deps.setBanner({ kind: "error", text });
    }
    return result.ok;
  }

  // WS5 — Behavior 3: when a secondary content locale is active and this is
  // a localizable prop, the edit writes the per-element translation overlay
  // (`node.i18n[locale][prop]`) instead of the base/default-locale prop. The
  // canvas re-resolves through `resolveNodeProp`, so the node flips to full
  // opacity + a green dot. The default locale (and any non-localizable prop)
  // keeps writing the base prop exactly as before → byte-identical.
  const node = findBuilderNodeById(deps.builderTreeRef.current, target.id);
  if (
    node &&
    target.locale !== deps.defaultLocale &&
    isLocalizableProp(node.kind, target.propKey)
  ) {
    const nextOverlay = setOverlayProp(
      node.i18n,
      target.locale,
      target.propKey,
      next.trim(),
    );
    const result = await deps.patchBuilderNodeProps(target.id, {
      i18n: nextOverlay,
    });
    if (!result.ok) {
      const text =
        result.error ?? "Couldn't save this translation. Try the inspector.";
      deps.reportMutationError(text);
      deps.setBanner({ kind: "error", text });
    }
    return result.ok;
  }

  const result = await deps.patchBuilderNodeProps(target.id, {
    [target.propKey]: next.trim(),
  });
  if (!result.ok) {
    const text = result.error ?? "Couldn't save this block. Try the inspector.";
    deps.reportMutationError(text);
    deps.setBanner({ kind: "error", text });
  }
  return result.ok;
}

export function useInlineTextCommit(deps: InlineTextCommitDeps): InlineTextCommitApi {
  const {
    draftPropsRef,
    builderTreeRef,
    defaultLocale,
    patchBuilderNodeProps,
    reportMutationError,
    setBanner,
    setDraftProps,
    setDirty,
  } = deps;

  const commitText = useCallback(
    (original: string, next: string): boolean =>
      runCommitText({ draftPropsRef, setBanner, setDraftProps, setDirty }, original, next),
    [draftPropsRef, setBanner, setDraftProps, setDirty],
  );

  const commitBuilderNodeText = useCallback(
    (
      target: InlineBuilderNodeTextTarget,
      original: string,
      next: string,
    ): Promise<boolean> =>
      runCommitBuilderNodeText(
        {
          builderTreeRef,
          defaultLocale,
          patchBuilderNodeProps,
          reportMutationError,
          setBanner,
        },
        target,
        original,
        next,
      ),
    [
      builderTreeRef,
      defaultLocale,
      patchBuilderNodeProps,
      reportMutationError,
      setBanner,
    ],
  );

  return { commitText, commitBuilderNodeText };
}
