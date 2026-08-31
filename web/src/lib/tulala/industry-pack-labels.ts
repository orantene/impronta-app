/**
 * industry-pack-labels.ts — pack names, and nothing else.
 *
 * Split out so the browser can render "Massage and bodywork" without shipping
 * the pack module, which carries every pack's questions in two languages plus
 * the matcher. Six words did not justify that bundle.
 *
 * It is a SOURCE, not a copy: `industry-packs.ts` reads its labels from here, so
 * there is one place a pack is named and no way for the panel to disagree with
 * the intake about what it recognised.
 */

export type PackLabel = Record<"en" | "es", string>;

export const INDUSTRY_PACK_LABELS: Readonly<Record<string, PackLabel>> = {
  massage: { en: "Massage and bodywork", es: "Masaje y terapia corporal" },
  beauty: { en: "Beauty and grooming", es: "Belleza y estética" },
  chef: { en: "Private chef and catering", es: "Chef privado y catering" },
  model: { en: "Modelling", es: "Modelaje" },
  music: { en: "Music and performance", es: "Música y espectáculo" },
  photo: { en: "Photography and video", es: "Fotografía y video" },
};

export function packLabel(packId: string | null, locale: "en" | "es"): string | null {
  if (!packId) return null;
  return INDUSTRY_PACK_LABELS[packId]?.[locale] ?? null;
}
