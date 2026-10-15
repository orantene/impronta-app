"use client";

import { useState } from "react";

export type RefundConfirmLabels = {
  /** Step 1 button, e.g. "Refund". */
  refund: string;
  /** Step 2 button, e.g. "Confirm refund". */
  confirm: string;
  cancel: string;
};

export type RefundConfirmButtonProps = {
  /** Pre-formatted amount the tap will return, shown on step 2. */
  amountLabel: string;
  labels: RefundConfirmLabels;
  busy?: boolean;
  onConfirm: () => void;
};

/**
 * Two-step refund control (TUL-790): the first tap only arms it and shows the
 * amount; the second tap is the one that calls `onConfirm`.
 */
export function RefundConfirmButton({ amountLabel, labels, busy, onConfirm }: RefundConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" className="rounded-md border px-3 py-1.5 text-sm" onClick={() => setArmed(true)}>
        {labels.refund}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2" data-refund-armed="true">
      <span className="text-sm font-medium">{amountLabel}</span>
      <button
        type="button"
        disabled={busy}
        className="rounded-md border px-3 py-1.5 text-sm font-medium"
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {labels.confirm}
      </button>
      <button type="button" className="text-sm" onClick={() => setArmed(false)}>
        {labels.cancel}
      </button>
    </span>
  );
}
