"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import {
  ADMIN_PANEL_AID,
  ADMIN_PANEL_APANEL,
  buildPathWithAdminPanel,
  parseAdminPanelParams,
} from "@/lib/admin/admin-panel-search-params";

type UseAdminPanelStateOptions = {
  pathname: string;
};

/**
 * Read/write `apanel` + `aid` on the current URL via `router.replace(..., { scroll: false })`.
 * Use when the panel host lives in a client tree that shares the page's search params.
 */
export function useAdminPanelState({ pathname }: UseAdminPanelStateOptions) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const panel = useMemo(() => {
    const o: Record<string, string | undefined> = {};
    searchParams.forEach((v, k) => {
      if (!(k in o)) o[k] = v;
    });
    return parseAdminPanelParams(o);
  }, [searchParams]);

  const openPanel = useCallback(
    (apanel: string, aid: string) => {
      const next = buildPathWithAdminPanel(pathname, searchParams, { apanel, aid });
      router.replace(next, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const closePanel = useCallback(() => {
    const next = buildPathWithAdminPanel(pathname, searchParams, { apanel: null, aid: null });
    router.replace(next, { scroll: false });
  }, [pathname, router, searchParams]);

  return {
    apanel: panel.apanel,
    aid: panel.aid,
    openPanel,
    closePanel,
    /** Raw keys for controlled forms/tests */
    keys: { apanel: ADMIN_PANEL_APANEL, aid: ADMIN_PANEL_AID },
  };
}
