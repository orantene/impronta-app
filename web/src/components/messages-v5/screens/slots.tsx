"use client";

/**
 * The shell's pane slots (L2; wired in wave A, D-MSG-110). Each export takes
 * exactly its contract props (`contracts.ts`) and mounts the lane's component:
 *
 *   L1  Inbox                                          → ./Inbox
 *   L3  ContextPanel, ContextDrawer, DetailsSheet, ClientSheet → ./ContextPanel ...
 *   L4  HistorySheet, TasksTray, RenameInline, MergeCard → ./HistorySheet ...
 *
 * `ContextPanel` is the one slot that adds markup: the shell's grid
 * (`shell/shell.css`) addresses the third column as `.msgs > .pane.panel`,
 * and L3's panel is a plain block (it is also mounted inside the drawer's
 * kit Sheet), so the column slot wraps it in that pane element. The
 * "Coming in this program" sheet is the shell's own and lives here.
 */

import { useMemo } from "react";

import { useT } from "@/i18n/use-t";

import type { KitCopy } from "../kit/copy";
import { Btn } from "../kit/primitives";
import { Sheet } from "../kit/Sheet";
import type { ContextPanelProps } from "./contracts";
import { ContextPanel as ContextPanelL3 } from "./ContextPanel";
import { buildShellCopy, type ShellCopy } from "./copy";

export { Inbox } from "./Inbox";
export { ContextDrawer } from "./ContextDrawer";
export { DetailsSheet } from "./DetailsSheet";
export { ClientSheet } from "./ClientSheet";
export { HistorySheet } from "./HistorySheet";
export { TasksTray } from "./TasksTray";
export { RenameInline } from "./RenameInline";
export { MergeCard } from "./MergeCard";

export function useShellCopy(): ShellCopy {
  const t = useT();
  return useMemo(() => buildShellCopy(t), [t]);
}

/** The third column (≥1280): L3's panel inside the grid's `.pane.panel` cell. */
export function ContextPanel(props: ContextPanelProps) {
  return (
    <section className="pane panel" data-context-panel-column aria-label={props.copy.thread.details}>
      <ContextPanelL3 {...props} />
    </section>
  );
}

/* ------------------------------------------------------------ coming sheet */

export function ComingSheet({ open, onClose, copy, shell, variant, seam }: { open: boolean; onClose: () => void; copy: KitCopy; shell: ShellCopy; variant: "desktop" | "mobile"; seam: string | null }) {
  return (
    <Sheet
      open={open}
      title={shell.comingTitle}
      copy={copy}
      onClose={onClose}
      variant={variant === "mobile" ? "mobile-h60" : "desktop"}
      footer={
        <Btn size="lg" variant="primary" onClick={onClose} data-coming-ok>
          {shell.comingOk}
        </Btn>
      }
    >
      <p className="sheet-note" data-coming-seam={seam ?? ""}>
        {shell.comingBody}
      </p>
    </Sheet>
  );
}
