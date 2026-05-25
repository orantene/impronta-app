"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAdminShell } from "@/components/admin/shell/internal/state";

/**
 * SPA tab "My Site" redirects to the canonical /talent/site route
 * where the real Phase 2 dashboard lives.
 */
export function TalentSiteDashboardRedirect() {
  const router = useRouter();
  const { tenantSlug } = useAdminShell();

  useEffect(() => {
    if (tenantSlug) {
      router.replace(`/${tenantSlug}/talent/site`);
    }
  }, [tenantSlug, router]);

  return (
    <div style={{ padding: 24, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13 }}>
      Loading personal site…
    </div>
  );
}
