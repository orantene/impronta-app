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

export function CameraAddScreen({
  talentId,
  editor,
  onBack,
  locale,
}: {
  talentId: string;
  editor: ReturnType<typeof useOfferingsEditor>;
  onBack: () => void;
  locale: string;
}) {
  const copy = useDashboardText();
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [minutes, setMinutes] = useState("");
  return (
    <div className="max-w-[420px] font-admin-body">
      <button type="button" onClick={onBack}>{copy.t("Back")}</button>
      <h1 className="mt-2 font-admin-display text-[26px]">{copy.t("Add item")}</h1>
      <label className="mt-4 block text-[12px] font-semibold">
        {copy.t("Photo")}
        <input type="file" accept="image/*" capture="environment" className="mt-1 block" />
      </label>
      <input className="mt-3 w-full rounded-md border px-2 py-2" placeholder={copy.t("Name")} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input className="mt-2 w-full rounded-md border px-2 py-2" placeholder={copy.t("Price")} value={price} onChange={(e) => setPrice(e.target.value)} />
      <input className="mt-2 w-full rounded-md border px-2 py-2" placeholder="min" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      <button
        type="button"
        className="mt-4 rounded-full bg-admin-brand px-4 py-2 text-white"
        onClick={async () => {
          editor.startAdd({
            title,
            amountCents: price ? Math.round(Number(price) * 100) : null,
            durationMinutes: minutes ? Number(minutes) : null,
            status: "published",
            bookingMode: "instant",
            currency: editor.defaultCurrency,
          });
          await editor.saveDraft({ status: "published" });
          onBack();
        }}
      >
        {copy.t("Publish now")}
      </button>
      <p className="mt-2 text-[11px] text-admin-ink-muted">{locale}</p>
      <p className="sr-only">{talentId}</p>
    </div>
  );
}
