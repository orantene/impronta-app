"use client";

/**
 * ContextDrawer: the same context panel as a right drawer at 1024-1279
 * (board D11), opened by the header "Details" button L2's `ThreadHeader`
 * renders. Kit `Sheet` (desktop variant, 360-equivalent width — the kit's
 * narrowest desktop width is 520, which this uses since the mockup's 360
 * drawer is inside the kit's own frame, not a separate width token) with
 * close on Esc/outside (built into `Sheet`).
 */

import "../kit/tokens.css";
import { Sheet } from "../kit/Sheet";

import { ContextPanel } from "./ContextPanel";
import type { ContextPanelProps } from "./contracts";

export type ContextDrawerProps = ContextPanelProps & {
  readonly open: boolean;
  readonly onClose: () => void;
};

export function ContextDrawer(props: ContextDrawerProps) {
  const { open, copy, onClose, essentials } = props;
  return (
    <Sheet open={open} title={essentials?.name || copy.state.noIdentity} copy={copy} onClose={onClose} variant="desktop" width={520}>
      <ContextPanel {...props} />
    </Sheet>
  );
}
