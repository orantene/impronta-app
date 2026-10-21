"use client";

/**
 * TUL-1476 · After a direct add, the talent was saved but the terms did not go out.
 * The roster page passes the `joinTerms` query flag here; this shows one short toast
 * (ES / EN) through the admin shell's toast, then drops the flag from the URL so a
 * refresh does not show it again.
 */
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import type { JoinTermsOutcome } from "@/lib/service-hub/join-terms";
import { joinTermsLocale, joinTermsOutcomeNotice } from "@/lib/service-hub/join-terms-copy";

export function JoinTermsRedirectNotice({ outcome }: { outcome: JoinTermsOutcome }) {
  const { toast } = useAdminShell();
  const locale = joinTermsLocale(useDashboardLocale());
  const router = useRouter();
  const pathname = usePathname();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    const text = joinTermsOutcomeNotice(outcome, locale);
    if (!text) return;
    shown.current = true;
    toast(text, { tone: "warning" });
    if (pathname) router.replace(pathname, { scroll: false });
  }, [outcome, locale, toast, router, pathname]);

  return null;
}
