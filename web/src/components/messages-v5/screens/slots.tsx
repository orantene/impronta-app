"use client";

/**
 * The shell's pane slots. Each export takes exactly its contract props
 * (`contracts.ts`); today it forwards to the L2 placeholder, and the
 * integrator points it at the lane's component when that lane lands:
 *
 *   L1  Inbox                                → screens/Inbox.tsx
 *   L3  ContextPanel, DetailsSheet, ClientSheet → screens/ContextPanel.tsx ...
 *   L4  HistorySheet, TasksTray, RenameInline, MergeCard → screens/*.tsx
 *
 * Swapping is one import per line; the shell does not change.
 */

import { useMemo } from "react";

import { useT } from "@/i18n/use-t";

import type { ClientSheetProps, ContextPanelProps, DetailsSheetProps, HistorySheetProps, InboxProps, RenameInlineProps, TasksTrayProps } from "./contracts";
import { buildShellCopy, type ShellCopy } from "./copy";
import { ClientSheetPlaceholder, ContextPanelPlaceholder, DetailsSheetPlaceholder, HistorySheetPlaceholder, InboxPlaceholder, RenameInlinePlaceholder, TasksTrayPlaceholder } from "./placeholders";

export { ComingSheet } from "./placeholders";

export function useShellCopy(): ShellCopy {
  const t = useT();
  return useMemo(() => buildShellCopy(t), [t]);
}

export function Inbox(props: InboxProps) {
  return <InboxPlaceholder {...props} shell={useShellCopy()} />;
}

export function ContextPanel(props: ContextPanelProps) {
  return <ContextPanelPlaceholder {...props} shell={useShellCopy()} />;
}

export function DetailsSheet(props: DetailsSheetProps) {
  return <DetailsSheetPlaceholder {...props} shell={useShellCopy()} />;
}

export function ClientSheet(props: ClientSheetProps) {
  return <ClientSheetPlaceholder {...props} shell={useShellCopy()} />;
}

export function HistorySheet(props: HistorySheetProps & { readonly locale?: string }) {
  return <HistorySheetPlaceholder {...props} shell={useShellCopy()} />;
}

export function TasksTray(props: TasksTrayProps) {
  return <TasksTrayPlaceholder {...props} shell={useShellCopy()} />;
}

export function RenameInline(props: RenameInlineProps) {
  return <RenameInlinePlaceholder {...props} shell={useShellCopy()} />;
}
