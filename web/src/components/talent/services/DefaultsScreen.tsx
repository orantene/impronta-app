"use client";

import { useMemo, useState } from "react";
import {
  importLegacyToOfferings,
  listTalentPortfolioPhotos,
  setOfferingImages,
  type PortfolioPhoto,
} from "@/lib/talent/offerings-actions";
import {
  upsertAddonGroup,
  type AddonGroup,
  type OfferingDestination,
  type SellingDefaults,
} from "@/lib/talent/services-settings-actions";
import { foldAccent, parseOfferingLine, publicationWord } from "@/lib/talent/publication-state";
import { type TalentOffering } from "@/lib/talent/offerings-types";
import { useOfferingsEditor } from "./use-offerings-editor";
import { OfferingCard } from "@/components/talent/offering-card/OfferingCard";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { uploadTalentMedia } from "@/lib/client/signed-upload";

export function DefaultsScreen({
  defaults,
  onChange,
  onBack,
  onSave,
}: {
  defaults: SellingDefaults;
  onChange: (next: SellingDefaults) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const copy = useDashboardText();
  const patch = (partial: Partial<SellingDefaults>) => onChange({ ...defaults, ...partial });
  return (
    <div className="max-w-[560px] font-admin-body">
      <button type="button" onClick={onBack} className="text-[13px]">{copy.t("Back")}</button>
      <h1 className="mt-2 font-admin-display text-[28px]">{copy.t("Defaults")}</h1>
      <p className="text-[13px] text-admin-ink-muted">{copy.t("Applies to new bookings only.")}</p>
      <label className="mt-4 block text-[12px] font-semibold">
        {copy.t("Deposit percentage")}
        <input type="number" className="mt-1 w-full rounded-md border px-2 py-1" value={defaults.depositPct ?? ""} onChange={(e) => patch({ depositPct: e.target.value ? Number(e.target.value) : null })} />
      </label>
      <label className="mt-3 block text-[12px] font-semibold">
        {copy.t("Cancelling hours")}
        <input type="number" className="mt-1 w-full rounded-md border px-2 py-1" value={defaults.cancelHours ?? ""} onChange={(e) => patch({ cancelHours: e.target.value ? Number(e.target.value) : null })} />
      </label>
      <label className="mt-3 block text-[12px] font-semibold">
        {copy.t("Rescheduling hours")}
        <input type="number" className="mt-1 w-full rounded-md border px-2 py-1" value={defaults.rescheduleHours ?? ""} onChange={(e) => patch({ rescheduleHours: e.target.value ? Number(e.target.value) : null })} />
      </label>
      <label className="mt-3 block text-[12px] font-semibold">
        {copy.t("Buffer after")}
        <input type="number" className="mt-1 w-full rounded-md border px-2 py-1" value={defaults.bufferAfterMin ?? ""} onChange={(e) => patch({ bufferAfterMin: e.target.value ? Number(e.target.value) : null })} />
      </label>
      <label className="mt-3 block text-[12px] font-semibold">
        {copy.t("Shortest notice (minutes)")}
        <input type="number" className="mt-1 w-full rounded-md border px-2 py-1" value={defaults.minNoticeMin ?? ""} onChange={(e) => patch({ minNoticeMin: e.target.value ? Number(e.target.value) : null })} />
      </label>
      <button type="button" onClick={onSave} className="mt-5 rounded-full bg-admin-brand px-4 py-2 text-white">{copy.t("Save changes")}</button>
    </div>
  );
}
