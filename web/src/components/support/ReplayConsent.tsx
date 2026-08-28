"use client";

import { useT } from "@/i18n/use-t";
import { COLORS } from "./support-tokens";

export function ReplayConsent({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const t = useT();
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: COLORS.inkMuted, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{t("dashboard.adminSupport.attachReplay")}</span>
    </label>
  );
}
