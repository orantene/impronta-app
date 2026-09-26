"use client";

import { CatalogBookingSheet } from "@/components/public-booking/CatalogBookingSheet";
import type { GuestCaptchaConfig } from "@/components/public-booking/GuestCaptchaField";
import { askFromBookingSheet } from "@/app/t/[profileCode]/_maison/MaisonAsk";

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
      onAsk={(handoff) =>
        askFromBookingSheet({
          ...handoff,
          talentName: "Jorg Beauty",
          sourcePage: "/dev/jor-beauty",
          demo: mode === "demo",
        })
      }
    />
  );
}
