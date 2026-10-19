"use client";

/**
 * TUL-1270 #10: the profile drawer used to mount the legacy English-only
 * services editor (TalentOfferingsManager, now deleted). It now points to the
 * one current Services editor instead. A talent gets a button; staff see who
 * manages the menu (the talent edits it in Services).
 */
import Link from "next/link";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";

const COPY = {
  en: {
    self: "Your services, prices and booking rules are edited in Services.",
    staff: "The talent edits services, prices and booking rules in their Services editor.",
    open: "Open Services",
  },
  es: {
    self: "Tus servicios, precios y reglas de reserva se editan en Servicios.",
    staff: "El talento edita sus servicios, precios y reglas de reserva en su editor de Servicios.",
    open: "Abrir Servicios",
  },
} as const;

export function ServicesEditorLink({ isSelf }: { isSelf: boolean }) {
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
    </div>
  );
}
