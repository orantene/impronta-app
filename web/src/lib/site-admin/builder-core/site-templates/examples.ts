/**
 * examples.ts — preview data for the Builder Lab and tests. NEVER written to a
 * tenant. One example context per family (docs/plans/templates/01-plan.md §2)
 * and a fixture image resolver that maps every role onto the marketing photos
 * already shipping in `/public/marketing/photos` (the same set the page-design
 * templates use), so a preview is finished-looking with zero image-gen cost.
 */

import { PAGE_DESIGN_PHOTOS } from "@/lib/site-admin/builder-node/page-designs/photos";
import type { BusinessFamilyId } from "@/lib/words/business-types";

import type { ComponentContext, ImageResolver, ImageRole, SiteIdentity } from "./types";

const FIXTURE_BY_ROLE: Record<ImageRole, string> = {
  hero: PAGE_DESIGN_PHOTOS.studioScene,
  wide: PAGE_DESIGN_PHOTOS.studioDesk,
  portrait: PAGE_DESIGN_PHOTOS.vocalistPortrait,
  gallery: PAGE_DESIGN_PHOTOS.serviceProsScene,
  team: PAGE_DESIGN_PHOTOS.directorPortrait,
  detail: PAGE_DESIGN_PHOTOS.studioDesk,
};

const GALLERY_ROTATION = [
  PAGE_DESIGN_PHOTOS.serviceProsScene,
  PAGE_DESIGN_PHOTOS.vocalistPortrait,
  PAGE_DESIGN_PHOTOS.studioDesk,
  PAGE_DESIGN_PHOTOS.directorPortrait,
];

/** Every slot resolves; alt text names the fixture honestly. Gallery frames
 *  rotate through the set so a preview does not repeat one photo four times. */
export const fixtureImageResolver: ImageResolver = (slot, role) => ({
  src: role === "gallery" ? GALLERY_ROTATION[(Number(slot.split("-")[1] ?? 1) - 1) % GALLERY_ROTATION.length] : FIXTURE_BY_ROLE[role],
  alt: { es: `Imagen de muestra (${slot})`, en: `Sample image (${slot})` },
});

/** A resolver that finds nothing, for the "no imagery" path in tests. */
export const emptyImageResolver: ImageResolver = () => null;

export const EXAMPLE_IDENTITY: SiteIdentity = {
  businessName: "Casa Ejemplo",
  tagline: "Hecho a mano, cerca de ti",
  city: "Playa del Carmen",
  whatsapp: "+52 984 000 0000",
  instagram: "https://instagram.com/casa.ejemplo",
  hours: ["Lun a Vie 9:00 a 18:00", "Sáb 10:00 a 14:00"],
  address: "Calle 38 Norte 120",
};

const EXAMPLE_BY_FAMILY: Record<BusinessFamilyId, Partial<ComponentContext>> = {
  dining: { staffCount: 6 },
  beauty: { services: ["Manicura", "Pedicura", "Uñas acrílicas", "Gelish", "Diseño de uñas", "Spa de manos", "Depilación de cejas", "Pestañas"], staffCount: 4 },
  wellness: { services: ["Masaje relajante", "Masaje descontracturante", "Facial", "Reflexología"], staffCount: 2 },
  fitness: { services: ["Yoga", "Pilates", "Funcional", "Movilidad", "Meditación", "Yoga prenatal"], staffCount: 3 },
  events: { services: ["Boda", "Evento corporativo", "Concierto"] },
  agency: { rosterActive: true, staffCount: 4 },
  professional: { services: ["Consulta inicial", "Asesoría", "Trámite completo"], yearsExperience: 12 },
  education: { services: ["Nivel inicial", "Nivel intermedio", "Nivel avanzado", "Clases privadas"], staffCount: 5 },
  hospitality: { services: ["Escritorio flexible", "Oficina privada", "Sala de juntas"], staffCount: 3 },
  craft: { services: ["Pieza a medida", "Restauración", "Taller abierto"], yearsExperience: 8 },
  tours: { services: ["Tour de medio día", "Tour privado", "Excursión al amanecer"], staffCount: 2 },
  custom: { services: ["Servicio principal", "Servicio a domicilio"] },
};

export function exampleContext(family: BusinessFamilyId, typeId: string, locale: "es" | "en" = "es"): ComponentContext {
  return {
    locale,
    family,
    typeId,
    identity: EXAMPLE_IDENTITY,
    images: fixtureImageResolver,
    example: true,
    ...EXAMPLE_BY_FAMILY[family],
  };
}
