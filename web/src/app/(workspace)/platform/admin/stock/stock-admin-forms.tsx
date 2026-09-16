"use client";

/**
 * StockAdminForms — the interactive half of /platform/admin/stock: add a
 * licensed photo, generate one, and the grid of existing photos for the
 * selected type (or family pack) with retire / restore and manifest edits.
 * No colour literals (hex ratchet): Tailwind white/alpha utilities.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { LifestyleStockPhoto } from "@/lib/media/platform-stock";
import { IMAGE_ROLES } from "@/lib/site-admin/builder-core/site-templates";

import { actionGenerateStockImage, actionRetireStockImage, actionUpdateStockManifest, actionUploadStockImage } from "./actions";

const field = "rounded border border-white/20 bg-transparent px-2 py-1 text-sm";
const label = "flex flex-col gap-1 text-xs text-white/60";

export function StockAdminForms({
  family,
  typeId,
  photos,
  typeOptions,
}: {
  family: string;
  typeId: string | null;
  photos: LifestyleStockPhoto[];
  typeOptions: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<"upload" | "generate">("upload");

  const submit = (fd: FormData) => {
    setMessage(null);
    start(async () => {
      const res = mode === "upload" ? await actionUploadStockImage(fd) : await actionGenerateStockImage(fd);
      if (res.ok) {
        const d = res.data as { bytes: number; costUsd?: number };
        setMessage(`Saved (${Math.round(d.bytes / 1024)} KB${d.costUsd ? `, $${d.costUsd.toFixed(2)}` : ""}).`);
        router.refresh();
      } else {
        setMessage(res.error);
      }
    });
  };

  const retire = (id: string, retired: boolean) =>
    start(async () => {
      const res = await actionRetireStockImage(id, retired);
      setMessage(res.ok ? (retired ? "Retired." : "Restored.") : res.error);
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
            <input type="hidden" name="source" value="generated" />
            <input type="hidden" name="licence" value="generated-platform" />
            <label className={label}>
              Subject
              <textarea name="subject" required rows={3} placeholder="A nail technician finishing a manicure at a bright counter in Playa del Carmen" className={field} />
            </label>
            <label className={label}>
              Mood
              <input name="mood" placeholder="Warm, candid, mid-morning light." className={field} />
            </label>
          </>
        )}
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
        <button type="submit" disabled={pending} className="rounded bg-white px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50">
          {pending ? "Working…" : mode === "upload" ? "Add to library" : "Generate and add"}
        </button>
        {message ? <p className="text-xs text-white/70">{message}</p> : null}
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
                  </span>
                  <span>{p.retiredAt ? "retired" : p.source}</span>
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
                </div>
              </form>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
