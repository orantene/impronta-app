"use client";

/**
 * AddQuickMenu — lean quick-add surface launched from the CommandDock Add item.
 *
 * Phase 2: routes to existing insertion surfaces (section library, element
 * picker popover target, page create, assets, collections, templates) without
 * rebuilding insert logic.
 */

import { useEditContext } from "./edit-context";
import { defaultSectionAddSlot } from "./default-section-add-slot";
import { DockFloatingPanel } from "./dock-floating-panel";
import { CHROME } from "./kit";

interface AddQuickMenuProps {
  open: boolean;
  onClose: () => void;
}

interface MenuRow {
  id: string;
  label: string;
  description: string;
  onClick: () => void;
}

function MenuButton({ row }: { row: MenuRow }) {
  return (
    <button
      type="button"
      onClick={row.onClick}
      className="flex w-full cursor-pointer flex-col items-start gap-[2px] rounded-[10px] border-none px-[12px] py-[10px] text-left transition-colors"
      style={{ background: "transparent" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = CHROME.paper2;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span className="text-[13px] font-semibold tracking-[-0.01em]" style={{ color: CHROME.ink }}>
        {row.label}
      </span>
      <span className="text-[11px] leading-snug" style={{ color: CHROME.muted }}>
        {row.description}
      </span>
    </button>
  );
}

export function AddQuickMenu({ open, onClose }: AddQuickMenuProps) {
  const ctx = useEditContext();
  const slotKey = defaultSectionAddSlot(ctx.slotDefs, ctx.slots);

  const primary: MenuRow[] = [
    {
      id: "section",
      label: "Add section",
      description: "Browse curated sections for this page",
      onClick: () => {
        onClose();
        ctx.openLibrary({ slotKey, insertAfterSortOrder: null });
      },
    },
    {
      id: "element",
      label: "Add element",
      description: "Heading, paragraph, button, image, and more",
      onClick: () => {
        onClose();
        ctx.openPickerPopover({ slotKey, insertAfterSortOrder: null }, 88, 120);
      },
    },
    {
      id: "page",
      label: "Add page",
      description: "Create a new draft page",
      onClick: () => {
        onClose();
        ctx.openAllPagesPanel();
      },
    },
    {
      id: "media",
      label: "Add media",
      description: "Open the asset library",
      onClick: () => {
        onClose();
        ctx.openAssets();
      },
    },
    {
      id: "form",
      label: "Add form",
      description: "Insert a form block on the canvas",
      onClick: () => {
        onClose();
        void ctx.insertBuilderNode(null, "form");
      },
    },
    {
      id: "tulala",
      label: "Add Tulala component",
      description: "Featured talent, hero, gallery, and more",
      onClick: () => {
        onClose();
        ctx.openLibrary({ slotKey, insertAfterSortOrder: null });
      },
    },
  ];

  const resources: MenuRow[] = [
    {
      id: "assets",
      label: "Asset library",
      description: "Browse uploaded images and files",
      onClick: () => {
        onClose();
        ctx.openAssets();
      },
    },
    {
      id: "collections",
      label: "Collections",
      description: "Reusable content collections",
      onClick: () => {
        onClose();
        ctx.openCollections();
      },
    },
    {
      id: "templates",
      label: "Template gallery",
      description: "Starter page templates",
      onClick: () => {
        onClose();
        ctx.openStarterTemplateGallery();
      },
    },
  ];

  return (
    <DockFloatingPanel
      panelId="add-menu"
      title="Quick add"
      open={open}
      onClose={onClose}
      width={300}
      testId="add-quick-menu"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-[6px] py-[8px]">
        <div
          className="px-[8px] pb-[4px] pt-[2px] text-[10px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: CHROME.muted }}
        >
          Quick add
        </div>
        {primary.map((row) => (
          <MenuButton key={row.id} row={row} />
        ))}
        <div
          aria-hidden
          className="my-[6px] h-px"
          style={{ background: CHROME.line, marginLeft: 8, marginRight: 8 }}
        />
        <div
          className="px-[8px] pb-[4px] text-[10px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: CHROME.muted }}
        >
          Resources
        </div>
        {resources.map((row) => (
          <MenuButton key={row.id} row={row} />
        ))}
      </div>
    </DockFloatingPanel>
  );
}
