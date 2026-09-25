"use client";

import { useEffect, useRef, useState } from "react";
import { setOfferingImages } from "@/lib/talent/offerings-actions";
import { loadSellingDefaults, type SellingDefaults } from "@/lib/talent/services-settings-actions";
import { type OfferingStatus } from "@/lib/talent/offerings-types";
import { useOfferingsEditor } from "./use-offerings-editor";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { uploadTalentMedia } from "@/lib/client/signed-upload";

const MAX_PHOTOS = 12;

type Shot = { key: string; file: File; url: string };

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
  const [shots, setShots] = useState<Shot[]>([]);
  const [main, setMain] = useState(0);
  const [defaults, setDefaults] = useState<SellingDefaults | null>(null);
  const [busy, setBusy] = useState<OfferingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const retakeInput = useRef<HTMLInputElement>(null);
  const { draft, startAdd } = editor;

  // saveDraft merges onto the composed draft, so one must exist before Save.
  useEffect(() => {
    if (!draft) startAdd({ kind: "service" });
  }, [draft, startAdd]);

  useEffect(() => {
    let live = true;
    void loadSellingDefaults(talentId).then((res) => {
      if (live && res.ok) setDefaults(res.defaults);
    });
    return () => {
      live = false;
    };
  }, [talentId]);

  // Revoke preview URLs only on unmount; they stay in use while shots change.
  const shotsRef = useRef<Shot[]>([]);
  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);
  useEffect(() => () => shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url)), []);

  const toShots = (files: FileList | null) =>
    Array.from(files ?? []).map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, file, url: URL.createObjectURL(file) }));

  const addPhotos = (files: FileList | null) => {
    const next = toShots(files);
    if (next.length === 0) return;
    setShots((cur) => [...cur, ...next].slice(0, MAX_PHOTOS));
  };
  const retake = (files: FileList | null) => {
    const [next] = toShots(files);
    if (!next) return;
    setShots((cur) => (cur.length === 0 ? [next] : cur.map((s, i) => (i === main ? next : s))));
  };

  const priceNum = Number(price);
  const minutesNum = Number(minutes);
  const canSave = title.trim().length > 0 && !busy;
  const canPublish = canSave && price !== "" && priceNum > 0 && minutes !== "" && minutesNum > 0;

  const rulesLine = () => {
    const parts = [copy.t("instant booking")];
    if (defaults?.depositPct) parts.push(copy.t("{n}% deposit for new clients").replace("{n}", String(defaults.depositPct)));
    const hrs = defaults?.cancelHours ?? 24;
    parts.push(copy.t("free changes until {n} h before").replace("{n}", String(hrs)));
    return copy.t("Your usual rules apply: {rules}. Change them later in the full editor.").replace("{rules}", parts.join(", "));
  };

  const save = async (status: OfferingStatus) => {
    if (status === "published" ? !canPublish : !canSave) return;
    setBusy(status);
    setError(null);
    const saved = await editor.saveDraft({
      kind: "service",
      title: title.trim(),
      amountCents: price ? Math.round(priceNum * 100) : null,
      durationMinutes: minutes ? Math.round(minutesNum) : null,
      status,
      bookingMode: "instant",
      priceDisplay: "exact",
      currency: editor.defaultCurrency,
      depositPct: defaults?.depositPct ?? null,
      cancellationHours: defaults?.cancelHours ?? null,
    });
    if (!saved) {
      setBusy(null);
      setError(editor.error ?? copy.t("That did not save. Try again."));
      return;
    }
    const ordered = shots.length ? [shots[main]!, ...shots.filter((_, i) => i !== main)] : [];
    const assets: { id: string; url: string }[] = [];
    for (const s of ordered) {
      const up = await uploadTalentMedia({ file: s.file, variantKind: "gallery", talentProfileId: talentId });
      if (up.ok) assets.push({ id: up.id, url: up.publicUrl });
    }
    if (assets.length) {
      const res = await setOfferingImages(talentId, saved.id, assets.map((a) => a.id));
      if (res.ok) editor.syncImages(saved.id, assets);
    }
    editor.setDraft(null);
    setBusy(null);
    if (assets.length < ordered.length) {
      setError(copy.t("Saved, but some photos did not upload. Add them from the full editor."));
      return;
    }
    onBack();
  };

  const label = "text-[11px] font-semibold uppercase tracking-wider text-admin-ink-dim";
  const field =
    "mt-1.5 w-full rounded-lg border border-admin-border-soft bg-white px-3 py-2.5 text-[15px] text-admin-ink outline-none focus:border-emerald-900";
  const hero = shots[main];

  return (
    <div className="mx-auto flex w-full flex-col font-admin-body text-admin-ink" style={{ maxWidth: 420 }} lang={locale}>
      <div className="flex items-center gap-3 border-b border-admin-border-soft pb-3">
        <button type="button" onClick={onBack} aria-label={copy.t("Back")} className="-ml-1 p-1 text-[20px] leading-none">
          ‹
        </button>
        <div>
          <h1 className="text-[18px] font-semibold leading-tight">{copy.t("New service")}</h1>
          <p className="text-[12px] text-admin-ink-dim">{copy.t("Photo first")}</p>
        </div>
      </div>

      <input ref={addInput} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
      <input ref={retakeInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { retake(e.target.files); e.target.value = ""; }} />

      <div className="mt-3">
        {hero ? (
          <div className="relative overflow-hidden rounded-xl bg-black/[0.04]" style={{ aspectRatio: "6 / 5" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img src={hero.url} alt="" className="h-full w-full object-cover" />
            <span className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white">{copy.t("Just taken")}</span>
            <button type="button" onClick={() => retakeInput.current?.click()} className="absolute bottom-2.5 right-2.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white">
              {copy.t("Retake")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => addInput.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-admin-border-soft bg-black/[0.02] text-admin-ink-muted"
            style={{ aspectRatio: "6 / 5" }}
          >
            <span className="text-[28px] leading-none">+</span>
            <span className="text-[14px] font-medium text-admin-ink">{copy.t("Take a photo")}</span>
            <span className="text-[12px]">{copy.t("The photo comes first. The name comes next.")}</span>
          </button>
        )}

        {shots.length > 0 ? (
          <div className="mt-3 flex items-center gap-2">
            {shots.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setMain(i)}
                aria-label={copy.t("Use as main photo")}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded-md border ${i === main ? "border-emerald-900" : "border-transparent"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                <img src={s.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
            {shots.length < MAX_PHOTOS ? (
              <button
                type="button"
                onClick={() => addInput.current?.click()}
                aria-label={copy.t("Add a photo")}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-admin-border-soft text-[18px] text-admin-ink-muted"
              >
                +
              </button>
            ) : null}
            <span className="ml-1 text-[12px] text-admin-ink-dim">
              {copy.t("{n} of {max}").replace("{n}", String(shots.length)).replace("{max}", String(MAX_PHOTOS))}
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-3 rounded-xl border border-admin-border-soft bg-white p-4">
        <label className="block">
          <span className={label}>{copy.t("What is it called?")}</span>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className={label}>{copy.t("Price")}</span>
            <input className={field} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))} />
          </label>
          <label className="block">
            <span className={label}>{copy.t("Minutes")}</span>
            <input className={field} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^\d]/g, ""))} />
          </label>
        </div>
        <p className="mt-3 text-[12px] leading-5 text-admin-ink-dim">{rulesLine()}</p>
      </div>

      {error ? <p className="mt-3 text-[13px] text-red-700">{error}</p> : null}

      <div className="mt-3 flex gap-2.5 border-t border-admin-border-soft pt-3">
        <button
          type="button"
          disabled={!canSave}
          onClick={() => void save("draft")}
          className="flex-1 rounded-lg border border-admin-border-soft bg-white py-3 text-[15px] font-semibold disabled:opacity-50"
          style={{ maxWidth: 140 }}
        >
          {busy === "draft" ? copy.t("Saving…") : copy.t("Save draft")}
        </button>
        <button
          type="button"
          disabled={!canPublish}
          onClick={() => void save("published")}
          className="flex-[2] rounded-lg bg-emerald-900 py-3 text-[15px] font-semibold text-white disabled:opacity-50"
        >
          {busy === "published" ? copy.t("Publishing…") : copy.t("Publish now")}
        </button>
      </div>
    </div>
  );
}
