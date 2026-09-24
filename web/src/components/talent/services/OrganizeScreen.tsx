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

export function OrganizeScreen({
  names,
  items,
  onBack,
  onRename,
  onOrder,
}: {
  names: string[];
  items: TalentOffering[];
  onBack: () => void;
  onRename: (from: string, to: string) => Promise<void>;
  onOrder: (next: string[]) => Promise<void>;
}) {
  const copy = useDashboardText();
  const [renameFrom, setRenameFrom] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");
  return (
    <div className="max-w-[640px] font-admin-body">
      <button type="button" onClick={onBack}>{copy.t("Back")}</button>
      <h1 className="mt-2 font-admin-display text-[28px]">{copy.t("Organize")}</h1>
      <ul className="mt-4 space-y-2">
        {names.map((name, index) => {
          const count = items.filter((i) => i.category === name).length;
          const photos = items.filter((i) => i.category === name && i.imageUrls.length > 0).length;
          return (
            <li key={name} className="flex items-center justify-between rounded-xl border border-admin-border-soft bg-white px-3 py-2">
              <span>
                <span className="font-semibold">{name}</span>
                <span className="ml-2 text-[12px] text-admin-ink-muted">{count} {copy.t("items")} · {photos} {copy.t("with a photo")}</span>
              </span>
              <span className="flex gap-2 text-[12px]">
                <button type="button" onClick={() => { if (index > 0) void onOrder(move(names, index, -1)); }}>{copy.t("Move up")}</button>
                <button type="button" onClick={() => { setRenameFrom(name); setRenameTo(name); }}>{copy.t("Rename")}</button>
              </span>
            </li>
          );
        })}
      </ul>
      {renameFrom && (
        <div className="mt-4 rounded-xl border p-3">
          <p className="text-[13px]">{copy.t("Rename")} {renameFrom}</p>
          <input className="mt-2 w-full rounded-md border px-2 py-1" maxLength={80} value={renameTo} onChange={(e) => setRenameTo(e.target.value)} />
          <p className="mt-1 text-[11px] text-admin-ink-muted">{renameTo.length}/80 · {copy.t("Saved links to a heading cannot be redirected.")}</p>
          <button type="button" className="mt-2 rounded-full bg-admin-brand px-3 py-1 text-white" onClick={(event) => {
            const field = event.currentTarget.parentElement?.querySelector("input");
            const next = field instanceof HTMLInputElement ? field.value : renameTo;
            void onRename(renameFrom, next);
            setRenameFrom(null);
          }}>
            {copy.t("Rename all")}
          </button>
        </div>
      )}
    </div>
  );
}

function move(list: string[], index: number, dir: -1 | 1): string[] {
  const next = [...list];
  const swap = index + dir;
  if (swap < 0 || swap >= next.length) return next;
  [next[index], next[swap]] = [next[swap], next[index]];
  return next;
}
