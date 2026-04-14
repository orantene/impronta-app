"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { buildInspectorContext } from "@/lib/admin/admin-inspector/context";
import { inspectorModulesForContext } from "@/lib/admin/admin-inspector/registry";
import type { InspectorJob, InspectorModuleDefinition } from "@/lib/admin/admin-inspector/types";
import { InspectorJobSection } from "./inspector-job-section";

const JOBS: InspectorJob[] = ["context", "suggestions", "actions"];

function groupByJob(modules: InspectorModuleDefinition[]) {
  const map = new Map<InspectorJob, InspectorModuleDefinition[]>();
  for (const j of JOBS) map.set(j, []);
  for (const m of modules) {
    map.get(m.job)!.push(m);
  }
  return map;
}

export function AdminContextualInspector() {
  const pathname = usePathname() ?? "/";
  const rawSearch = useSearchParams();

  const ctx = useMemo(() => {
    const sp = new URLSearchParams(rawSearch.toString());
    return buildInspectorContext(pathname, sp);
  }, [pathname, rawSearch]);

  const modules = useMemo(() => inspectorModulesForContext(ctx), [ctx]);
  const byJob = useMemo(() => groupByJob(modules), [modules]);

  return (
    <div className="flex max-h-[calc(100dvh-8rem)] flex-col gap-3 overflow-y-auto overscroll-contain pb-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-gold-muted)]">Inspector</p>
        <p className="mt-1 text-[11px] leading-snug text-[var(--admin-nav-idle)]">
          Contextual modules for this route. URL selection uses{" "}
          <code className="rounded bg-[var(--admin-code-bg)] px-1 text-[10px]">apanel</code> +{" "}
          <code className="rounded bg-[var(--admin-code-bg)] px-1 text-[10px]">aid</code> on list pages.
        </p>
      </div>

      {JOBS.map((job) => {
        const list = byJob.get(job) ?? [];
        if (list.length === 0) return null;
        const nodes = list.map((def) => (
          <div key={def.key} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium text-[var(--admin-workspace-fg)]">{def.title}</p>
              {def.requiresAiPipeline ? (
                <span className="rounded-full border border-[var(--admin-gold-border)]/50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--admin-gold)]">
                  AI pipeline
                </span>
              ) : null}
            </div>
            <def.Component ctx={ctx} />
          </div>
        ));
        return (
          <InspectorJobSection key={job} job={job}>
            {nodes}
          </InspectorJobSection>
        );
      })}
    </div>
  );
}
