"use client";

/**
 * Gear + drawer at the top of the talent Messages shell. Holds the settings a
 * talent reaches for while chatting: card fee payer, payout method, booking
 * mode and notifications. The last three are shortcuts to existing screens.
 */

import { useState } from "react";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

import { FeePayerCard } from "./FeePayerCard";
import { useResolvedTalentEarningsByCurrency } from "./use-resolved-talent-earnings-by-currency";

export function MessagesSettingsDrawer() {
  const t = useDashboardText().t;
  const currency = (useResolvedTalentEarningsByCurrency().defaultCurrency || "MXN").toUpperCase();
  const { openDrawer, setTalentPage } = useAdminShell();
  const [open, setOpen] = useState(false);

  const row = (label: string, hint: string, go: () => void) => (
    <button
      type="button"
      onClick={() => {
        setOpen(false);
        go();
      }}
      className="flex min-h-[56px] w-full items-center gap-3 border-t border-admin-border-soft px-1 py-2 text-left font-admin-body first:border-t-0"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-admin-ink">{label}</span>
        <span className="block text-[12.5px] text-admin-ink-muted">{hint}</span>
      </span>
      <span className="text-[13px] font-semibold text-admin-ink">{t("Open")}</span>
    </button>
  );

  return (
    <>
      <button
        type="button"
        data-testid="messages-settings-gear"
        aria-label={t("Messages settings")}
        onClick={() => setOpen(true)}
        className="inline-flex size-11 items-center justify-center rounded-full text-[18px] text-admin-ink sm:size-9"
      >
        <span aria-hidden>⚙</span>
      </button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent side="right" className="w-full max-w-[440px] overflow-y-auto bg-white p-5">
          <DrawerHeader>
            <DrawerTitle>{t("Messages settings")}</DrawerTitle>
            <DrawerDescription>{t("The settings you reach for most.")}</DrawerDescription>
          </DrawerHeader>
          <div className="mt-4">
            <FeePayerCard currency={currency} />
            {row(t("Payout method"), t("Bank account or USDC"), () => openDrawer("talent-payouts"))}
            {row(t("Booking mode"), t("Request a booking or book instantly"), () => setTalentPage("services"))}
            {row(t("Notifications"), t("Choose how you hear about new messages"), () =>
              openDrawer("talent-notifications"),
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
