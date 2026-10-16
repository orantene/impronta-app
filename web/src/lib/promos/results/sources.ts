import type { Lang } from "./copy";

/** Icon keys the card maps to lucide icons. Pure so the grouping is testable. */
export type SourceIcon = "instagram" | "tiktok" | "whatsapp" | "qr" | "link" | "email" | "code" | "site" | "other";

export type SourceStat = { key: SourceIcon; count: number; label: string };

const GROUP: Readonly<Record<string, SourceIcon>> = {
  ig_story: "instagram", ig_post: "instagram", tiktok: "tiktok", wa: "whatsapp",
  qr: "qr", qr_print: "qr", link: "link", email: "email", code: "code", site: "site",
};

const LABEL: Record<Lang, Record<SourceIcon, string>> = {
  es: { instagram: "Instagram", tiktok: "TikTok", whatsapp: "WhatsApp", qr: "QR", link: "Enlace", email: "Correo", code: "Código", site: "Tu sitio", other: "Otros" },
  en: { instagram: "Instagram", tiktok: "TikTok", whatsapp: "WhatsApp", qr: "QR", link: "Link", email: "Email", code: "Code", site: "Your site", other: "Other" },
};

/** Groups bookings by channel (stories and posts together, QR and printed QR together), biggest first. Unknown and unrecognised go to "other". */
export function formatSources(bySource: Readonly<Record<string, number>>, lang: Lang): SourceStat[] {
  const totals = new Map<SourceIcon, number>();
  for (const [raw, n] of Object.entries(bySource)) {
    if (!(n > 0)) continue;
    const key = GROUP[raw] ?? "other";
    totals.set(key, (totals.get(key) ?? 0) + n);
  }
  return [...totals.entries()]
    .map(([key, count]) => ({ key, count, label: LABEL[lang][key] }))
    .sort((a, b) => (a.key === "other" ? 1 : b.key === "other" ? -1 : b.count - a.count));
}
