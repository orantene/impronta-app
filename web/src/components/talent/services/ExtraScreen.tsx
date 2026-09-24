"use client";

import { useMemo, useState } from "react";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { upsertAddonGroup, type AddonGroup } from "@/lib/talent/services-settings-actions";
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
    </div>
  );
}
