"use client";

/**
 * The launcher + mount for {@link HeaderQuickPanel}.
 *
 * Separate from `edit-shell.tsx` on purpose: that file deliberately does NOT
 * subscribe to the builder tree, because it is the root of the editor chrome
 * and nothing below it is memoized — subscribing there re-renders the whole
 * chrome on every commit. The subscription lives here, where it costs one small
 * component.
 *
 * The launcher only appears when a HEADER is selected. A permanent button would
 * be one more thing in the chrome for everyone, including on pages that have no
 * shell to configure.
 */

import { useState } from "react";

import { useBuilderTree } from "./builder-tree-bridge";
import { useEditContext } from "./edit-context";
import { useSelectedBuilderNodeId } from "./selection-bridge";
import { HeaderQuickPanel } from "./header-quick-panel";
import { CHROME } from "./kit";
import { useEditorLocale } from "./use-editor-locale";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

/**
 * Is the selected node the header, or something inside it?
 *
 * Walks by KIND and landmark type rather than id, so it works for any tenant's
 * shell tree, and returns true for descendants too: an operator who clicked the
 * logo is still "in the header" and should be offered the header's tasks.
 */
export function selectionIsInHeader(
  tree: BuilderNodeTree,
  selectedId: string | null,
): boolean {
  if (!selectedId) return false;
  let found = false;
  const walk = (nodes: unknown, insideHeader: boolean): void => {
    if (found || !Array.isArray(nodes)) return;
    for (const raw of nodes) {
      const node = raw as {
        id?: string;
        kind?: string;
        props?: { sectionTypeKey?: string };
        children?: unknown[];
      };
      const isHeaderLandmark =
        node.kind === "section" && node.props?.sectionTypeKey === "site_header";
      const within = insideHeader || isHeaderLandmark;
      if (within && node.id === selectedId) {
        found = true;
        return;
      }
      if (Array.isArray(node.children)) walk(node.children, within);
      if (found) return;
    }
  };
  walk(tree, false);
  return found;
}

export function HeaderQuickPanelMount() {
  const builderTree = useBuilderTree();
  const selectedId = useSelectedBuilderNodeId();
  const { surfaceKind } = useEditContext();
  const { t } = useEditorLocale();
  const [open, setOpen] = useState(false);

  // The shell surface is the only place a "header" is a thing you configure;
  // on a page, a header-looking row is just a row.
  const available =
    surfaceKind === "site_shell" && selectionIsInHeader(builderTree, selectedId);

  if (!available && !open) return null;

  return (
    <>
      {available && !open ? (
        <button
          type="button"
          data-header-tasks-launcher=""
          onClick={() => setOpen(true)}
          className="fixed bottom-4 left-1/2 z-[84] -translate-x-1/2 rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold shadow-sm"
          style={{
            border: `1px solid ${CHROME.line}`,
            background: "#fff",
            color: CHROME.ink,
          }}
        >
          {t("Header tasks")}
        </button>
      ) : null}
      <HeaderQuickPanel
        open={open}
        onClose={() => setOpen(false)}
        builderTree={builderTree}
      />
    </>
  );
}
