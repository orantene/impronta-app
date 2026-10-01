"use client";

import { useState, useTransition } from "react";

import { actionSaveAsNewDesign } from "./new-design-actions";

const COPY = {
  en: {
    open: "Save as new design",
    title: "Save as new design",
    lead: "Copies the design you are editing into a new design with its own name. It opens in this editor and stays hidden from talents until you release it.",
    nameEn: "Name (English)",
    nameEs: "Name (Spanish)",
    cancel: "Cancel",
    create: "Create design",
    creating: "Creating...",
    required: "Enter a name in both languages.",
  },
  es: {
    open: "Guardar como diseño nuevo",
    title: "Guardar como diseño nuevo",
    lead: "Copia el diseño que estás editando en un diseño nuevo con su propio nombre. Se abre en este editor y queda oculto para los talentos hasta que lo publiques.",
    nameEn: "Nombre (inglés)",
    nameEs: "Nombre (español)",
    cancel: "Cancelar",
    create: "Crear diseño",
    creating: "Creando...",
    required: "Escribe un nombre en los dos idiomas.",
  },
} as const;

const field = "mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white";
const btn = "rounded border border-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50";

export function SaveAsNewDesignDialog({
  sourceDesign,
  lang = "en",
  onCreated,
}: {
  sourceDesign: string;
  lang?: "en" | "es";
  /** Receives the editor href of the new design; default navigates there. */
  onCreated?: (href: string) => void;
}) {
  const t = COPY[lang];
  const [open, setOpen] = useState(false);
  const [nameEn, setNameEn] = useState("");
  const [nameEs, setNameEs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (!nameEn.trim() || !nameEs.trim()) {
      setError(t.required);
      return;
    }
    setError(null);
    start(async () => {
      const res = await actionSaveAsNewDesign({ sourceDesign, nameEn, nameEs });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      if (onCreated) onCreated(res.data.href);
      else window.location.assign(res.data.href);
    });
  }

  return (
    <>
      <button type="button" className={btn} onClick={() => setOpen(true)} data-save-as-new-design>
        {t.open}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div role="dialog" aria-modal="true" aria-label={t.title} className="w-full max-w-md rounded-lg border border-white/15 bg-neutral-900 p-5 text-white">
            <h2 className="text-base font-semibold">{t.title}</h2>
            <p className="mt-1 text-xs text-white/60">{t.lead}</p>
            <label className="mt-4 block text-xs text-white/70">
              {t.nameEn}
              <input className={field} value={nameEn} maxLength={80} onChange={(e) => setNameEn(e.target.value)} />
            </label>
            <label className="mt-3 block text-xs text-white/70">
              {t.nameEs}
              <input className={field} value={nameEs} maxLength={80} onChange={(e) => setNameEs(e.target.value)} />
            </label>
            {error ? <p role="alert" className="mt-3 text-xs text-red-300">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={btn} onClick={() => setOpen(false)} disabled={pending}>
                {t.cancel}
              </button>
              <button type="button" className={btn} onClick={submit} disabled={pending}>
                {pending ? t.creating : t.create}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
