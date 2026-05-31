"use client";

import { useEffect, useState } from "react";
import { subscribeWorkspaceFieldOverride } from "./field-catalog";

/** React hook — components reading the merged catalog call this to
 *  re-render whenever any override changes. */
export function useWorkspaceFieldOverrideSubscription(): void {
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = subscribeWorkspaceFieldOverride(() => force(n => n + 1));
    return unsub;
  }, []);
}
