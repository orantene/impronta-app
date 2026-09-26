"use client";

/**
 * W59 — banner when Services is opened from Maison Import "Review services".
 * Query: ?from=website-setup
 */

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";

export function ServicesWebsiteSetupBanner() {
  const params = useSearchParams();
  const copy = useDashboardText();
  const fromSetup = params?.get("from") === "website-setup";
  if (!fromSetup) return null;

  return (
    <div
      data-testid="services-website-setup-banner"
      className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-950"
    >
      <p className="font-semibold">
        {copy.isSpanish
          ? "Viniste desde la configuración del sitio. Tus elecciones de diseño están guardadas."
          : "You came here from website setup. Your design choices are saved."}
      </p>
      <Link
        href="/talent/site"
        data-testid="services-back-to-website-setup"
        className="mt-1 inline-block font-semibold underline"
      >
        {copy.isSpanish ? "Volver a la configuración del sitio" : "Back to website setup"}
      </Link>
    </div>
  );
}
