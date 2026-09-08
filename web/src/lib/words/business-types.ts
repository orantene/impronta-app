/**
 * Business-type registry — searchable types over 12 families.
 *
 * Orthogonal to `INDUSTRY_PRESET_IDS` (the 20 word/feature bundles).
 * A type picks a family; a family suggests a preset; vocabulary and
 * capabilities are resolved separately (theme-layers.ts).
 *
 * IDs for the 48 cases are stable. Remaining rows come from
 * Business-specific-labels-Workspace-Theme.md tables 7.2–7.13.
 * `custom` / Other business is a fallback outside the 120.
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

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Authorized types from the 48 cases, live presets, and theme tables 7.2–7.13. */
export const BUSINESS_TYPES: readonly BusinessType[] = [
  t("restaurant", "dining", "Restaurant", "Restaurante", ["dining", "restaurante"], "restaurant"),
  t("bar", "dining", "Bar", "Bar", ["drinks bar", "bar_club"], "bar_club"),
  t("beach-club", "dining", "Beach club", "Beach club", ["beach day", "club de playa"], "beach_club"),
  t("sushi-restaurant", "dining", "Sushi restaurant", "Restaurante de sushi", ["sushi"]),
  t("home-takeaway", "dining", "Home takeaway", "Comida para llevar", ["takeaway kitchen", "takeout", "comida para llevar"]),
  t("nail-salon", "beauty", "Nail salon", "Salón de uñas", ["manicure", "unas", "uñas", "salón de uñas"], "salon_barber"),
  t("hair-salon", "beauty", "Hair salon", "Peluquería", ["hairdresser", "peluqueria", "peluquería"], "salon_barber"),
  t("eyelash-studio", "beauty", "Eyelash studio", "Estudio de pestañas", ["lash studio", "eyelash extensions", "pestañas"]),
  t("makeup-artist", "beauty", "Makeup artist", "Maquillador", ["makeup", "maquillista"]),
  t("spa", "wellness", "Spa", "Spa", ["day spa", "spa de día", "spa de dia"], "spa_wellness"),
  t("massage-therapist", "wellness", "Massage therapist", "Masajista", ["massage", "independent massage therapist", "masajista"]),
  t("tattoo-studio", "wellness", "Tattoo studio", "Estudio de tatuaje", ["tattoo artist", "tatuajes"]),
  t("yoga-studio", "fitness", "Yoga studio", "Estudio de yoga", ["yoga classes", "estudio de yoga"], "studio_gym"),
  t("personal-trainer", "fitness", "Personal trainer", "Entrenador personal", ["fitness coach", "entrenador personal"]),
  t("padel-club", "fitness", "Padel club", "Club de pádel", ["padel courts", "pádel", "padel"], "sports_venue"),
  t("event-venue", "events", "Event venue", "Salón de eventos", ["event hall", "salón de eventos", "salon de eventos"], "venue_for_hire"),
  t("art-gallery", "events", "Art gallery", "Galería", ["gallery", "galería de arte", "galeria"]),
  t("independent-dj", "events", "DJ", "DJ", ["disc jockey", "dj", "dj para eventos"], "act"),
  t("independent-musician", "events", "Musician", "Músico", ["live band", "music group", "banda musical"], "act"),
  t("event-host", "events", "Event host", "Animador", ["mc", "host"], "act"),
  t("talent-agency", "agency", "Talent agency", "Agencia de talento", ["talent management", "agencia de talentos"], "agency"),
  t("photography-studio", "agency", "Photography studio", "Estudio fotográfico", ["photo studio", "estudio fotografico"], "portfolio"),
  t("social-media-agency", "agency", "Social media agency", "Agencia de redes", ["influencer agency"]),
  t("provisional-service", "agency", "Provisional service profile", "Perfil provisional", []),
  t("immigration-practice", "professional", "Immigration practice", "Gestión migratoria", []),
  t("private-chef", "professional", "Private chef", "Chef privado", ["chef at home", "chef privado"]),
  t("house-cleaner", "professional", "House cleaner", "Limpieza", ["home cleaning", "limpieza de casas"]),
  t("handyman", "professional", "Handyman", "mantenimiento del hogar", ["handyman service", "home repairs", "mantenimiento del hogar"]),
  t("translator", "professional", "Translator", "Traductor", ["translation", "traductor"]),
  t("voice-over", "professional", "Voice-over artist", "Locutor", ["voice over"]),
  t("car-detailing", "professional", "Mobile car detailing", "Detailing móvil", ["car cleaning", "detallado automotriz", "mobile car detailing"], "dropoff_service"),
  t("language-tutor", "education", "Language tutor", "Profesor de idiomas", ["private tutor", "tutoring", "profesor particular"]),
  t("yoga-instructor", "education", "Yoga instructor", "Instructor de yoga", []),
  t("beauty-academy", "education", "Beauty academy", "Academia de belleza", ["beauty school", "academia de belleza"]),
  t("cooking-school", "education", "Cooking school", "Escuela de cocina", ["cooking class", "escuela de cocina"]),
  t("diving-school", "education", "Diving school", "Escuela de buceo", ["scuba", "escuela de buceo"]),
  t("corporate-training", "education", "Corporate training", "Capacitación corporativa", ["business workshop", "capacitacion empresarial"]),
  t("coworking", "hospitality", "Coworking", "Coworking", ["shared office", "coworking space"], "coworking"),
  t("podcast-studio", "hospitality", "Podcast studio", "Estudio de podcast", ["podcast recording", "estudio de podcast"], "rentals"),
  t("floral-studio", "craft", "Floral studio", "Estudio floral", ["florist events", "diseño floral"]),
  t("custom-jewelry", "craft", "Custom jewelry", "Joyería a medida", []),
  t("escape-room", "craft", "Escape room", "Escape room", ["escape game", "sala de escape"]),
  t("private-tours", "tours", "Private tours", "Tours privados", ["local tour guide", "walking tour", "guía turístico"], "tours_activities"),
  t("portrait-photographer", "craft", "Portrait photographer", "Fotógrafo de retrato", ["independent photographer", "photographer", "fotógrafo"], "portfolio"),
  t("dog-walker", "professional", "Dog walker", "Paseador de perros", []),
  t("pet-grooming", "beauty", "Pet grooming", "Peluquería canina", ["groomer", "estética canina", "pet grooming salon"]),
  t("wellness-retreat", "wellness", "Wellness retreat", "Retiro de bienestar", ["wellness retreat organiser", "retiro de bienestar"]),
  t("clinic", "wellness", "Clinic", "Clínica", [], "clinic"),
  t("theatre", "events", "Theatre", "Teatro", ["theater", "teatro"], "theatre_cinema"),
  t("barber-shop", "beauty", "Barber shop", "Barbería", ["barber", "barberia"], "salon_barber"),
  t("brow-studio", "beauty", "Brow studio", "Estudio de cejas", ["eyebrow shaping", "cejas"]),
  t("bridal-beauty-team", "beauty", "Bridal beauty team", "Equipo de belleza nupcial", ["wedding makeup", "maquillaje de novia"]),
  t("waxing-studio", "beauty", "Waxing studio", "Estudio de depilación", ["hair removal", "depilacion"]),
  t("piercing-studio", "beauty", "Piercing studio", "Estudio de piercing", ["body piercing", "perforaciones"]),
  t("mobile-massage-service", "wellness", "Mobile massage service", "Masaje a domicilio", ["home massage", "masaje a domicilio"]),
  t("couples-treatment-spa", "wellness", "Couples treatment spa", "Spa para parejas", ["couples massage", "masaje en pareja"], "spa_wellness"),
  t("sauna-and-steam-bath", "wellness", "Sauna and steam bath", "Sauna y baño de vapor", ["sauna", "baño de vapor"]),
  t("float-therapy-centre", "wellness", "Float therapy centre", "Centro de flotación", ["float tank", "flotacion"]),
  t("meditation-practitioner", "wellness", "Meditation practitioner", "Practicante de meditación", ["meditation", "meditacion"]),
  t("breathwork-facilitator", "wellness", "Breathwork facilitator", "Facilitador de respiración", ["breathwork", "respiracion consciente"]),
  t("sound-bath-studio", "wellness", "Sound bath studio", "Estudio de baño de sonido", ["sound healing", "baño de sonido"]),
  t("pilates-studio", "fitness", "Pilates studio", "Estudio de pilates", ["reformer pilates", "pilates"], "studio_gym"),
  t("gym", "fitness", "Gym", "Gimnasio", ["fitness centre", "gimnasio"], "studio_gym"),
  t("dance-studio", "fitness", "Dance studio", "Academia de baile", ["dance lessons", "academia de baile"]),
  t("martial-arts-school", "fitness", "Martial arts school", "Escuela de artes marciales", ["karate", "artes marciales"]),
  t("boxing-studio", "fitness", "Boxing studio", "Estudio de boxeo", ["boxing gym", "boxeo"]),
  t("swimming-school", "fitness", "Swimming school", "Escuela de natación", ["swim lessons", "natacion"], "sports_venue"),
  t("tennis-coaching-business", "fitness", "Tennis coaching business", "Clases de tenis", ["tennis lessons", "clases de tenis"], "sports_venue"),
  t("language-school", "education", "Language school", "Escuela de idiomas", ["language lessons", "escuela de idiomas"]),
  t("music-school", "education", "Music school", "Escuela de música", ["music lessons", "escuela de musica"]),
  t("singing-coach", "education", "Singing coach", "Coach de canto", ["vocal lessons", "clases de canto"]),
  t("art-workshop-studio", "education", "Art workshop studio", "Taller de arte", ["art classes", "taller de arte"]),
  t("pottery-studio", "education", "Pottery studio", "Taller de cerámica", ["ceramics", "ceramica"]),
  t("photography-school", "education", "Photography school", "Escuela de fotografía", ["photography course", "curso de fotografia"]),
  t("cafe", "dining", "Cafe", "Cafetería", ["coffee shop", "cafeteria"], "restaurant"),
  t("bakery-cafe", "dining", "Bakery cafe", "Panadería", ["bakery", "panaderia"]),
  t("pizzeria", "dining", "Pizzeria", "Pizzería", ["pizza restaurant", "pizzeria"]),
  t("food-truck", "dining", "Food truck", "Camión de comida", ["mobile food", "camion de comida"]),
  t("catering-company", "dining", "Catering company", "Catering", ["caterer", "catering"]),
  t("dessert-shop", "dining", "Dessert shop", "Postrería", ["sweets", "postreria"]),
  t("ice-cream-shop", "dining", "Ice cream shop", "Heladería", ["gelato", "heladeria"]),
  t("cocktail-lounge", "dining", "Cocktail lounge", "Coctelería", ["cocktails", "cocteleria"], "bar_club"),
  t("nightclub", "events", "Nightclub", "Discoteca", ["club night", "discoteca"], "bar_club"),
  t("live-music-venue", "events", "Live music venue", "Sala de conciertos", ["concert bar", "musica en vivo"], "theatre_cinema"),
  t("karaoke-venue", "events", "Karaoke venue", "Karaoke", ["karaoke rooms", "karaoke"], "rentals"),
  t("rooftop-lounge", "dining", "Rooftop lounge", "Terraza bar", ["rooftop bar", "terraza bar"], "bar_club"),
  t("wine-tasting-room", "dining", "Wine tasting room", "Sala de catas", ["wine tasting", "cata de vinos"]),
  t("brewery-taproom", "dining", "Brewery taproom", "Cervecería", ["craft beer", "cerveceria"], "bar_club"),
  t("pool-club", "dining", "Pool club", "Club de piscina", ["pool day pass", "club de piscina"], "beach_club"),
  t("modelling-agency", "agency", "Modelling agency", "Agencia de modelos", ["model agency", "agencia de modelos", "modelos"], "agency"),
  t("casting-agency", "agency", "Casting agency", "Agencia de casting", ["casting"], "agency"),
  t("influencer-agency", "agency", "Influencer agency", "Agencia de influencers", ["creator management", "agencia de influencers"], "agency"),
  t("music-booking-agency", "agency", "Music booking agency", "Contratación musical", ["artist booking", "contratacion musical"], "agency"),
  t("entertainment-agency", "agency", "Entertainment agency", "Agencia de entretenimiento", ["entertainers"], "agency"),
  t("event-staffing-agency", "agency", "Event staffing agency", "Personal para eventos", ["event staff", "personal para eventos"], "agency"),
  t("promotional-staffing-agency", "agency", "Promotional staffing agency", "Agencia de promotores", ["brand ambassadors", "promotores"], "agency"),
  t("videography-business", "craft", "Videography business", "Videógrafo", ["videographer", "videografo"], "portfolio"),
  t("recording-studio", "hospitality", "Recording studio", "Estudio de grabación", ["audio studio", "estudio de grabacion"], "rentals"),
  t("graphic-design-studio", "craft", "Graphic design studio", "Estudio de diseño gráfico", ["graphic designer", "diseño grafico"], "workshop_print"),
  t("branding-agency", "agency", "Branding agency", "Agencia de branding", ["brand design"], "agency"),
  t("web-design-agency", "agency", "Web design agency", "Agencia de diseño web", ["website designer", "diseño web"], "agency"),
  t("content-production-studio", "craft", "Content production studio", "Estudio de contenido", ["content creator", "creacion de contenido"], "portfolio"),
  t("wedding-venue", "hospitality", "Wedding venue", "Lugar para bodas", ["wedding hall", "lugar para bodas"], "venue_for_hire"),
  t("conference-centre", "hospitality", "Conference centre", "Centro de convenciones", ["conference rooms", "centro de convenciones"], "venue_for_hire"),
  t("meeting-room-rental", "hospitality", "Meeting room rental", "Sala de reuniones", ["meeting space", "sala de reuniones"], "rentals"),
  t("rehearsal-room-rental", "hospitality", "Rehearsal room rental", "Sala de ensayo", ["rehearsal studio", "sala de ensayo"], "rentals"),
  t("pop-up-event-space", "hospitality", "Pop-up event space", "Espacio temporal", ["pop-up venue", "espacio temporal"], "venue_for_hire"),
  t("sports-court-rental", "fitness", "Sports court rental", "Alquiler de canchas", ["court hire", "alquiler de canchas"], "sports_venue"),
  t("tour-operator", "tours", "Tour operator", "Operador turístico", ["excursions", "operador turistico"], "tours_activities"),
  t("boat-excursion-operator", "tours", "Boat excursion operator", "Paseos en barco", ["boat tour", "paseo en barco"], "tours_activities"),
  t("surf-school", "tours", "Surf school", "Escuela de surf", ["surf lessons", "escuela de surf"], "tours_activities"),
  t("snorkelling-guide", "tours", "Snorkelling guide", "Guía de snorkel", ["snorkel tour", "guia de snorkel"], "tours_activities"),
  t("horse-riding-experience", "tours", "Horse riding experience", "Paseo a caballo", ["riding tour", "paseo a caballo"], "tours_activities"),
  t("food-tour-operator", "tours", "Food tour operator", "Tour gastronómico", ["culinary tour", "tour gastronomico"], "tours_activities"),
  t("attraction-day-pass-operator", "events", "Attraction day-pass operator", "Pases de atracción", ["attraction tickets", "entrada de día"], "theatre_cinema"),
  t("business-consultant", "professional", "Business consultant", "Consultor de negocios", ["consulting", "consultor de negocios"], "practice"),
  t("career-coach", "professional", "Career coach", "Orientación profesional", ["career coaching", "orientacion profesional"], "practice"),
  t("life-coach", "professional", "Life coach", "Coach personal", ["coaching", "coach personal"], "practice"),
  t("interpreter", "professional", "Interpreter", "Intérprete", ["interpreting", "interprete"], "practice"),
  t("wedding-planner", "professional", "Wedding planner", "Organizador de bodas", ["wedding planning", "organizador de bodas"], "practice"),
  t("event-planner", "professional", "Event planner", "Organizador de eventos", ["event planning", "organizador de eventos"], "practice"),
  t("interior-designer", "professional", "Interior designer", "Diseñador de interiores", ["interior design", "diseño de interiores"], "practice"),
  t("personal-stylist", "professional", "Personal stylist", "Asesor de imagen", ["styling", "asesor de imagen"], "practice"),
  t("virtual-assistant-business", "professional", "Virtual assistant business", "Asistente virtual", ["admin support", "asistente virtual"], "practice"),
  t("commercial-cleaning-company", "professional", "Commercial cleaning company", "Limpieza de oficinas", ["office cleaning", "limpieza de oficinas"], "dropoff_service"),
  t("laundry-service", "professional", "Laundry service", "Lavandería", ["wash and fold", "lavanderia"], "dropoff_service"),
  t("dry-cleaning-service", "professional", "Dry cleaning service", "Tintorería", ["garment cleaning", "tintoreria"], "dropoff_service"),
  t("dog-trainer", "professional", "Dog trainer", "Adiestramiento canino", ["dog training", "adiestramiento canino"]),
  t("pet-sitter", "professional", "Pet sitter", "Cuidado de mascotas", ["pet sitting", "cuidado de mascotas"]),
  t("home-organisation-service", "professional", "Home organisation service", "Organización del hogar", ["home organiser", "organizacion del hogar"], "dropoff_service"),
  t("custom", "custom", "Custom", "Personalizado", ["other business", "otro negocio"], "custom"),
];

