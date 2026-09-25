"use client";

import { CatalogBookingSheet } from "@/components/public-booking/CatalogBookingSheet";
import type { GuestCaptchaConfig } from "@/components/public-booking/GuestCaptchaField";
import { askQuestion } from "@/app/t/[profileCode]/_maison/MaisonAsk";

/** Prototype consumer. `live` writes a real booking; the default does not. */
export function DemoBookingSheet({
  locale = "es",
  mode = "demo",
  tenantId = null,
  captcha = null,
}: {
  locale?: string;
  mode?: "demo" | "live";
  tenantId?: string | null;
  captcha?: GuestCaptchaConfig | null;
}) {
  return (
    <CatalogBookingSheet
      locale={locale}
      mode={mode}
      tenantId={tenantId}
      captcha={captcha}
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
