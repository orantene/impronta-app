"use client";

import { useEffect, useRef, useState } from "react";

import { hasAge18Confirmation } from "@/lib/onboarding/age-gate";
import type { ResumeSnapshot } from "@/lib/onboarding/module-state";

/**
 * TUL-1847: the 18+ tick made on the "ready to build" step is stored on the brief
 * (`age18ConfirmedAt`), but the screen kept it only in React state. After a reload and
 * "Bienvenido de nuevo > Continuar", the email step had forgotten it and fell back to the
 * combined "Tengo 18 años o más y acepto los Términos" box, unticked.
 *
 * True when the person CONTINUED the saved draft (the snapshot is gone and the machine now
 * owns that brief) and the draft carries the confirmation. Starting fresh clears the brief id,
 * so a fresh start never inherits the old tick.
 */
export function restoredAge18(
  snapshot: Pick<ResumeSnapshot, "briefId" | "state"> | null,
  currentBriefId: string | null,
): boolean {
  return Boolean(snapshot?.briefId) && snapshot?.briefId === currentBriefId && hasAge18Confirmation(snapshot?.state?.age18ConfirmedAt);
}

export function useAge18Confirmed(resume: ResumeSnapshot | null, briefId: string | null) {
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const seen = useRef<ResumeSnapshot | null>(null);
  useEffect(() => {
    if (resume) {
      seen.current = resume;
      return;
    }
    if (seen.current && restoredAge18(seen.current, briefId)) setAgeConfirmed(true);
    seen.current = null;
  }, [resume, briefId]);
  return { ageConfirmed, setAgeConfirmed };
}
