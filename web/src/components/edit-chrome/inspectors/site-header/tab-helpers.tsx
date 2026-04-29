"use client";

/**
 * Small primitives shared across SiteHeaderInspector tabs. Kept light;
 * the goal is consistency of helper microcopy + dashed "next pass"
 * placeholder rows, not a parallel kit.
 */

import type { ReactNode } from "react";

/**
 * Visible group description — paragraph of helper text that explains
 * WHEN to use the group's controls. Goes inside <InspectorGroup> as
 * the first child so it sits between the title and the controls.
 */
export function GroupDescription({ children }: { children: ReactNode }) {
  return (
    <p className="-mt-0.5 mb-2 text-[11px] leading-snug text-stone-500">
      {children}
    </p>
  );
}

/**
 * Dashed placeholder row used in tabs that have controls coming in a
 * later session. Honest about what's not yet implemented; reads as a
 * deliberate roadmap, not as a half-built input.
 */
export function NextPassRow({
  label,
  hint,
}: {
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-dashed border-[#e5e0d5] bg-white px-3 py-2.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[12px] font-medium text-stone-600">{label}</span>
        <span className="text-[10.5px] text-stone-400">{hint}</span>
      </div>
      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-stone-500">
        Next pass
      </span>
    </div>
  );
}
