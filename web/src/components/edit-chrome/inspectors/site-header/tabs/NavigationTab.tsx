"use client";

/**
 * Navigation tab — header link list.
 *
 * Placeholder for the inline reorderable list that lands in the next
 * pass. The cms_navigation_items + cms_navigation_menus pipeline already
 * handles drafts + publish; the inspector wraps it in a list editor with
 * inline rename, drag-reorder, and add/remove.
 *
 * For this foundation cut we route operators to the existing admin form
 * — it works today and changes flow through to the live header without
 * any inspector involvement.
 */

import { InspectorGroup } from "../../kit";
import { GroupDescription, NextPassRow } from "../tab-helpers";
import type { SiteHeaderConfig } from "@/lib/site-admin/site-header/types";

interface Props {
  config: SiteHeaderConfig;
}

export function NavigationTab({ config: _config }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <InspectorGroup title="Header navigation">
        <GroupDescription>
          The text links rendered in the header bar (and inside the mobile menu).
        </GroupDescription>
        <div className="rounded-lg border border-[#e5e0d5] bg-[#faf9f6] p-4 text-[12px] text-stone-600">
          <p className="mb-2">
            <strong className="font-semibold text-stone-800">Inline editor coming next pass.</strong>{" "}
            Reorderable list with live preview, plus an Add link affordance.
          </p>
          <p className="text-[11px] text-stone-500">
            For now, the existing navigation editor handles draft + publish and the live header
            picks up the change immediately on save.
          </p>
        </div>
        <a
          href="/admin/site-settings/navigation"
          target="_blank"
          rel="noopener noreferrer"
          className="self-start text-[11.5px] font-medium text-indigo-600 transition-colors hover:text-indigo-800"
        >
          Edit navigation links →
        </a>
      </InspectorGroup>

      <InspectorGroup title="Coming next pass" advanced collapsible storageKey="header:nav:next-pass">
        <GroupDescription>
          Inline UX that lands once we wire the cms_navigation_items reads +
          writes through the inspector.
        </GroupDescription>
        <NextPassRow label="Inline rename" hint="Edit a link's label without leaving the drawer." />
        <NextPassRow label="Drag-reorder" hint="Pointer-driven; works on touch + mouse." />
        <NextPassRow label="Add / remove" hint="Add affordance with a default label/href." />
        <NextPassRow
          label="Submenu support"
          hint="Two-level nav for sites that need it. Hidden by default."
        />
      </InspectorGroup>
    </div>
  );
}

