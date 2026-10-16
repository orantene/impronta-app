"use client";

/**
 * TUL-1221: the editor's React context object and its two hooks, split out of the 6,300-line
 * `edit-context.tsx` so the shared UI primitives (floating-panel, dock-floating-panel, the
 * inspector kit) can read the context without importing the whole page builder.
 *
 * Importing `edit-context.tsx` pulls in the builder-node barrel, and with it the entire
 * renderer (and the public booking page it embeds), into every admin route that reaches such a
 * primitive. This module's ONLY dependency is the `EditContextValue` TYPE (erased at build).
 * Keep it that way: no runtime import from `@/lib/site-admin/**` here, and exactly one
 * `createContext` in edit-chrome (edit-context-core.static.test.ts pins both).
 *
 * `edit-context.tsx` provides this context and re-exports both hooks, so every existing
 * `import { useEditContext } from "./edit-context"` keeps working.
 */
import { createContext, useContext } from "react";

import type { EditContextValue } from "./edit-context-types";

export const EditContext = createContext<EditContextValue | null>(null);

export function useEditContext(): EditContextValue {
  const ctx = useContext(EditContext);
  if (!ctx) {
    throw new Error("useEditContext must be used within EditProvider");
  }
  return ctx;
}

/** Optional variant for components that may mount outside edit chrome. */
export function useMaybeEditContext(): EditContextValue | null {
  return useContext(EditContext);
}
