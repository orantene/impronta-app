/**
 * Business-type registry — 120 searchable types over 12 families.
 *
 * Orthogonal to `INDUSTRY_PRESET_IDS` (the 20 word/feature bundles).
 * A type picks a family; a family suggests a preset; vocabulary and
 * capabilities are resolved separately (theme-layers.ts).
 *
 * The two product documents are not in this workspace. IDs below are the
 * authorized case-study types plus the existing preset slugs. Remaining
 * catalog rows wait on the verbatim files — do not invent them.
 */

import { INDUSTRY_PRESET_IDS, type IndustryPresetId } from "./presets";

export const BUSINESS_FAMILIES = [
  "dining",
  "beauty",
  "wellness",
  "fitness",
  "events",
  "agency",
  "professional",
  "education",
  "hospitality",
  "craft",
  "tours",
  "custom",
] as const;

export type BusinessFamilyId = (typeof BUSINESS_FAMILIES)[number];

export type BusinessType = {
  readonly id: string;
  readonly family: BusinessFamilyId;
  readonly preset: IndustryPresetId;
  readonly label: { readonly en: string; readonly es: string };
  readonly aliases: readonly string[];
};

export const FAMILY_DEFAULT_PRESET: Readonly<Record<BusinessFamilyId, IndustryPresetId>> = {
  dining: "restaurant",
  beauty: "salon_barber",
  wellness: "spa_wellness",
  fitness: "studio_gym",
  events: "venue_for_hire",
  agency: "agency",
  professional: "practice",
  education: "studio_gym",
  hospitality: "coworking",
  craft: "workshop_print",
  tours: "tours_activities",
  custom: "custom",
};

function t(
  id: string,
  family: BusinessFamilyId,
  en: string,
  es: string,
  aliases: readonly string[] = [],
  preset?: IndustryPresetId,
): BusinessType {
  return {
    id,
    family,
    preset: preset ?? FAMILY_DEFAULT_PRESET[family],
    label: { en, es },
    aliases,
  };
}

/** Authorized types from the 48 cases and the 20 live presets. */
export const BUSINESS_TYPES: readonly BusinessType[] = [
  t("restaurant", "dining", "Restaurant", "Restaurante", ["restaurante"], "restaurant"),
  t("bar", "dining", "Bar", "Bar", ["bar_club"], "bar_club"),
  t("beach-club", "dining", "Beach club", "Beach club", [], "beach_club"),
  t("sushi-restaurant", "dining", "Sushi restaurant", "Restaurante de sushi"),
  t("home-takeaway", "dining", "Home takeaway", "Comida para llevar"),
  t("nail-salon", "beauty", "Nail salon", "Salón de uñas"),
  t("hair-salon", "beauty", "Hair salon", "Peluquería"),
  t("eyelash-studio", "beauty", "Eyelash studio", "Estudio de pestañas"),
  t("makeup-artist", "beauty", "Makeup artist", "Maquillador"),
  t("spa", "wellness", "Spa", "Spa", [], "spa_wellness"),
  t("massage-therapist", "wellness", "Massage therapist", "Masajista"),
  t("tattoo-studio", "wellness", "Tattoo studio", "Estudio de tatuaje"),
  t("yoga-studio", "fitness", "Yoga studio", "Estudio de yoga", [], "studio_gym"),
  t("personal-trainer", "fitness", "Personal trainer", "Entrenador personal"),
  t("padel-club", "fitness", "Padel club", "Club de pádel", [], "sports_venue"),
  t("event-venue", "events", "Event venue", "Salón de eventos", [], "venue_for_hire"),
  t("art-gallery", "events", "Art gallery", "Galería"),
  t("independent-dj", "events", "DJ", "DJ", [], "act"),
  t("independent-musician", "events", "Musician", "Músico", [], "act"),
  t("event-host", "events", "Event host", "Animador", [], "act"),
  t("talent-agency", "agency", "Talent agency", "Agencia de talento", [], "agency"),
  t("photography-studio", "agency", "Photography studio", "Estudio fotográfico", [], "portfolio"),
  t("social-media-agency", "agency", "Social media agency", "Agencia de redes"),
  t("provisional-service", "agency", "Provisional service profile", "Perfil provisional"),
  t("immigration-practice", "professional", "Immigration practice", "Gestión migratoria"),
  t("private-chef", "professional", "Private chef", "Chef privado"),
  t("house-cleaner", "professional", "House cleaner", "Limpieza"),
  t("handyman", "professional", "Handyman", "Remises / oficios"),
  t("translator", "professional", "Translator", "Traductor"),
  t("voice-over", "professional", "Voice-over artist", "Locutor"),
  t("car-detailing", "professional", "Mobile car detailing", "Detailing móvil", [], "dropoff_service"),
  t("language-tutor", "education", "Language tutor", "Profesor de idiomas"),
  t("yoga-instructor", "education", "Yoga instructor", "Instructor de yoga"),
  t("beauty-academy", "education", "Beauty academy", "Academia de belleza"),
  t("cooking-school", "education", "Cooking school", "Escuela de cocina"),
  t("diving-school", "education", "Diving school", "Escuela de buceo"),
  t("corporate-training", "education", "Corporate training", "Capacitación corporativa"),
  t("coworking", "hospitality", "Coworking", "Coworking", [], "coworking"),
  t("podcast-studio", "hospitality", "Podcast studio", "Estudio de podcast", [], "rentals"),
  t("floral-studio", "craft", "Floral studio", "Estudio floral"),
  t("custom-jewelry", "craft", "Custom jewelry", "Joyería a medida"),
  t("escape-room", "craft", "Escape room", "Escape room"),
  t("private-tours", "tours", "Private tours", "Tours privados", [], "tours_activities"),
  t("portrait-photographer", "craft", "Portrait photographer", "Fotógrafo de retrato", [], "portfolio"),
  t("dog-walker", "professional", "Dog walker", "Paseador de perros"),
  t("pet-grooming", "beauty", "Pet grooming", "Peluquería canina"),
  t("wellness-retreat", "wellness", "Wellness retreat", "Retiro de bienestar"),
  t("clinic", "wellness", "Clinic", "Clínica", [], "clinic"),
  t("theatre", "events", "Theatre", "Teatro", [], "theatre_cinema"),
  t("custom", "custom", "Custom", "Personalizado", [], "custom"),
];

export const BUSINESS_TYPE_CATALOG_TARGET = 120;

export function businessTypeById(id: string): BusinessType | undefined {
  return BUSINESS_TYPES.find((row) => row.id === id);
}

export function typesInFamily(family: BusinessFamilyId): readonly BusinessType[] {
  return BUSINESS_TYPES.filter((row) => row.family === family);
}

export function searchBusinessTypes(query: string): BusinessType[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...BUSINESS_TYPES];
  return BUSINESS_TYPES.filter((row) => {
    const blob = [row.id, row.label.en, row.label.es, ...row.aliases].join(" ").toLowerCase();
    return blob.includes(q);
  });
}

export function assertPresetKnown(id: IndustryPresetId): boolean {
  return (INDUSTRY_PRESET_IDS as readonly string[]).includes(id);
}
