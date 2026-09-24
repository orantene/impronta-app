"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { upsertAddonGroup, type AddonGroup } from "@/lib/talent/services-settings-actions";
import { listTalentPortfolioPhotos, type PortfolioPhoto } from "@/lib/talent/offerings-actions";
import type { TalentOffering } from "@/lib/talent/offerings-types";

export function ExtraScreen({
  talentId,
  source,
  items,
  existing,
  onBack,
  onSaved,
}: {
  talentId: string;
  source: TalentOffering;
  items: TalentOffering[];
  existing?: AddonGroup | null;
  onBack: () => void;
  onSaved: () => Promise<void>;
}) {
  const copy = useDashboardText();
  const [name, setName] = useState(existing?.name ?? "");
  const [price, setPrice] = useState(existing ? String(existing.amountCents / 100) : "");
  const [minutes, setMinutes] = useState(existing?.durationMinutes ? String(existing.durationMinutes) : "");
  const [ids, setIds] = useState<string[]>(existing?.offeringIds ?? (source.id ? [source.id] : []));
  const [mediaAssetId, setMediaAssetId] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(existing?.mediaUrl ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pool = useMemo(
    () => items.filter((item) => item.kind !== "product" && (!source.category || item.category === source.category)),
    [items, source.category],
  );

  const preview = pool.find((item) => ids.includes(item.id)) ?? source;
  const extraCents = Math.round(Number(price || 0) * 100);
  const extraMin = minutes ? Number(minutes) : 0;
  const totalCents = (preview.amountCents ?? 0) + extraCents;
  const totalMin = (preview.durationMinutes ?? 0) + extraMin;

  return (
    <div className="font-admin-body">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-admin-display text-[28px] font-semibold text-admin-ink">{copy.t("New extra")}</h1>
          <p className="text-[13px] text-admin-ink-muted">
            {copy.t("Adds price or time to a service the client is already booking")}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-full px-3 py-1.5 text-[13px]" onClick={onBack}>
            {copy.t("Cancel")}
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            className="rounded-full bg-admin-brand px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
            onClick={async () => {
              setBusy(true);
              const res = await upsertAddonGroup(talentId, {
                id: existing?.id,
                name,
                amountCents: extraCents,
                durationMinutes: extraMin || null,
                offeringIds: ids,
                mediaAssetId,
              });
              setBusy(false);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              await onSaved();
              onBack();
            }}
          >
            {copy.t("Save extra")}
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-[13px] text-red-700">{error}</p>}
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-admin-border-soft bg-white px-5 py-5">
            <h2 className="text-[16px] font-semibold">{copy.t("What is the extra?")}</h2>
            <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.1em] text-admin-ink-dim">
              {copy.t("Name")}
              <input className="mt-1.5 w-full rounded-lg border border-admin-border-soft px-3 py-2.5" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-admin-ink-dim">
                {copy.t("Adds to the price")}
                <input className="mt-1.5 w-full rounded-lg border border-admin-border-soft px-3 py-2.5" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
              </label>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-admin-ink-dim">
                {copy.t("Adds to the time")}
                <input className="mt-1.5 w-full rounded-lg border border-admin-border-soft px-3 py-2.5" type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              </label>
            </div>
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-admin-ink-dim">{copy.t("Photo")}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {mediaUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
                ) : (
                  <div className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-admin-border-soft text-[11px] text-admin-ink-dim">
                    {copy.t("None")}
                  </div>
                )}
                <button
                  type="button"
                  className="rounded-full border border-admin-border-soft px-3 py-1.5 text-[13px] font-semibold"
                  onClick={() => setPickerOpen(true)}
                >
                  {copy.t("Pick from portfolio")}
                </button>
                {mediaUrl && (
                  <button
                    type="button"
                    className="text-[13px] text-admin-ink-muted underline"
                    onClick={() => {
                      setMediaAssetId(null);
                      setMediaUrl(null);
                    }}
                  >
                    {copy.t("Remove")}
                  </button>
                )}
              </div>
            </div>
            <p className="mt-3 text-[12.5px] text-admin-ink-dim">
              {copy.t("One photo is enough here; it shows as a small square next to the checkbox. Change")}
            </p>
          </section>
          <section className="rounded-2xl border border-admin-border-soft bg-white px-5 py-5">
            <h2 className="text-[16px] font-semibold">{copy.t("Which services can it be added to?")}</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {pool.map((item) => (
                <li key={item.id}>
                  <label className="flex items-center gap-2 rounded-xl border border-admin-border-soft px-3 py-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={ids.includes(item.id)}
                      onChange={(e) =>
                        setIds(e.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12.5px] text-admin-ink-dim">
              {ids.length} {copy.t("of")} {items.filter((i) => i.kind !== "product").length}
              {source.category
                ? ` · ${copy.t("other categories are not shown because the extra is for")} ${source.category}.`
                : ""}
            </p>
          </section>
        </div>
        <aside className="rounded-2xl border border-admin-border-soft bg-white px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-admin-ink-dim">
            {copy.t("Where the client meets it")}
          </p>
          <p className="mt-3 text-[15px] font-semibold">{preview.title}</p>
          <label className="mt-3 flex items-start gap-2 rounded-xl border border-admin-border-soft px-3 py-2 text-[13px]">
            <input type="checkbox" defaultChecked readOnly />
            {mediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl} alt="" className="mt-0.5 h-8 w-8 shrink-0 rounded object-cover" />
            ) : null}
            <span>
              <span className="block font-semibold">{name || copy.t("Extra")}</span>
              <span className="text-admin-ink-dim">
                {extraMin ? `+${extraMin} min · ` : ""}+{Math.round(extraCents / 100)} {preview.currency}
              </span>
            </span>
          </label>
          <p className="mt-4 text-[13px]">
            {copy.t("Total")} · {totalMin} min ${Math.round(totalCents / 100).toLocaleString("en-US")} {preview.currency}
          </p>
        </aside>
      </div>
      {pickerOpen && (
        <ExtraPortfolioPicker
          talentId={talentId}
          onClose={() => setPickerOpen(false)}
          onPick={(photo) => {
            setMediaAssetId(photo.id);
            setMediaUrl(photo.url);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ExtraPortfolioPicker({
  talentId,
  onClose,
  onPick,
}: {
  talentId: string;
  onClose: () => void;
  onPick: (photo: PortfolioPhoto) => void;
}) {
  const copy = useDashboardText();
  const [photos, setPhotos] = useState<PortfolioPhoto[] | null>(null);
  useEffect(() => {
    let alive = true;
    void listTalentPortfolioPhotos(talentId).then((res) => {
      if (alive && res.ok) setPhotos(res.photos);
    });
    return () => {
      alive = false;
    };
  }, [talentId]);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 md:items-center md:p-4" onClick={onClose}>
      <div
        style={{ maxWidth: 680 }}
        className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-admin-border-soft px-5 py-4">
          <h2 className="font-admin-body text-[18px] font-semibold tracking-normal text-admin-ink">
            {copy.t("Pick photos from your portfolio")}
          </h2>
        </div>
        <div className="grid flex-1 grid-cols-3 gap-2.5 overflow-auto p-5 sm:grid-cols-4">
          {photos === null && <p className="col-span-full text-[13px] text-admin-ink-dim">{copy.t("Loading")}…</p>}
          {photos?.length === 0 && (
            <p className="col-span-full text-[13px] text-admin-ink-dim">{copy.t("Your portfolio has no photos yet.")}</p>
          )}
          {(photos ?? []).map((photo) => (
            <button key={photo.id} type="button" onClick={() => onPick(photo)} className="overflow-hidden rounded-lg text-left">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
        <div className="flex justify-end border-t border-admin-border-soft px-5 py-3">
          <button type="button" className="text-[14px] text-admin-ink" onClick={onClose}>
            {copy.t("Cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
