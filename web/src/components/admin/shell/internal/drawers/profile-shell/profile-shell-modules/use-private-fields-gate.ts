"use client";

import { useCallback, useRef, useState } from "react";
import { omitUnlessLoaded, PRIVATE_IDENTITY_PAYLOAD_KEYS } from "@/lib/talent/private-fields";

/**
 * TUL-1269: tracks whether the editor hydration loaded phone / date_of_birth /
 * legal_name. Until then (or when the load failed) the save omits those keys so
 * it can never write blanks over real values; `unavailable` drives the identity
 * editor's disabled inputs + note once hydration finished WITHOUT them.
 */
export function usePrivateFieldsGate() {
  const loadedRef = useRef(false);
  const [unavailable, setUnavailable] = useState(false);
  /** Record the hydrated editor payload's flag; returns the payload unchanged. */
  const markHydrated = useCallback(<D extends object>(d: D): D => {
    loadedRef.current = (d as { private_fields_available?: boolean }).private_fields_available === true;
    setUnavailable(!loadedRef.current);
    return d;
  }, []);
  /** Drop the private identity keys from a save payload unless they were loaded. */
  const scrub = <T extends Record<string, unknown>>(payload: T): T =>
    omitUnlessLoaded(payload, loadedRef.current, PRIVATE_IDENTITY_PAYLOAD_KEYS as unknown as ReadonlyArray<keyof T & string>) as T;
  return { unavailable, markHydrated, scrub };
}
