"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";

import { useEditContext } from "./edit-context";
import type { UseFloatingDragOptions } from "./floating-panel";
import {
  panelOffsetToDockFlushLeft,
  shouldDockPanelToCommandDock,
} from "./command-dock-rail-dock";
import type { PanelOffset } from "./workspace-layout";

type CommandDockCouplingPanelId = "command-dock" | string;

function resolveActiveCommandDockPanelId(input: {
  navigatorOpen: boolean;
  searchPanelOpen: boolean;
  allPagesPanelOpen: boolean;
  brandPanelOpen: boolean;
  addMenuOpen: boolean;
}): string | null {
  if (input.navigatorOpen) return "navigator";
  if (input.searchPanelOpen) return "search";
  if (input.allPagesPanelOpen) return "all-pages";
  if (input.brandPanelOpen) return "brand";
  if (input.addMenuOpen) return "add-menu";
  return null;
}

type PanelOffsetSetter = (
  next: PanelOffset | ((prev: PanelOffset) => PanelOffset),
) => void;

export function useCommandDockCoupling(
  panelId: CommandDockCouplingPanelId,
  panelSetOffsetRef?: MutableRefObject<PanelOffsetSetter | null>,
) {
  const {
    navigatorOpen,
    searchPanelOpen,
    allPagesPanelOpen,
    brandPanelOpen,
    addMenuOpen,
    commandDockDocked,
    setCommandDockDocked,
    applyWorkspacePanelOffsetDelta,
    getWorkspacePanelRect,
    setWorkspacePanelOffset,
    getWorkspacePanelOffset,
  } = useEditContext();

  const activePanelId = resolveActiveCommandDockPanelId({
    navigatorOpen,
    searchPanelOpen,
    allPagesPanelOpen,
    brandPanelOpen,
    addMenuOpen,
  });
  const commandDockPanelOpen = activePanelId !== null;

  const applyActivePanelOffset = useCallback(
    (next: PanelOffset | ((prev: PanelOffset) => PanelOffset)) => {
      if (!activePanelId) return;
      if (activePanelId === panelId && panelSetOffsetRef?.current) {
        panelSetOffsetRef.current(next);
        return;
      }
      const resolved =
        typeof next === "function"
          ? next(getWorkspacePanelOffset(activePanelId) ?? { x: 0, y: 0 })
          : next;
      setWorkspacePanelOffset(activePanelId, resolved);
    },
    [
      activePanelId,
      getWorkspacePanelOffset,
      panelId,
      panelSetOffsetRef,
      setWorkspacePanelOffset,
    ],
  );

  const tryDock = useCallback(() => {
    if (!activePanelId) {
      setCommandDockDocked(false);
      return false;
    }
    const panelRect = getWorkspacePanelRect(activePanelId);
    const dockRect = getWorkspacePanelRect("command-dock");
    if (!panelRect || !dockRect) return false;
    if (!shouldDockPanelToCommandDock(panelRect, dockRect)) {
      setCommandDockDocked(false);
      return false;
    }
    const current = getWorkspacePanelOffset(activePanelId) ?? { x: 0, y: 0 };
    const next = panelOffsetToDockFlushLeft({
      panelRect,
      dockRect,
      currentOffset: current,
    });
    applyActivePanelOffset(next);
    setCommandDockDocked(true);
    return true;
  }, [
    activePanelId,
    applyActivePanelOffset,
    getWorkspacePanelOffset,
    getWorkspacePanelRect,
    setCommandDockDocked,
  ]);

  const initialDockRef = useRef(false);
  useEffect(() => {
    if (initialDockRef.current) return;
    initialDockRef.current = true;
    const id = window.setTimeout(() => {
      tryDock();
    }, 160);
    return () => window.clearTimeout(id);
  }, [tryDock]);

  useEffect(() => {
    if (!commandDockPanelOpen) {
      setCommandDockDocked(false);
      return;
    }
    const id = window.setTimeout(() => {
      tryDock();
    }, 120);
    return () => window.clearTimeout(id);
  }, [commandDockPanelOpen, activePanelId, tryDock, setCommandDockDocked]);

  const dragOptions = useMemo((): UseFloatingDragOptions => {
    if (panelId === "command-dock") {
      return {
        panelId,
        onDragMove: (_offset, delta) => {
          if (!commandDockDocked || !activePanelId) return;
          applyWorkspacePanelOffsetDelta(activePanelId, delta);
        },
        onDragEnd: () => {
          if (commandDockDocked) {
            tryDock();
          }
        },
      };
    }

    return {
      panelId,
      onDragStart: () => {
        setCommandDockDocked(false);
      },
      onDragMove: () => {
        setCommandDockDocked(false);
      },
      onDragEnd: () => {
        tryDock();
      },
    };
  }, [
    activePanelId,
    applyWorkspacePanelOffsetDelta,
    commandDockDocked,
    panelId,
    setCommandDockDocked,
    tryDock,
  ]);

  return {
    dragOptions,
    commandDockDocked: commandDockDocked && commandDockPanelOpen,
    tryDock,
  };
}
