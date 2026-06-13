"use client";

/**
 * BuilderMediaScope — a tiny, isolated context that tells the media picker which
 * TALENT (if any) the current builder surface belongs to. Only the Talent Max
 * builder provides a non-null `talentProfileId`; the homepage / workspace / Lab
 * surfaces leave it null, so the picker keeps its existing agency-library
 * behaviour there.
 *
 * Why a dedicated context instead of threading through `edit-context.tsx`: that
 * file is the ~7k-line parity-sensitive editor core. A self-contained provider
 * wrapping the talent mount keeps this additive and risk-free — homepage parity
 * is untouched because the homepage never wraps with this provider.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";

interface BuilderMediaScope {
  /** The talent whose own portfolio + uploads the picker should show. */
  talentProfileId: string | null;
}

const BuilderMediaScopeContext = createContext<BuilderMediaScope>({
  talentProfileId: null,
});

export function BuilderMediaScopeProvider({
  talentProfileId,
  children,
}: {
  talentProfileId: string | null;
  children: ReactNode;
}) {
  const value = useMemo<BuilderMediaScope>(
    () => ({ talentProfileId: talentProfileId || null }),
    [talentProfileId],
  );
  return (
    <BuilderMediaScopeContext.Provider value={value}>
      {children}
    </BuilderMediaScopeContext.Provider>
  );
}

export function useBuilderMediaScope(): BuilderMediaScope {
  return useContext(BuilderMediaScopeContext);
}
