"use client";

/**
 * MobileHudCards — the phone-menu card inside the mobile edit HUD.
 *
 * The drawer is the one part of a header an operator cannot see while editing
 * it. It only exists when a real pointer opens a `<details>`, and the canvas
 * has no pointer of its own — so the mobile menu was configured blind, from a
 * panel, and checked by publishing.
 *
 * This opens it ON THE CANVAS. The mechanism is one injected stylesheet that
 * forces the disclosure open for the nav being edited; the tree is untouched,
 * nothing is written, and closing the card removes the rule. It is editor-only
 * by construction: the style element lives in the editor chrome, so it cannot
 * reach a published page even if someone forgets to clean it up.
 *
 * Lives in its own module so `mobile-edit-panel.tsx` grows by an import and a
 * mount rather than by a feature.
 */

import { useEffect, useMemo, useState } from "react";

import { CHROME } from "./kit";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

/** Every nav node in the tree, with the labels that identify it to a human. */
export interface HudNavSummary {
  id: string;
  label: string;
  linkCount: number;
}

export function collectHudNavs(tree: BuilderNodeTree): HudNavSummary[] {
  const out: HudNavSummary[] = [];
  const walk = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) return;
    for (const raw of nodes) {
      const node = raw as {
        id?: string;
        kind?: string;
        props?: { links?: unknown[]; ariaLabel?: string; brand?: string };
        children?: unknown[];
      };
      if (node.kind === "nav" && typeof node.id === "string") {
        out.push({
          id: node.id,
          label: node.props?.ariaLabel || node.props?.brand || "Navigation",
          linkCount: Array.isArray(node.props?.links) ? node.props!.links!.length : 0,
        });
      }
      if (Array.isArray(node.children)) walk(node.children);
    }
  };
  walk(tree);
  return out;
}

/**
 * The rule that holds one nav's drawer open.
 *
 * Scoped to a single node id, so opening one menu cannot force every nav on the
 * page open at once — a header and a footer nav would otherwise both spring
 * open and overlap.
 */
export function pinnedDrawerCss(nodeId: string): string {
  return [
    `[data-builder-node-id="${nodeId}"] .site-builder-node--nav-disclosure > .site-builder-node--nav-menu{`,
    "opacity:1 !important;visibility:visible !important;transform:none !important;animation:none !important;",
    "}",
    // The burger's open-state look, since the details element is not actually
    // open — without this the operator sees an X-less menu that will not match
    // what a visitor gets.
    `[data-builder-node-id="${nodeId}"] .site-builder-node--nav-burger{background:transparent !important;}`,
    `[data-builder-node-id="${nodeId}"] .site-builder-node--nav-burger::before{top:0 !important;transform:rotate(45deg) !important;}`,
    `[data-builder-node-id="${nodeId}"] .site-builder-node--nav-burger::after{top:0 !important;transform:rotate(-45deg) !important;}`,
  ].join("");
}

export function MobilePhoneMenuCard({
  builderTree,
}: {
  builderTree: BuilderNodeTree;
}) {
  const navs = useMemo(() => collectHudNavs(builderTree), [builderTree]);
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  // Drop the pin if the nav it points at disappears (deleted, or the operator
  // switched pages) — a rule targeting a missing id is dead weight that would
  // silently re-apply when a node with that id came back.
  useEffect(() => {
    if (pinnedId && !navs.some((nav) => nav.id === pinnedId)) setPinnedId(null);
  }, [navs, pinnedId]);

  if (navs.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: CHROME.muted2,
          paddingLeft: 2,
        }}
      >
        Phone menu
      </span>

      {pinnedId ? (
        // eslint-disable-next-line react/no-danger -- a stylesheet built from a
        // node id we minted, injected into editor chrome only; there is no
        // other way to force a CSS-only disclosure open without a real pointer.
        <style dangerouslySetInnerHTML={{ __html: pinnedDrawerCss(pinnedId) }} />
      ) : null}

      {navs.map((nav) => {
        const open = pinnedId === nav.id;
        return (
          <button
            key={nav.id}
            type="button"
            data-hud-nav-pin={nav.id}
            aria-pressed={open}
            onClick={() => setPinnedId(open ? null : nav.id)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "6px 8px",
              borderRadius: 6,
              border: `1px solid ${open ? CHROME.accent : CHROME.line}`,
              background: open ? "#fff" : CHROME.paper,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 11, color: CHROME.ink }}>
              {nav.label}
              <span style={{ color: CHROME.muted2 }}>
                {" "}
                · {nav.linkCount} link{nav.linkCount === 1 ? "" : "s"}
              </span>
            </span>
            <span style={{ fontSize: 10, color: open ? CHROME.accent : CHROME.muted }}>
              {open ? "Close" : "Open on canvas"}
            </span>
          </button>
        );
      })}

      <p style={{ fontSize: 10, lineHeight: 1.4, color: CHROME.muted, margin: 0 }}>
        Opens the menu on the canvas so you can style it while you look at it.
        Nothing is saved by opening it.
      </p>
    </div>
  );
}
