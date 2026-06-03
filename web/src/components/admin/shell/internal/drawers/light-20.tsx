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

// Phase 1d (remediation §4): 7 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function BriefBuilderDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "brief-builder";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Brief builder"
      description="Draft a brief and pre-fill an inquiry."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="info"
        title="Coming soon"
        body="The brief builder isn't live yet — create inquiries directly for now."
      />
    </DrawerShell>
  );
}


export function BrandAssetsDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "brand-assets";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Brand assets"
      description="Shared logos, photos and documents."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="mail"
        title="Coming soon"
        body="A shared brand-asset library isn't available yet."
      />
    </DrawerShell>
  );
}


export function ApprovalFlowDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "approval-flow";
  // Honest stub — this feature has no backend yet; the previous body showed
  // hardcoded demo data. Surface a clear "coming soon" instead.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Approval queue"
      description="Briefs, offers, and documents waiting for sign-off."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="info"
        title="Coming soon"
        body="A unified approval queue isn't live yet \u2014 briefs and offers are approved inside each inquiry for now."
      />
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-27 — Site & page-builder management
// ════════════════════════════════════════════════════════════════════


export function SiteContextSwitcherDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "site-context-switcher";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Site context"
      description="Switch between your web properties."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="info"
        title="Coming soon"
        body="Switching between site contexts isn't available yet."
      />
    </DrawerShell>
  );
}


export function PageSchedulerDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "page-scheduler";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Page scheduler"
      description="Schedule pages to publish or archive."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="calendar"
        title="Coming soon"
        body="Scheduled publishing isn't available yet."
      />
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-28 — Casting director
// ════════════════════════════════════════════════════════════════════


export function CastingFlowDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "casting-flow";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Casting flow"
      description="Set up casting rounds and shortlists."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="info"
        title="Coming soon"
        body="Multi-round casting setup isn't available yet."
      />
    </DrawerShell>
  );
}


export function CallbackTrackerDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "callback-tracker";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Callback tracker"
      description="Track talent across callback rounds."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="user"
        title="Coming soon"
        body="Callback tracking isn't available yet."
      />
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-29 — Production team & multi-discipline bookings
// ════════════════════════════════════════════════════════════════════

