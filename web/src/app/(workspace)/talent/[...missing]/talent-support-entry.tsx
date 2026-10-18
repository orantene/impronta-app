"use client";

// TUL-1241: /talent/support and /talent/help open the support panel on Today.
// The shell (and its SupportLauncher) stays mounted across the client navigation,
// so the open event fired after router.replace reaches the panel.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { openSupportPanel } from "@/lib/support/open-support-panel";
import TalentNotFound from "../not-found";

export function TalentSupportEntry() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/talent/today");
    const id = window.setTimeout(() => openSupportPanel(), 400);
    return () => window.clearTimeout(id);
  }, [router]);
  // Shown only if the redirect is slow; localized by the dashboard locale.
  return <TalentNotFound />;
}
