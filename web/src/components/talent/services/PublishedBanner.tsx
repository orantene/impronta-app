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

export function PublishedBanner({
  item,
  destinations,
  onClose,
}: {
  item: TalentOffering | null;
  destinations: OfferingDestination[];
  onClose: () => void;
}) {
  const copy = useDashboardText();
  if (!item || publicationWord(item) !== "live") return null;
  return (
    <div className="mt-4 rounded-[12px] border border-admin-border-soft bg-white px-4 py-3 text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{item.title} {copy.t("is live")}</p>
          <p className="mt-1 text-admin-ink-muted">
            {copy.t("Clients can book it on")}{" "}
            {destinations.map((d) => d.label).join(", ") || copy.t("your connected pages")}.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label={copy.t("Close")}>×</button>
      </div>
    </div>
  );
}
