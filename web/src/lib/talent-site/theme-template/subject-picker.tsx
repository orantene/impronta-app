"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { demosFor } from "@/lib/talent-site/demos/registry";
import type { DemoDesign } from "@/lib/talent-site/demos/types";
import { getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";

const COPY = {
  en: { subject: "Preview with", look: "Look", reference: "reference" },
  es: { subject: "Vista previa con", look: "Aspecto", reference: "referencia" },
} as const;

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
    <div data-theme-template-picker="" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <span>{t.subject}</span>
        <select value={subject ?? ""} onChange={(e) => set("subject", e.target.value)} aria-label={t.subject}>
          {demos.map((d) => (
            <option key={d.profileCode} value={d.profileCode}>
              {d.profileCode}
              {d.reference ? ` (${t.reference})` : ""}
            </option>
          ))}
        </select>
      </label>
      {palettes.length > 0 ? (
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <span>{t.look}</span>
          <select value={look ?? palettes[0]?.key ?? ""} onChange={(e) => set("look", e.target.value)} aria-label={t.look}>
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
