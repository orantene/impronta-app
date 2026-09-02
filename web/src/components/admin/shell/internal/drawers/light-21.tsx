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
  Plan,
  RADIUS,
  SecondaryButton,
  TextInput,
  Toggle,
  downloadCsv,
  openSupportEmail,
  useAdminShell
} from "./drawer-shared";
import { useDashboardText } from "../dashboard-i18n";

// Phase 1d (remediation §4): 9 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).


// ════════════════════════════════════════════════════════════════════
// WS-30 — Image rights & post-booking lifecycle
// ════════════════════════════════════════════════════════════════════



// ════════════════════════════════════════════════════════════════════
// WS-31 — Account lifecycle
// ════════════════════════════════════════════════════════════════════



export function MinorAccountDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const open = state.drawer.drawerId === "minor-account";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={tt("Minor account")}
      description={tt("Guardian consent for under-18 talent.")}
      footer={<SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>}
    >
      <EmptyState
        icon="user"
        title={tt("Coming soon")}
        body={tt("Guardian / minor-account records aren't available yet.")}
      />
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-32 — Discovery & marketplace
// ════════════════════════════════════════════════════════════════════



// ════════════════════════════════════════════════════════════════════
// WS-33 — On-set / production-day live
// ════════════════════════════════════════════════════════════════════


