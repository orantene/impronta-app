"use client";

/**
 * HeaderQuickPanel — the header as a list of TASKS.
 *
 * The inspector answers "what are this node's properties". An operator opening
 * a header arrives with a job instead — change the logo, reorder the menu, swap
 * an action icon, make the bar shorter — and has to know which node owns each
 * one before the inspector can help. That mapping is the product's, not theirs.
 *
 * So this is a router, not a second editor. Every row hands off to the surface
 * that already owns the job: the brand panel, the nav inspector, the style tab,
 * the theme drawer, mobile mode. Nothing here duplicates state, which is what
 * keeps it from drifting out of sync with the panels it points at — the failure
 * mode of every "quick settings" screen.
 */

import { useMemo } from "react";

import { DockFloatingPanel } from "./dock-floating-panel";
import { useEditContext } from "./edit-context";
import { CHROME } from "./kit";
import { useEditorLocale } from "./use-editor-locale";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

interface HeaderQuickPanelProps {
  open: boolean;
  onClose: () => void;
  /** The shell tree, so rows can point at the nodes that actually exist. */
  builderTree: BuilderNodeTree;
}

interface HeaderTargets {
  logoNodeId: string | null;
  navNodeId: string | null;
  barNodeId: string | null;
  actionCount: number;
}

/**
 * Find the nodes a header task refers to.
 *
 * By KIND, never by id: shell trees are seeded per tenant with their own id
 * prefixes, so anything keyed to a name would work for one site and quietly do
 * nothing for the next.
 */
export function findHeaderTargets(tree: BuilderNodeTree): HeaderTargets {
  const out: HeaderTargets = {
    logoNodeId: null,
    navNodeId: null,
    barNodeId: null,
    actionCount: 0,
  };
  const walk = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) return;
    for (const raw of nodes) {
      const node = raw as {
        id?: string;
        kind?: string;
        props?: { layout?: string };
        children?: unknown[];
      };
      if (typeof node.id === "string") {
        if (node.kind === "image" && !out.logoNodeId) out.logoNodeId = node.id;
        if (node.kind === "nav" && !out.navNodeId) out.navNodeId = node.id;
        if (node.kind === "section_embed") out.actionCount += 1;
        // The bar is the first ROW container — the thing whose height, colour
        // and stickiness an operator means by "the header".
        if (
          node.kind === "container" &&
          node.props?.layout === "row" &&
          !out.barNodeId
        ) {
          out.barNodeId = node.id;
        }
      }
      if (Array.isArray(node.children)) walk(node.children);
    }
  };
  walk(tree);
  return out;
}

function TaskRow({
  title,
  detail,
  action,
  onClick,
  disabled,
}: {
  title: string;
  detail: string;
  action: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45"
      style={{ borderColor: CHROME.line, background: "#fff" }}
    >
      <span className="flex-1">
        <span className="block text-[12.5px] font-semibold" style={{ color: CHROME.ink }}>
          {title}
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: CHROME.muted }}>
          {detail}
        </span>
      </span>
      <span className="mt-0.5 text-[11px] font-medium" style={{ color: CHROME.accent }}>
        {action}
      </span>
    </button>
  );
}

export function HeaderQuickPanel({ open, onClose, builderTree }: HeaderQuickPanelProps) {
  const {
    selectBuilderNode,
    requestInspectorTab,
    toggleBrandPanel,
    openTheme,
    canEditTheme,
    setMobileEditMode,
  } = useEditContext();
  const { t } = useEditorLocale();
  const targets = useMemo(() => findHeaderTargets(builderTree), [builderTree]);

  if (!open) return null;

  /** Select a node and open the tab that answers the task. */
  const go = (
    nodeId: string | null,
    tab: "content" | "style" | "layout",
  ) => {
    if (!nodeId) return;
    selectBuilderNode(nodeId);
    requestInspectorTab(tab);
    onClose();
  };

  return (
    <DockFloatingPanel
      panelId="header-tasks"
      title={t("Header")}
      open={open}
      onClose={onClose}
      width={340}
      testId="header-quick-panel"
    >
      <div className="flex flex-col gap-2 p-3">
        <TaskRow
          title={t("Logo and brand")}
          detail={t("Logo image, site name, colours and contact details.")}
          action={t("Open")}
          onClick={() => {
            toggleBrandPanel();
            onClose();
          }}
        />
        <TaskRow
          title={t("Navigation")}
          detail={
            targets.navNodeId
              ? t("Links, icons, submenus and what shows on a phone.")
              : t("This header has no menu yet.")
          }
          action={t("Edit")}
          disabled={!targets.navNodeId}
          onClick={() => go(targets.navNodeId, "content")}
        />
        <TaskRow
          title={t("Logo image")}
          detail={
            targets.logoNodeId
              ? t("Swap the image or change its size.")
              : t("This header has no image yet.")
          }
          action={t("Edit")}
          disabled={!targets.logoNodeId}
          onClick={() => go(targets.logoNodeId, "content")}
        />
        <TaskRow
          title={t("Actions")}
          detail={
            targets.actionCount > 0
              ? `${targets.actionCount} ${t("in the bar: search, account, language and the rest.")}`
              : t("No action widgets in this header.")
          }
          action={t("Manage")}
          disabled={targets.actionCount === 0}
          onClick={() => go(targets.barNodeId, "layout")}
        />
        <TaskRow
          title={t("Bar style")}
          detail={t("Height, background, blur and whether it sticks on scroll.")}
          action={t("Style")}
          disabled={!targets.barNodeId}
          onClick={() => go(targets.barNodeId, "style")}
        />
        {canEditTheme ? (
          <TaskRow
            title={t("Fonts and colours")}
            detail={t("Site-wide type and palette. Changes every page, not just the header.")}
            action={t("Open")}
            onClick={() => {
              openTheme();
              onClose();
            }}
          />
        ) : null}
        <TaskRow
          title={t("Mobile")}
          detail={t("Edit the phone layout and open the menu on the canvas.")}
          action={t("Switch")}
          onClick={() => {
            setMobileEditMode(true);
            onClose();
          }}
        />
      </div>
    </DockFloatingPanel>
  );
}
