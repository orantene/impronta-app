"use client";

import Link from "next/link";
import { useState } from "react";

import { useT } from "@/i18n/use-t";

export type MediaUsagePlace = { assetId: string; kind: "page" | "service" | "product"; id: string; name: string; href: string };
export type MediaUsageBlock = { error: string; canOverride: boolean; places: MediaUsagePlace[] };

/** Narrow a failed delete result to the in-use details the dialog needs (null for any other failure). */
export function usageBlockOf(res: { ok: boolean; error?: string; usage?: { canOverride: boolean; places: MediaUsagePlace[] } }): MediaUsageBlock | null {
  if (res.ok || !res.usage) return null;
  return { error: res.error ?? "", canOverride: res.usage.canOverride, places: res.usage.places };
}

/**
 * Shown when a delete is refused because the image is in use. Lists each place by name with a link.
 * For pages, services and products the owner can choose "Delete anyway" and then confirm a second
 * time; a wordmark, favicon or brand logo offers no such choice (the server enforces it too).
 */
export function MediaUsageDialog({
  block, busy, onCancel, onDeleteAnyway,
}: {
  block: MediaUsageBlock;
  busy: boolean;
  onCancel: () => void;
  onDeleteAnyway: () => void;
}) {
  const t = useT();
  const [sure, setSure] = useState(false);
  const kindLabel = (k: MediaUsagePlace["kind"]) =>
    k === "page" ? t("dashboard.adminMedia.usageKindPage") : k === "product" ? t("dashboard.adminMedia.usageKindProduct") : t("dashboard.adminMedia.usageKindService");
  const btn = "rounded-md border border-admin-border px-3 py-1.5 text-sm font-semibold";
  return (
    <div role="dialog" aria-modal="true" aria-label={t("dashboard.adminMedia.usageTitle")} className="fixed inset-0 z-[9700] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-admin-surface p-5 text-admin-ink shadow-xl">
        <h2 className="text-base font-semibold">{t("dashboard.adminMedia.usageTitle")}</h2>
        {block.places.length > 0 ? (
          <ul className="mt-3 space-y-1.5 text-sm">
            {block.places.map((p) => (
              <li key={`${p.assetId}:${p.kind}:${p.id}`} className="flex items-center justify-between gap-3">
                <span>
                  <span className="text-admin-ink-muted">{kindLabel(p.kind)}: </span>
                  {p.name || t("dashboard.adminMedia.usageUnnamed")}
                </span>
                <Link href={p.href} className="shrink-0 underline">{t("dashboard.adminMedia.usageOpen")}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm">{block.error}</p>
        )}
        <p className="mt-3 text-sm text-admin-ink-muted">
          {block.canOverride ? t("dashboard.adminMedia.usageCanOverride") : t("dashboard.adminMedia.usageHardStop")}
        </p>
        {block.canOverride && sure ? <p className="mt-2 text-sm font-semibold">{t("dashboard.adminMedia.usageSecondConfirm")}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={btn} onClick={onCancel} disabled={busy}>
            {block.canOverride ? t("dashboard.adminMedia.usageKeep") : t("dashboard.adminMedia.usageClose")}
          </button>
          {block.canOverride ? (
            <button type="button" className={`${btn} text-red-700`} disabled={busy} onClick={sure ? onDeleteAnyway : () => setSure(true)}>
              {sure ? t("dashboard.adminMedia.usageDeleteConfirm") : t("dashboard.adminMedia.usageDeleteAnyway")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
