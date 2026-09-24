"use client";

import { CatalogBookingSheet } from "@/components/public-booking/CatalogBookingSheet";
import { askQuestion } from "@/app/t/[profileCode]/_maison/MaisonAsk";

/** Prototype consumer — same sheet, demo write path. */
export function DemoBookingSheet({ locale = "es" }: { locale?: string }) {
  return (
    <CatalogBookingSheet
      locale={locale}
      mode="demo"
      showAsk
      onAsk={(detail) =>
        askQuestion({
          talentName: "Jorg Beauty",
          sourcePage: "/dev/jor-beauty",
          offering: { id: detail.offeringId, title: detail.title },
          from: "sheet",
        })
      }
    />
  );
}
