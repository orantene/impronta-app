"use client";

/**
 * BuilderProfilerBoundary — the flag-gated `<React.Profiler>` mount wrapper
 * (Marathon W0-T6).
 *
 * Wraps `children` in a `<React.Profiler id={id}>` ONLY when
 * `NEXT_PUBLIC_BUILDER_PROFILE === "1"`. When the flag is off it renders
 * `children` verbatim — no Profiler node, no extra fragment, zero overhead.
 * This is what lets the canvas mount (a server component) and the chrome root
 * opt into measurement without ever shipping a Profiler in normal prod.
 *
 * All capture logic lives in the standalone `builder-profiler.ts` so the two
 * builder shared-core files (`edit-context.tsx`, `render.tsx`) stay completely
 * untouched by Wave 0.
 */

import { Profiler, type ReactNode } from "react";

import {
  installBuilderProfileGlobal,
  isBuilderProfileEnabled,
  recordProfilerCommit,
} from "./builder-profiler";

interface BuilderProfilerBoundaryProps {
  /** Profiler id — "edit-chrome" (provider chrome) or "builder-canvas". */
  id: string;
  children: ReactNode;
}

export function BuilderProfilerBoundary({
  id,
  children,
}: BuilderProfilerBoundaryProps) {
  // Flag off → render children with NO Profiler node at all. The bundler folds
  // `isBuilderProfileEnabled()` to `false` in a normal prod build.
  if (!isBuilderProfileEnabled()) {
    return <>{children}</>;
  }
  // Install the `window.__builderProfile` console handle once on first render
  // (idempotent). Cheap and safe to call from each boundary mount.
  installBuilderProfileGlobal();
  return (
    <Profiler id={id} onRender={recordProfilerCommit}>
      {children}
    </Profiler>
  );
}
