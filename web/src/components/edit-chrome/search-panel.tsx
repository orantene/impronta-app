"use client";

/**
 * SearchPanel — dock-launched search surface sharing ⌘K command palette logic.
 *
 * Renders CommandPalette in embedded mode inside a left floating panel.
 * ⌘K continues to open the centred modal overlay for keyboard power users.
 */

import { CommandPalette } from "./command-palette";
import { DockFloatingPanel } from "./dock-floating-panel";

interface SearchPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SearchPanel({ open, onClose }: SearchPanelProps) {
  return (
    <DockFloatingPanel
      panelId="search"
      title="Search"
      open={open}
      onClose={onClose}
      width={360}
      testId="search-panel"
    >
      <CommandPalette
        open={open}
        onClose={onClose}
        embedded
        placeholder="Search pages, sections, layers, classes…"
      />
    </DockFloatingPanel>
  );
}
