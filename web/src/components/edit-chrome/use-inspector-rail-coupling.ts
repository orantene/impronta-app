"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { useEditContext } from "./edit-context";
import type { UseFloatingDragOptions } from "./floating-panel";
import {
  inspectorOffsetToDockFlush,
  shouldDockInspectorToRail,
} from "./inspector-rail-dock";

type InspectorCouplingPanelId = "inspector" | "inspector-rail";

export function useInspectorRailCoupling(panelId: InspectorCouplingPanelId) {
  const {
    inspectorDockOpen,
    inspectorRailDocked,
    setInspectorRailDocked,
    applyWorkspacePanelOffsetDelta,
    getWorkspacePanelRect,
    setWorkspacePanelOffset,
    getWorkspacePanelOffset,
  } = useEditContext();

  const tryDock = useCallback(() => {
    const inspectorRect = getWorkspacePanelRect("inspector");
    const railRect = getWorkspacePanelRect("inspector-rail");
    if (!inspectorRect || !railRect) return false;
    if (!shouldDockInspectorToRail(inspectorRect, railRect)) {
      setInspectorRailDocked(false);
      return false;
    }
    const current = getWorkspacePanelOffset("inspector") ?? { x: 0, y: 0 };
    const next = inspectorOffsetToDockFlush({
      inspectorRect,
      railRect,
      currentOffset: current,
    });
    setWorkspacePanelOffset("inspector", next);
    setInspectorRailDocked(true);
    return true;
  }, [
    getWorkspacePanelOffset,
    getWorkspacePanelRect,
    setInspectorRailDocked,
    setWorkspacePanelOffset,
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
    if (!inspectorDockOpen) return;
    const id = window.setTimeout(() => {
      tryDock();
    }, 120);
    return () => window.clearTimeout(id);
  }, [inspectorDockOpen, tryDock]);

  const dragOptions = useMemo((): UseFloatingDragOptions => {
    if (panelId === "inspector-rail") {
      return {
        panelId,
        onDragMove: (_offset, delta) => {
          if (!inspectorRailDocked) return;
          applyWorkspacePanelOffsetDelta("inspector", delta);
        },
        onDragEnd: () => {
          if (inspectorRailDocked) {
            tryDock();
          }
        },
      };
    }

    return {
      panelId,
      onDragStart: () => {
        setInspectorRailDocked(false);
      },
      onDragMove: () => {
        setInspectorRailDocked(false);
      },
      onDragEnd: () => {
        tryDock();
      },
    };
  }, [
    applyWorkspacePanelOffsetDelta,
    inspectorRailDocked,
    panelId,
    setInspectorRailDocked,
    tryDock,
  ]);

  return { dragOptions, inspectorRailDocked, tryDock };
}
