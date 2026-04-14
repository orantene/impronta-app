"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Ctx = {
  fitSlugs: string[];
  setFitSlugs: (slugs: string[]) => void;
};

const MatchFitContext = createContext<Ctx | null>(null);

export function DirectoryMatchFitProvider({
  initialSlugs,
  children,
}: {
  initialSlugs: string[];
  children: ReactNode;
}) {
  const [fitSlugs, setFitSlugsState] = useState<string[]>(initialSlugs);
  const setFitSlugs = useCallback((slugs: string[]) => {
    setFitSlugsState((prev) => {
      const next = [...new Set(slugs.map((x) => x.toLowerCase()))].slice(0, 48);
      const sig = (a: string[]) => [...a].sort().join("\0");
      if (sig(prev) === sig(next)) return prev;
      return next;
    });
  }, []);
  const value = useMemo(() => ({ fitSlugs, setFitSlugs }), [fitSlugs, setFitSlugs]);
  return (
    <MatchFitContext.Provider value={value}>{children}</MatchFitContext.Provider>
  );
}

export function useDirectoryMatchFitOptional(): Ctx | null {
  return useContext(MatchFitContext);
}
