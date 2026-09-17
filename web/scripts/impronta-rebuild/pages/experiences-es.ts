/**
 * The experiences page in Spanish — same mechanism as the show page: walk the
 * ENGLISH tree, swap visitor-facing copy through a map, localize hrefs. The
 * test fails on any string that comes out untranslated.
 */

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { experiencesPage } from "./experiences";
import { EXPERIENCES_ES_COPY, EXPERIENCES_ES_KEEP_ENGLISH } from "./experiences-es-copy";
import { buildLocalizedTree, collectVisitorText } from "./localize-page";
import type { ImprontaRebuildPage } from "../shared";

const source = experiencesPage.seo as unknown as Record<string, unknown>;

export const experiencesPageEs: ImprontaRebuildPage = {
  slug: "experiences",
  title: "Experiencias y Sesiones de Fotos | Impronta",
  seo: {
    ...(source as object),
    meta_title: "Modelo por un día, Curso de Posing y Sesiones de Fotos | Impronta, Riviera Maya",
    meta_description:
      "Reserva una sesión de fotos profesional, la experiencia Modelo por un día (27 sep) o el Curso de Posing de octubre en el estudio de Impronta en la Riviera Maya. Precios en MXN, abierto a todos.",
    og_title: "Experiencias y Sesiones de Fotos en el Estudio Impronta, Riviera Maya",
    og_description:
      "Sesiones de fotos desde $1,500 MXN, Modelo por un día el 27 de septiembre y Curso de Posing en octubre. Reserva en el estudio de Impronta.",
    canonical_url: "/es/p/experiences",
  } as ImprontaRebuildPage["seo"],
  tree: buildLocalizedTree(experiencesPage.tree, {
    locale: "es",
    copy: EXPERIENCES_ES_COPY,
    idPrefix: "es-",
  }) as BuilderNode[],
};

export function isAcceptableInSpanishExperiences(value: string): boolean {
  if (EXPERIENCES_ES_KEEP_ENGLISH.has(value)) return true;
  return !/[a-zA-Z]{3,}/.test(value);
}

export { collectVisitorText };
