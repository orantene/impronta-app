"use client";

/**
 * SeriesDatedSettings — stop-selling time and spots per tier for a repeating
 * class (TUL-1344 slice 3). Prices themselves are edited on the item; this
 * block only caps how many spots each price may take on a date.
 */

import { useEffect, useState } from "react";

import {
  loadSeriesDatedSettingsAction,
  saveSeriesDatedSettingsAction,
  type SeriesDatedSettings as Settings,
} from "@/lib/server-actions/series-dated-settings";
import { datedSettingsCopy } from "./series-dated-settings-copy";

const FIELD = "flex h-[36px] items-center gap-[8px] rounded-[9px] border border-admin-border bg-admin-card px-[12px] font-admin-body text-admin-13 text-admin-ink";

export function SeriesDatedSettings({ seriesId, locale }: { seriesId: string | null; locale: string }) {
  const c = datedSettingsCopy(locale);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [minutes, setMinutes] = useState("");
  const [quotas, setQuotas] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "busy" | "saved" | "failed">("idle");

  useEffect(() => {
    if (!seriesId) return;
    let live = true;
    void loadSeriesDatedSettingsAction({ seriesId }).then((res) => {
      if (!live || !res.ok) return;
      setSettings(res.settings);
      setMinutes(res.settings.salesCloseMinutes == null ? "" : String(res.settings.salesCloseMinutes));
      setQuotas(Object.fromEntries(Object.entries(res.settings.tierQuotas).map(([k, v]) => [k, String(v)])));
    });
    return () => {
      live = false;
    };
  }, [seriesId]);

  const save = async () => {
    if (!seriesId) return;
    setStatus("busy");
    const parsedMinutes = minutes.trim() === "" ? null : Number.parseInt(minutes, 10);
    const tierQuotas: Record<string, number> = {};
    for (const t of settings?.tiers ?? []) {
      const raw = (quotas[t.poolKey] ?? "").trim();
      if (!raw) continue;
      const n = Number.parseInt(raw, 10);
      if (Number.isInteger(n) && n > 0) tierQuotas[t.poolKey] = n;
    }
    try {
      const res = await saveSeriesDatedSettingsAction({
        seriesId,
        salesCloseMinutes: Number.isInteger(parsedMinutes) ? parsedMinutes : null,
        tierQuotas,
      });
      setStatus(res.ok ? "saved" : "failed");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <section className="flex flex-col gap-[12px]" data-testid="series-dated-settings" aria-label={c.title}>
      <div className="font-admin-body text-[12px] font-semibold text-admin-ink">{c.title}</div>
      {!seriesId ? (
        <div className="font-admin-body text-[11.5px] text-admin-ink-dim">{c.saveFirst}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-[12px] max-[720px]:grid-cols-1">
            <label className="flex min-w-0 flex-col">
              <span className="mb-[6px] font-admin-body text-[12px] font-semibold text-admin-ink">{c.stopSelling}</span>
              <span className={FIELD}>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className="w-[80px] bg-transparent tabular-nums"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  data-testid="series-sales-close"
                />
                <span className="text-admin-ink-muted">{c.minutesBefore}</span>
              </span>
              <span className="mt-[5px] font-admin-body text-[11.5px] text-admin-ink-dim">{c.stopSellingHint}</span>
            </label>
            <div className="flex min-w-0 flex-col">
              <span className="mb-[6px] font-admin-body text-[12px] font-semibold text-admin-ink">{c.perTier}</span>
              {settings && settings.tiers.length > 0 ? (
                <div className="flex flex-col gap-[6px]">
                  {settings.tiers.map((t) => (
                    <label key={t.poolKey} className={`${FIELD} justify-between`}>
                      <span className="truncate">{t.label}</span>
                      <input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        placeholder={c.tierPlaceholder}
                        className="w-[90px] bg-transparent text-right tabular-nums"
                        value={quotas[t.poolKey] ?? ""}
                        onChange={(e) => setQuotas((q) => ({ ...q, [t.poolKey]: e.target.value }))}
                        data-testid={`series-quota-${t.poolKey}`}
                      />
                    </label>
                  ))}
                  <span className="font-admin-body text-[11.5px] text-admin-ink-dim">{c.perTierHint}</span>
                </div>
              ) : (
                <span className="font-admin-body text-[11.5px] text-admin-ink-dim">{c.noTiers}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-[10px]">
            <button
              type="button"
              disabled={status === "busy"}
              className="inline-flex h-[34px] cursor-pointer items-center rounded-[9px] border border-admin-border bg-admin-card px-[14px] font-admin-body text-admin-13 font-semibold text-admin-ink hover:border-admin-border-strong disabled:opacity-50"
              onClick={() => void save()}
              data-testid="series-dated-save"
            >
              {c.save}
            </button>
            {status === "saved" ? <span className="font-admin-body text-admin-13 text-admin-ink-muted">{c.saved}</span> : null}
            {status === "failed" ? <span className="font-admin-body text-admin-13 text-admin-ink-muted" role="alert">{c.failed}</span> : null}
          </div>
        </>
      )}
    </section>
  );
}
