"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  COLORS,
  CapsLabel,
  DrawerShell,
  EmptyState,
  FONTS,
  FieldRow,
  GhostButton,
  Icon,
  RADIUS,
  SecondaryButton,
  TRANSITION,
  TextArea,
  TextInput,
  useAdminShell
} from "./drawer-shared";
import { useDashboardText } from "../dashboard-i18n";

// Phase 1d (remediation §4): 7 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).


export function BrandAssetsDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const open = state.drawer.drawerId === "brand-assets";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={tt("Brand assets")}
      description={tt("Shared logos, photos and documents.")}
      footer={<SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>}
    >
      <EmptyState
        icon="mail"
        title={tt("Coming soon")}
        body={tt("A shared brand-asset library isn't available yet.")}
      />
    </DrawerShell>
  );
}


// ════════════════════════════════════════════════════════════════════
// WS-27 — Site & page-builder management
// ════════════════════════════════════════════════════════════════════


export function SiteContextSwitcherDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const open = state.drawer.drawerId === "site-context-switcher";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={tt("Site context")}
      description={tt("Switch between your web properties.")}
      footer={<SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>}
    >
      <EmptyState
        icon="info"
        title={tt("Coming soon")}
        body={tt("Switching between site contexts isn't available yet.")}
      />
    </DrawerShell>
  );
}


export function PageSchedulerDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const open = state.drawer.drawerId === "page-scheduler";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={tt("Page scheduler")}
      description={tt("Schedule pages to publish or archive.")}
      footer={<SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>}
    >
      <EmptyState
        icon="calendar"
        title={tt("Coming soon")}
        body={tt("Scheduled publishing isn't available yet.")}
      />
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-28 — Casting director
// ════════════════════════════════════════════════════════════════════



// ════════════════════════════════════════════════════════════════════
// WS-29 — Production team & multi-discipline bookings
// ════════════════════════════════════════════════════════════════════

