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
  TextInput,
  Toggle,
  useAdminShell
} from "./drawer-shared";

// Phase 1d (remediation §4): 6 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function TopPerformersDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "top-performers";
  // Honest stub — per-talent / per-client revenue rankings need a real
  // analytics aggregation that isn't wired yet. Showing fabricated revenue
  // (e.g. "Marta Reyes €28,400") would misrepresent business numbers.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Top performers"
      description="Talent and client rankings by booking revenue."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
      defaultSize="half"
    >
      <EmptyState
        icon="sparkle"
        title="Coming soon"
        body="Revenue-ranked talent and client leaderboards aren't live yet. They'll appear here once booking analytics are wired up."
      />
    </DrawerShell>
  );
}


export function CoordinatorWorkloadDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "coordinator-workload";
  // Honest stub — per-coordinator load / reply-time metrics have no real
  // source yet; the old hardcoded percentages (e.g. "Oran 85%") were demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Team workload"
      description="Active load, messages, and reply time per coordinator."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
      defaultSize="half"
    >
      <EmptyState
        icon="team"
        title="Coming soon"
        body="Per-coordinator workload and response-time analytics aren't live yet. We'll surface them here once the data is tracked."
      />
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-20 — Operations & workflow automation drawers
// ════════════════════════════════════════════════════════════════════


export function MyQueueDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "my-queue";
  // Honest stub — this feature has no backend yet; the previous body showed
  // hardcoded demo data. Surface a clear "coming soon" instead.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="My queue"
      description="Your assigned inquiries, sorted by urgency."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="info"
        title="Coming soon"
        body="Your personal, SLA-ranked work queue isn't live yet. For now, your inquiries live in Messages and the Pipeline view."
      />
    </DrawerShell>
  );
}


export function SlaTimersDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "sla-timers";
  // Honest stub — this feature has no backend yet; the previous body showed
  // hardcoded demo data. Surface a clear "coming soon" instead.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="SLA timers"
      description="Response deadlines across active inquiries."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="calendar"
        title="Coming soon"
        body="Response-deadline (SLA) tracking isn't live yet. Inquiry age is shown in Messages and the Pipeline in the meantime."
      />
    </DrawerShell>
  );
}


export function RulesBuilderDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "rules-builder";
  // Honest stub — this feature has no backend yet; the previous body showed
  // hardcoded demo data. Surface a clear "coming soon" instead.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Automation rules"
      description="Trigger-action rules that run automatically."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="info"
        title="Coming soon"
        body="Automation rules (trigger \u2192 action) aren't available yet. We'll add a rule builder here when it ships."
      />
    </DrawerShell>
  );
}


export function SavedRepliesDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "saved-replies";
  // Honest stub — this feature has no backend yet; the previous body showed
  // hardcoded demo data. Surface a clear "coming soon" instead.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Saved replies"
      description="Reusable message templates."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="mail"
        title="Coming soon"
        body="Reusable reply templates aren't available yet \u2014 we'll add them here so you can insert and edit canned responses."
      />
    </DrawerShell>
  );
}

