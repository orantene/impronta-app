"use client";

import * as React from "react";

import type { Plan } from "./capability-catalog";

/**
 * UpgradeModalContext — shared open-state for the "Choose your plan"
 * modal. Provider lives in the admin shell so any admin surface
 * (tier-chip in the topbar, locked card drawers, tier-band CTAs) can
 * open the same modal.
 *
 * THE MODAL THIS DRIVES IS THE ONLY UPGRADE MODAL. There used to be a
 * second one (`shell/internal/drawers/UpgradeModal.tsx`) whose primary CTA
 * called a `useState` plan setter and toasted "upgrade applied" — nothing
 * was written to the database and nothing was charged. It was deleted; every
 * contextual prompt now routes here, and here goes to Stripe Checkout via
 * `startWorkspaceUpgrade`.
 */

/**
 * Why the modal was opened. Contextual prompts (locked cards, the domain
 * step, the media gallery upsell) name the feature that was blocked and the
 * tier that unlocks it, so the modal can say "Custom domain needs Agency"
 * instead of opening a bare plan picker.
 */
export type UpgradeReason = {
  /** Tier the blocked feature needs. Highlighted in the plan grid. */
  requiredPlan?: Plan;
  /** Feature that prompted the upgrade, already translated by the caller. */
  feature?: string;
  /** One-line justification, already translated by the caller. */
  why?: string;
};

type Ctx = {
  open: boolean;
  /** Context for the current open, or null when opened from a generic entry point. */
  reason: UpgradeReason | null;
  /** Open the plan modal, optionally framed by the feature that was blocked. */
  openUpgrade: (reason?: UpgradeReason | null) => void;
  setOpen: (open: boolean) => void;
};

const UpgradeModalContext = React.createContext<Ctx | null>(null);

export function UpgradeModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<UpgradeReason | null>(null);

  const openUpgrade = React.useCallback((next?: UpgradeReason | null) => {
    setReason(next ?? null);
    setOpen(true);
  }, []);

  const setOpenAndClearReason = React.useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setReason(null);
  }, []);

  const value = React.useMemo(
    () => ({ open, reason, openUpgrade, setOpen: setOpenAndClearReason }),
    [open, reason, openUpgrade, setOpenAndClearReason],
  );
  return (
    <UpgradeModalContext.Provider value={value}>
      {children}
    </UpgradeModalContext.Provider>
  );
}

/**
 * Returns the modal state. Safe to call from any descendant of provider.
 *
 * Outside the provider the setters are inert, which is how a contextual
 * upgrade CTA can go quietly dead. That is exactly what happened to the
 * previous mount, so `upgrade-flow-wiring.static.test.ts` asserts the
 * provider actually wraps the live shell rather than trusting this comment.
 */
export function useUpgradeModal(): Ctx {
  const ctx = React.useContext(UpgradeModalContext);
  if (!ctx) {
    return {
      open: false,
      reason: null,
      openUpgrade: () => {
        /* no-op when outside provider */
      },
      setOpen: () => {
        /* no-op when outside provider */
      },
    };
  }
  return ctx;
}
