"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { demosFor } from "@/lib/talent-site/demos/registry";
import type { DemoDesign } from "@/lib/talent-site/demos/types";
import { getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";

const COPY = {
  en: { subject: "Preview with", look: "Look", reference: "reference" },
  es: { subject: "Vista previa con", look: "Aspecto", reference: "referencia" },
} as const;

const LABEL = "flex items-center gap-1.5 text-xs";
const SELECT =
  "rounded-md border border-black/30 bg-white px-2 py-1 text-xs text-black/90 opacity-100";

/**
 * Subject + look pickers for the Template Factory editor header. Writes
 * `?subject=` and `?look=` into the URL (the page re-renders server side with
 * the new demo talent / palette). Preview only: nothing is saved.
 */
export function ThemeTemplateSubjectPicker({
  design,
  subject,
  look,
  lang = "en",
}: {
  design: string;
  subject?: string | null;
  look?: string | null;
  lang?: "en" | "es";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = COPY[lang];
  const demos = demosFor(design as DemoDesign);
  const palettes = getGalleryDesign(design)?.palettes ?? [];

  const set = (key: "subject" | "look", value: string) => {
    const q = new URLSearchParams(params?.toString() ?? "");
    if (value) q.set(key, value);
    else q.delete(key);
    router.replace(`${pathname}?${q.toString()}`);
  };

  return (
    <div data-theme-template-picker="" className="flex flex-wrap items-center gap-3">
      <label className={LABEL}>
        <span className="text-black/80">{t.subject}</span>
        <select value={subject ?? ""} onChange={(e) => set("subject", e.target.value)} aria-label={t.subject} className={SELECT}>
          {demos.map((d) => (
            <option key={d.profileCode} value={d.profileCode}>
              {d.profileCode}
              {d.reference ? ` (${t.reference})` : ""}
            </option>
          ))}
        </select>
      </label>
      {palettes.length > 0 ? (
        <label className={LABEL}>
          <span className="text-black/80">{t.look}</span>
          <select value={look ?? palettes[0]?.key ?? ""} onChange={(e) => set("look", e.target.value)} aria-label={t.look} className={SELECT}>
            {palettes.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name[lang]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
