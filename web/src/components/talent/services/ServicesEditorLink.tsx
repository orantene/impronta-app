"use client";

/**
 * TUL-1270 #10: the profile drawer used to mount the legacy English-only
 * services editor (TalentOfferingsManager, now deleted). It now points to the
 * one current Services editor instead. A talent gets a button to Services;
 * staff with access to the talent (authorizeForTalent: workspace staff whose
 * roster has the talent) edit in the drawer through StaffServicesPanel.
 */
import Link from "next/link";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";

import { StaffServicesPanel } from "./StaffServicesPanel";

const COPY = {
  en: {
    self: "Your services, prices and booking rules are edited in Services.",
    staff: "Services, prices and booking rules for this talent. The talent sees the same editor in Services.",
    open: "Open Services",
  },
  es: {
    self: "Tus servicios, precios y reglas de reserva se editan en Servicios.",
    staff: "Servicios, precios y reglas de reserva de este talento. El talento ve el mismo editor en Servicios.",
    open: "Abrir Servicios",
  },
} as const;

export function ServicesEditorLink({ isSelf, talentId }: { isSelf: boolean; talentId: string }) {
  const copy = useDashboardText();
  const t = copy.isSpanish ? COPY.es : COPY.en;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-admin-border-soft bg-white px-4 py-3" data-services-editor-link>
      <p className="text-[13px] text-admin-ink">{isSelf ? t.self : t.staff}</p>
      {isSelf ? (
        <Link href="/talent/services" className="rounded-lg bg-[var(--tc-action)] px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-[var(--tc-action-hover)]">
          {t.open}
        </Link>
      ) : null}
      {isSelf ? null : (
        <div className="w-full">
          <StaffServicesPanel talentId={talentId} />
        </div>
      )}
    </div>
  );
}
