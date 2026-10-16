"use client";

/**
 * Staged progress under the code boxes while the confirm action runs (TUL-769).
 * Never a dead screen: stage label (aria-live) plus a moving bar.
 */

import { useEffect, useState } from "react";

import {
  verifyProgressPercent,
  verifyStageAt,
} from "@/lib/auth/verify-stage";

export function VerifyProgress({
  active,
  labels,
}: {
  active: boolean;
  /** Three stage labels, in order. */
  labels: readonly [string, string, string];
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt), 250);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active) return null;
  const percent = verifyProgressPercent(elapsed);
  return (
    <div className="space-y-2" data-testid="verify-progress">
      <p
        role="status"
        aria-live="polite"
        className="text-center text-[0.8125rem]"
        style={{ color: "var(--plt-muted)" }}
      >
        {labels[verifyStageAt(elapsed)]}
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={labels[verifyStageAt(elapsed)]}
        className="h-1 w-full overflow-hidden rounded-full"
        style={{ background: "var(--plt-hairline-strong)" }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%`, background: "var(--plt-forest)" }}
        />
      </div>
    </div>
  );
}
