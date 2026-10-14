"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pathIsWorkspaceAdmin } from "@/lib/talent-site/hard-nav-workspace-admin";

/**
 * live4-01 (TUL-536): the talent shell stays mounted across a soft nav, so a
 * redirect into /admin/* (Edit site for a business owner) changed the URL and
 * kept painting Hoy. Reload once the pathname is an admin path so the
 * workspace admin layout mounts. Renders nothing.
 */
export function TalentLeavesForAdminGuard() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname != null && pathIsWorkspaceAdmin(pathname)) {
      window.location.replace(window.location.href);
    }
  }, [pathname]);
  return null;
}