export const BUSINESS_TYPE_CATALOG_TARGET = 120;

export function catalogBusinessTypes(): readonly BusinessType[] {
  return BUSINESS_TYPES.filter((row) => row.id !== "custom");
}

export function businessTypeById(id: string): BusinessType | undefined {
  return BUSINESS_TYPES.find((row) => row.id === id);
}

export function typesInFamily(family: BusinessFamilyId): readonly BusinessType[] {
  return BUSINESS_TYPES.filter((row) => row.family === family);
}

export function searchBusinessTypes(query: string): BusinessType[] {
  const q = fold(query.trim());
  const catalog = [...catalogBusinessTypes()];
  if (!q) return catalog;
  const scored = catalog
    .map((row) => {
      const en = fold(row.label.en);
      const es = fold(row.label.es);
      const id = fold(row.id.replaceAll("-", " "));
      const aliases = row.aliases.map((alias) => fold(alias));
      let score = 0;
      if (en === q || es === q || fold(row.id) === q) score = 400;
      else if (aliases.includes(q)) score = 300;
      else if (en.startsWith(q) || es.startsWith(q) || aliases.some((alias) => alias.startsWith(q))) score = 200;
      else if (
        en.includes(q) ||
        es.includes(q) ||
        id.includes(q) ||
        fold(row.id).includes(q) ||
        aliases.some((alias) => alias.includes(q))
      ) {
        score = 100;
      }
      return { row, score };
    })
    .filter((entry) => entry.score > 0);
  scored.sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));
  return scored.map((entry) => entry.row);
}

export function assertPresetKnown(id: IndustryPresetId): boolean {
  return (INDUSTRY_PRESET_IDS as readonly string[]).includes(id);
}
