"use client";

/**
 * DockFloatingPanel — shared chrome for left-dock-launched floating panels.
 *
 * Matches the mockup's Page Structure / Search / All Pages panels: white card,
 * grip handle, title row with close X, body scroll region. Anchored to the
 * right of the CommandDock via COMMAND_DOCK_PANEL_INSET_PX.
 */

import { useLayoutEffect, useRef, type DragEvent, type ReactNode } from "react";

import { COMMAND_DOCK_PANEL_INSET_PX } from "./command-dock";
import { useFloatingDrag } from "./floating-panel";
import { useEditContext } from "./edit-context";
import { useCommandDockCoupling } from "./use-command-dock-coupling";
import {
  COMMAND_DOCK_CHROME_TOP_PX,
  COMMAND_DOCK_PANEL_MAX_HEIGHT,
  FloatingPanelHeader,
  FloatingPanelShell,
  floatingPanelBoxShadow,
  Z_INDEX,
} from "./kit";

/** Subset of {@link useFloatingDrag} return for panels that manage their own hook. */
export type FloatingDragBinding = ReturnType<typeof useFloatingDrag>;

export interface DockFloatingPanelProps {
  panelId: string;
  title: string;
  open: boolean;
  onClose: () => void;
  width?: number;
  tabs?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  testId?: string;
  /** id on the title `<h2>` for `aria-labelledby`. */
  titleId?: string;
  closeAriaLabel?: string;
  /** Extra controls in the header row (before close). */
  headerExtra?: ReactNode;
  /** Slot below grip (e.g. navigator width resize rail). */
  afterHandle?: ReactNode;
  onDragLeave?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  /** Reuse an existing drag binding (navigator width + pin share one hook). */
  floatingDrag?: FloatingDragBinding;
  zIndex?: number;
  dataEditOverlay?: string;
}

type ShellProps = Omit<DockFloatingPanelProps, "floatingDrag"> & {
  floatingDrag: FloatingDragBinding;
  dockedToRail: boolean;
};

function DockFloatingPanelShell({
  panelId,
  title,
  open,
  onClose,
  width = 320,
  tabs,
  footer,
  children,
  testId,
  titleId,
  closeAriaLabel,
  headerExtra,
  afterHandle,
  onDragLeave,
  onDrop,
  onDragOver,
  floatingDrag,
  dockedToRail,
  zIndex = Z_INDEX.panels,
  dataEditOverlay,
}: ShellProps) {
  const moved = floatingDrag.offset.x !== 0 || floatingDrag.offset.y !== 0;

  if (!open) return null;

  const resolvedTitleId = titleId ?? `${panelId}-title`;

  return (
    <FloatingPanelShell
      panelId={panelId}
      side="left"
      width={width}
      open={open}
      testId={testId}
      showDragStrip={false}
      setPanelNode={floatingDrag.setPanelNode}
      transform={floatingDrag.transform}
      dragging={floatingDrag.dragging}
      onHandlePointerDown={floatingDrag.onHandlePointerDown}
      moved={moved}
      onReset={floatingDrag.reset}
      dataEditDrawer={panelId}
      dataEditOverlay={dataEditOverlay}
      ariaLabelledBy={resolvedTitleId}
      zIndex={zIndex}
      afterHandle={afterHandle}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragOver={onDragOver}
      header={
        <FloatingPanelHeader
          titleId={resolvedTitleId}
          title={title}
          onPointerDown={floatingDrag.onHandlePointerDown}
          dragging={floatingDrag.dragging}
          moved={moved}
          onReset={floatingDrag.reset}
          onClose={onClose}
          closeAriaLabel={closeAriaLabel}
          headerExtra={headerExtra}
          titleRowBorder={!tabs}
        />
      }
      tabs={tabs}
      footer={footer}
      dockRailSide="left"
      dockedToRail={dockedToRail}
      style={{
        left: COMMAND_DOCK_PANEL_INSET_PX,
        top: COMMAND_DOCK_CHROME_TOP_PX,
        maxHeight: COMMAND_DOCK_PANEL_MAX_HEIGHT,
        boxShadow: floatingPanelBoxShadow(floatingDrag.dragging),
      }}
    >
      {children}
    </FloatingPanelShell>
  );
}

function DockFloatingPanelOwned(props: Omit<DockFloatingPanelProps, "floatingDrag">) {
  const panelSetOffsetRef = useRef<
    ReturnType<typeof useFloatingDrag>["setOffset"] | null
  >(null);
  const { dragOptions, commandDockDocked } = useCommandDockCoupling(
    props.panelId,
    panelSetOffsetRef,
  );
  const floatingDrag = useFloatingDrag({ panelId: props.panelId, ...dragOptions });
  useLayoutEffect(() => {
    panelSetOffsetRef.current = floatingDrag.setOffset;
  });
  return (
    <DockFloatingPanelShell
      {...props}
      floatingDrag={floatingDrag}
      dockedToRail={commandDockDocked && props.open}
    />
  );
}

function DockFloatingPanelExternal(
  props: Omit<DockFloatingPanelProps, "floatingDrag"> & {
    floatingDrag: FloatingDragBinding;
  },
) {
  const { commandDockDocked } = useEditContext();
  return (
    <DockFloatingPanelShell
      {...props}
      dockedToRail={commandDockDocked && props.open}
    />
  );
}

export function DockFloatingPanel({
  floatingDrag: floatingDragProp,
  ...props
}: DockFloatingPanelProps) {
  if (floatingDragProp) {
    return (
      <DockFloatingPanelExternal {...props} floatingDrag={floatingDragProp} />
    );
  }
  return <DockFloatingPanelOwned {...props} />;
}
