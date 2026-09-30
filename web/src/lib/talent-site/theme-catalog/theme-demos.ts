/**
 * Demo talents built on the Maison v2 and Folio designs (Demo Foundation
 * guide, 2026-09-30). One list feeds both the gallery (gallery-meta demos, the
 * "Demo content" preview allow-list) and the apply script
 * (scripts/demo-talents/apply-theme-demos.mts), so a demo shown in the gallery
 * is always a demo whose site draft wears that design.
 *
 * `live: true` demos already have a published site; the script only rewrites
 * their draft. The rest stay unpublished: the preview reads their draft.
 * Pure data, no hex (palette keys point at gallery-meta palettes).
 */

export type ThemeDemoDesign = "maison-v2" | "folio";

export type ThemeDemoProfession =
  | "nails"
  | "lashes"
  | "brows"
  | "bridal_makeup"
  | "hair"
  | "barber"
  | "model"
  | "singer";

export type ThemeDemo = {
  design: ThemeDemoDesign;
  /** Gallery demo key (`?demo=<design>:<key>`). */
  key: string;
  name: { en: string; es: string };
  professions: ThemeDemoProfession[];
  /** Gallery palette key of the design. */
  palette: string;
  profileCode: string;
  siteSlug: string;
  displayName: string;
  live: boolean;
};

export const THEME_DEMOS: readonly ThemeDemo[] = [
  // Maison v2 (after the featured Alba demo)
  { design: "maison-v2", key: "nail-artist", name: { en: "Nail Artist", es: "Manicurista" }, professions: ["nails"], palette: "rose", profileCode: "TAL-93003", siteSlug: "camila-nails", displayName: "Camila Rivas", live: true },
  { design: "maison-v2", key: "lash-artist", name: { en: "Lash Artist", es: "Lashista" }, professions: ["lashes"], palette: "rose", profileCode: "TAL-93002", siteSlug: "renata-lashes", displayName: "Renata Salgado", live: true },
  { design: "maison-v2", key: "nails-lashes-linh", name: { en: "Nails & Lashes", es: "Uñas y pestañas" }, professions: ["nails", "lashes"], palette: "blush", profileCode: "TAL-93103", siteSlug: "linh-tran", displayName: "Linh Tran", live: false },
  { design: "maison-v2", key: "brow-artist", name: { en: "Brow Artist", es: "Cejas" }, professions: ["brows"], palette: "porcelain", profileCode: "TAL-93104", siteSlug: "leo-haddad", displayName: "Leo Haddad Brows", live: false },
  { design: "maison-v2", key: "makeup-artist", name: { en: "Makeup Artist", es: "Maquillista" }, professions: ["bridal_makeup"], palette: "noir-rose", profileCode: "TAL-93105", siteSlug: "sofia-rinaldi", displayName: "Sofía Rinaldi", live: false },
  { design: "maison-v2", key: "hair-stylist", name: { en: "Hair Stylist", es: "Estilista" }, professions: ["hair"], palette: "sage", profileCode: "TAL-93106", siteSlug: "marcus-bell", displayName: "Marcus Bell", live: false },
  { design: "maison-v2", key: "barber", name: { en: "Barber", es: "Barbero" }, professions: ["barber"], palette: "porcelain", profileCode: "TAL-93107", siteSlug: "terrence-coleman", displayName: "Coleman Cuts", live: false },
  // Folio (after the featured Mateo demo)
  { design: "folio", key: "fashion-model-lucia", name: { en: "Fashion Model", es: "Modelo de moda" }, professions: ["model"], palette: "stone", profileCode: "TAL-93004", siteSlug: "lucia-herrera", displayName: "Lucía Herrera", live: true },
  { design: "folio", key: "commercial-model", name: { en: "Commercial Model", es: "Modelo comercial" }, professions: ["model"], palette: "light", profileCode: "TAL-93109", siteSlug: "priya-shah", displayName: "Priya Shah", live: false },
  { design: "folio", key: "fitness-model", name: { en: "Fitness Model", es: "Modelo fitness" }, professions: ["model"], palette: "dark", profileCode: "TAL-93110", siteSlug: "andre-castillo", displayName: "Andre Castillo", live: false },
  { design: "folio", key: "runway-model", name: { en: "Runway Model", es: "Modelo de pasarela" }, professions: ["model"], palette: "stone", profileCode: "TAL-93111", siteSlug: "noemi-castaneda", displayName: "Noemí Castañeda", live: false },
  { design: "folio", key: "hand-model", name: { en: "Hand Model", es: "Modelo de manos" }, professions: ["model"], palette: "light", profileCode: "TAL-93112", siteSlug: "daniel-kim", displayName: "Daniel Kim", live: false },
  { design: "folio", key: "mature-model", name: { en: "Mature Model", es: "Modelo senior" }, professions: ["model"], palette: "stone", profileCode: "TAL-93113", siteSlug: "elena-garza-trevino", displayName: "Elena Garza Treviño", live: false },
  { design: "folio", key: "model-singer", name: { en: "Model & Singer", es: "Modelo y cantante" }, professions: ["model", "singer"], palette: "dark", profileCode: "TAL-93114", siteSlug: "rafael-hernandez-cuevas", displayName: "Rafa Cuevas", live: false },
];

export function themeDemosFor(design: ThemeDemoDesign): ThemeDemo[] {
  return THEME_DEMOS.filter((d) => d.design === design);
}
