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

export function AddManyScreen({
  talentId,
  editor,
  onBack,
}: {
  talentId: string;
  editor: ReturnType<typeof useOfferingsEditor>;
  onBack: () => void;
}) {
  const copy = useDashboardText();
  const [text, setText] = useState("");
  const parsed = text.split(/\n+/).map(parseOfferingLine).filter((row): row is NonNullable<typeof row> => Boolean(row));
  return (
    <div className="max-w-[720px] font-admin-body">
      <button type="button" onClick={onBack}>{copy.t("Back")}</button>
      <h1 className="mt-2 font-admin-display text-[26px]">{copy.t("Add many")}</h1>
      <textarea className="mt-3 h-40 w-full rounded-md border p-2" value={text} onChange={(e) => setText(e.target.value)} placeholder="Gel semi pies 600" />
      <table className="mt-3 w-full text-left text-[13px]">
        <thead><tr><th>{copy.t("Name")}</th><th>{copy.t("Price")}</th><th>{copy.t("Status")}</th></tr></thead>
        <tbody>
          {parsed.map((row) => {
            const exists = editor.items.some((i) => foldAccent(i.title) === foldAccent(row.title));
            return (
              <tr key={row.title}>
                <td>{row.title}</td>
                <td>{row.amountCents != null ? row.amountCents / 100 : "—"}</td>
                <td>{exists ? copy.t("Already exists · skip") : row.durationMinutes ? copy.t("Ready") : copy.t("Needs minutes")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="rounded-full bg-admin-brand px-4 py-2 text-white"
          onClick={async () => {
            for (const row of parsed) {
              if (editor.items.some((i) => foldAccent(i.title) === foldAccent(row.title))) continue;
              if (row.amountCents == null) continue;
              editor.startAdd({
                kind: row.kind,
                title: row.title,
                amountCents: row.amountCents,
                durationMinutes: row.durationMinutes,
                status: "published",
                bookingMode: "instant",
                priceDisplay: "exact",
              });
              await editor.saveDraft({ status: "published" });
            }
            onBack();
          }}
        >
          {copy.t("Publish the N that are ready").replace("N", String(parsed.filter((r) => r.amountCents != null && !editor.items.some((i) => foldAccent(i.title) === foldAccent(r.title))).length))}
        </button>
        <button type="button" onClick={() => void importLegacyToOfferings(talentId)}>{copy.t("Import my old rates & packages")}</button>
      </div>
      <button type="button" disabled className="mt-4 block text-[12px] text-admin-ink-muted">{copy.t("Photo of a card")} · {copy.t("Later phase")}</button>
    </div>
  );
}
