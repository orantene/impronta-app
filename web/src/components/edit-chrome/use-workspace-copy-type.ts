"use client";

import { useEffect, useState } from "react";

import { fetchWorkspaceTypeForCopy } from "@/lib/site-admin/add-gallery/workspace-copy-type-action";

const cache = new Map<string, string | null>();

/** Workspace type (business / talent / agency) for placeholder copy; null until known. */
export function useWorkspaceCopyType(tenantId: string): string | null {
  const [value, setValue] = useState<string | null>(cache.get(tenantId) ?? null);
  useEffect(() => {
    if (cache.has(tenantId)) {
      setValue(cache.get(tenantId) ?? null);
      return;
    }
    let live = true;
    void fetchWorkspaceTypeForCopy(tenantId)
      .then((v) => {
        cache.set(tenantId, v);
        if (live) setValue(v);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [tenantId]);
  return value;
}
