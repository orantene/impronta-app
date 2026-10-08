"use client";

import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

/**
 * false during the server render AND the hydration pass, true once the browser
 * owns the tree. Gate anything that reads the wall clock or the viewer's
 * timezone behind it so the server HTML and the first client render match
 * (React #418).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}
