"use client";

/**
 * StockAdminForms — the interactive half of /platform/admin/stock: add a
 * licensed photo, generate one, and the grid of existing photos for the
 * selected type (or family pack) with retire / restore and manifest edits.
 * No colour literals (hex ratchet): Tailwind white/alpha utilities.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ImageEngineSettings } from "@/lib/ai/ai-image-model";
import type { LifestyleStockPhoto } from "@/lib/media/platform-stock";
import { IMAGE_ROLES } from "@/lib/site-admin/builder-core/site-templates";
import { DIRECTION_IDS } from "@/lib/site-admin/builder-core/site-templates/stock-prompts";
import { IMAGE_SLOT_KEYS } from "@/lib/site-admin/builder-core/site-templates/types";

import { actionGenerateStockImage, actionRetireStockImage, actionReviewStockImage, actionSaveImageEngineSettings, actionSeedHeroesForType, actionUpdateStockManifest, actionUploadStockImage } from "./actions";

const field = "rounded border border-white/20 bg-transparent px-2 py-1 text-sm";
const label = "flex flex-col gap-1 text-xs text-white/60";

export function StockAdminForms({
  family,
  typeId,
  photos,
  typeOptions,
  settings,
  todayUsed,
}: {
  family: string;
  typeId: string | null;
  photos: LifestyleStockPhoto[];
  typeOptions: Array<{ id: string; label: string }>;
  settings: ImageEngineSettings;
  todayUsed: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<"upload" | "generate">("upload");

  const submit = (fd: FormData) => {
    setMessage(null);
    start(async () => {
      if (mode === "upload") {
        const res = await actionUploadStockImage(fd);
        setMessage(res.ok ? `Saved (${Math.round(res.data.bytes / 1024)} KB), approved.` : res.error);
      } else {
        const res = await actionGenerateStockImage(fd);
        if (res.ok) {
          const failed = Object.entries(res.data.qa as Record<string, { verdict: string; detail?: string }>).filter(([, c]) => c.verdict === "fail");
          setMessage(`Generated, $${res.data.costUsd.toFixed(4)} · ${res.data.approval === "qa_passed" ? "passed automated QA; awaiting review" : `rejected by QA: ${failed.map(([k, c]) => `${k}${c.detail ? ` (${c.detail})` : ""}`).join(", ")}`}`);
        } else setMessage(res.error);
      }
      router.refresh();
    });
  };

  const retire = (id: string, retired: boolean) =>
    start(async () => {
      const res = await actionRetireStockImage(id, retired);
      setMessage(res.ok ? (retired ? "Retired." : "Restored.") : res.error);
      router.refresh();
    });

  const review = (id: string, decision: "approve" | "reject") =>
    start(async () => {
      const note = decision === "reject" ? (window.prompt("Reason (kept for the audit):") ?? "") : "";
      const res = await actionReviewStockImage(id, decision, note);
      setMessage(res.ok ? (decision === "approve" ? "Approved; it serves now." : "Rejected.") : res.error);
      router.refresh();
    });

  const seedHeroes = () =>
    start(async () => {
      const res = await actionSeedHeroesForType(family, typeId);
      setMessage(res.ok ? `Heroes: ${res.data.generated} generated, ${res.data.passed} passed QA, $${res.data.costUsd.toFixed(3)}${res.data.errors.length ? ` · ${res.data.errors.join("; ")}` : ""}` : res.error);
      router.refresh();
    });

  const saveSettings = (fd: FormData) =>
    start(async () => {
      const res = await actionSaveImageEngineSettings(fd);
      setMessage(res.ok ? "Engine settings saved." : res.error);
      router.refresh();
    });

  const saveManifest = (fd: FormData) =>
    start(async () => {
      const res = await actionUpdateStockManifest(fd);
      setMessage(res.ok ? "Manifest saved." : res.error);
      router.refresh();
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      {/* Add */}
      <form action={submit} className="flex h-fit flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={() => setMode("upload")} className={`rounded-full border px-3 py-1 ${mode === "upload" ? "border-white/60 bg-white/10" : "border-white/10"}`}>
            Upload licensed
          </button>
          <button type="button" onClick={() => setMode("generate")} className={`rounded-full border px-3 py-1 ${mode === "generate" ? "border-white/60 bg-white/10" : "border-white/10"}`}>
            Generate
          </button>
        </div>
        <input type="hidden" name="family" value={family} />
        <label className={label}>
          Business type (blank = family pack)
          <select name="businessType" defaultValue={typeId ?? ""} className={field}>
            <option value="" className="text-black">
              Family pack · {family}
            </option>
            {typeOptions.map((t) => (
              <option key={t.id} value={t.id} className="text-black">
                {t.label} · {t.id}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Role
          <select name="role" defaultValue="hero" className={field}>
            {IMAGE_ROLES.map((r) => (
              <option key={r} value={r} className="text-black">
                {r}
              </option>
            ))}
          </select>
        </label>
        {mode === "upload" ? (
          <>
            <input type="hidden" name="source" value="licensed" />
            <label className={label}>
              File (any size; stored under 300 KB)
              <input type="file" name="file" accept="image/*" required className="text-sm" />
            </label>
            <label className={label}>
              Supplier
              <input name="supplier" placeholder="e.g. Pexels, own shoot" className={field} />
            </label>
            <label className={label}>
              Licence
              <input name="licence" required placeholder="e.g. Pexels licence, CC0, purchased" className={field} />
            </label>
          </>
        ) : (
          <>
            <label className={label}>
              Slot
              <select name="slot" defaultValue="hero" className={field}>
                {IMAGE_SLOT_KEYS.map((k) => (
                  <option key={k} value={k} className="text-black">
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Visual direction
              <select name="direction" defaultValue="editorial" className={field}>
                {DIRECTION_IDS.map((d) => (
                  <option key={d} value={d} className="text-black">
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Quality
              <select name="quality" defaultValue="medium" className={field}>
                <option value="medium" className="text-black">
                  medium (measured ≈ $0.011)
                </option>
                <option value="high" className="text-black">
                  high (≈ 3.8× the cost; per-asset regeneration only)
                </option>
              </select>
            </label>
            <p className="text-[11px] text-white/50">The prompt is the layered engine (global → family → type → slot → direction); the result goes through automated QA and waits for review.</p>
          </>
        )}
        {mode === "upload" ? (
          <>
            <label className={label}>
              Palette hint (optional)
              <input name="paletteHint" placeholder="warm neutrals, sage" className={field} />
            </label>
            <label className={label}>
              Alt text · español
              <input name="altEs" required placeholder="Manicurista terminando un diseño en gel" className={field} />
            </label>
            <label className={label}>
              Alt text · English
              <input name="altEn" required placeholder="Nail technician finishing a gel design" className={field} />
            </label>
          </>
        ) : null}
        <button type="submit" disabled={pending} className="rounded bg-white px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50">
          {pending ? "Working…" : mode === "upload" ? "Add to library" : "Generate and add"}
        </button>
        {message ? <p className="text-xs text-white/70">{message}</p> : null}
        <button type="button" onClick={seedHeroes} disabled={pending} className="rounded border border-white/30 px-3 py-1.5 text-xs text-white/80 disabled:opacity-50">
          Seed 5 heroes for {typeId ?? `the ${family} family pack`} (one per direction, medium)
        </button>
      </form>

      {/* Engine settings */}
      <form action={saveSettings} className="flex h-fit flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-4 text-xs lg:col-start-1">
        <h2 className="text-sm font-medium text-white/80">Image engine</h2>
        <p className="text-white/50">
          Today: {todayUsed} / {settings.dailyCap} images. Cost is measured from each reply, never a constant.
        </p>
        <label className={label}>
          Model id
          <input name="model" defaultValue={settings.model} className={field} />
        </label>
        <label className={label}>
          QA vision model id (empty = text/logo/type checks skipped)
          <input name="qaModel" defaultValue={settings.qaModel} className={field} />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className={label}>
            $/1M text in
            <input name="priceTextIn" type="number" step="0.01" min="0" defaultValue={settings.prices.textIn} className={field} />
          </label>
          <label className={label}>
            $/1M image in
            <input name="priceImageIn" type="number" step="0.01" min="0" defaultValue={settings.prices.imageIn} className={field} />
          </label>
          <label className={label}>
            $/1M output
            <input name="priceOutput" type="number" step="0.01" min="0" defaultValue={settings.prices.output} className={field} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>
            Daily image ceiling
            <input name="dailyCap" type="number" step="1" min="0" defaultValue={settings.dailyCap} className={field} />
          </label>
          <label className={label}>
            Builder regenerations per tenant
            <input name="regenPerTenant" type="number" step="1" min="0" defaultValue={settings.regenPerTenant} className={field} />
          </label>
        </div>
        <button type="submit" disabled={pending} className="w-fit rounded border border-white/30 px-3 py-1.5">
          Save settings
        </button>
      </form>

      {/* Existing */}
      <div>
        <h2 className="mb-2 text-sm font-medium text-white/80">
          {typeId ? `Photos for ${typeId}` : `Family pack · ${family}`} <span className="text-white/40">({photos.length})</span>
        </h2>
        {photos.length === 0 ? <p className="text-sm text-white/50">Nothing here yet.</p> : null}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {photos.map((p) => (
            <details key={p.id} className={`rounded-lg border border-white/10 bg-white/5 ${p.retiredAt ? "opacity-50" : ""}`}>
              <summary className="cursor-pointer list-none">
                {/* eslint-disable-next-line @next/next/no-img-element -- shared-bucket URL, unoptimised by design */}
                <img src={p.url} alt={p.alt.en} className="aspect-[4/3] w-full rounded-t-lg object-cover" />
                <div className="flex items-center justify-between px-2 py-1 text-[11px] text-white/60">
                  <span>
                    {p.role} · {p.businessType ?? "family"}
                    {p.direction ? ` · ${p.direction}` : ""}
                  </span>
                  <span>{p.retiredAt ? "retired" : p.approval === "approved" ? p.provenance : p.approval.replace("_", " ")}</span>
                </div>
              </summary>
              <form action={saveManifest} className="flex flex-col gap-2 p-2 text-xs">
                <input type="hidden" name="id" value={p.id} />
                <input name="altEs" defaultValue={p.alt.es} className={field} aria-label="Alt ES" />
                <input name="altEn" defaultValue={p.alt.en} className={field} aria-label="Alt EN" />
                <input name="licence" defaultValue={p.licence} className={field} aria-label="Licence" />
                <div className="flex gap-2">
                  <button type="submit" className="rounded border border-white/30 px-2 py-1">
                    Save
                  </button>
                  <button type="button" onClick={() => retire(p.id, !p.retiredAt)} className="rounded border border-white/30 px-2 py-1 text-white/70">
                    {p.retiredAt ? "Restore" : "Retire"}
                  </button>
                  {p.approval !== "approved" && !p.retiredAt ? (
                    <button type="button" onClick={() => review(p.id, "approve")} className="rounded border border-white/30 px-2 py-1 text-white/90">
                      Approve
                    </button>
                  ) : null}
                  {p.approval !== "rejected" && !p.retiredAt ? (
                    <button type="button" onClick={() => review(p.id, "reject")} className="rounded border border-white/30 px-2 py-1 text-white/60">
                      Reject
                    </button>
                  ) : null}
                </div>
              </form>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
