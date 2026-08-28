"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { snapshotReplayBuffer, startReplayBuffer, stopReplayBuffer } from "./recorder";
import type { PackedChunk } from "./buffer";

const Ctx = createContext<{
  enabled: boolean;
  snapshot: () => PackedChunk[];
}>({ enabled: false, snapshot: () => [] });

export function SupportRecorderProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!enabled) return;
    startReplayBuffer();
    return () => {
      stopReplayBuffer();
    };
  }, [enabled]);

  return (
    <Ctx.Provider value={{ enabled, snapshot: snapshotReplayBuffer }}>{children}</Ctx.Provider>
  );
}

export function useReplayBuffer() {
  return useContext(Ctx);
}
