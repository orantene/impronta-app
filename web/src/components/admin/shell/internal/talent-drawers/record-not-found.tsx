"use client";

import { useT } from "@/i18n/use-t";
import { DrawerShell, PrimaryButton } from "../primitives";

/**
 * What a drawer shows when the id it was opened with is not among the real rows.
 * Never a prototype fixture row: a real user must not see someone else's mock data.
 */
export function RecordNotFoundDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title={t("dashboard.talentDrawers.recordNotFoundTitle")}
      width={480}
      footer={<PrimaryButton onClick={onClose}>{t("dashboard.talentDrawers.gotIt")}</PrimaryButton>}
    >
      <p data-record-not-found>{t("dashboard.talentDrawers.recordNotFoundBody")}</p>
    </DrawerShell>
  );
}
