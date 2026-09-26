/**
 * Maison Nails & Lashes starter-content catalog (W44–W51) — pure, from seed.
 * Images are preview-only → no images import group (W47).
 */

import { MAISON_SEED, MAISON_STARTER_COUNTS } from "./seed";

export type MaisonStarterService = {
  key: string;
  name: string;
  category: string;
  priceMxn: number;
  durationMin: number;
  imageReuse: "preview_only";
};

export type MaisonStarterFaq = { key: string; question: string };

export type MaisonStarterSectionText = {
  key: string;
  labelEn: string;
  labelEs: string;
};

export type MaisonStarterCatalog = {
  demoSlug: string;
  services: MaisonStarterService[];
  faqs: MaisonStarterFaq[];
  sectionText: MaisonStarterSectionText[];
  imagesLicensedForReuse: boolean;
  counts: { services: number; faq_prompts: number; section_text: number; total: number };
};

function slugKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function loadMaisonStarterCatalog(): MaisonStarterCatalog {
  const sc = MAISON_SEED.demo_nails.starter_content;
  const services: MaisonStarterService[] = sc.services.map((s) => ({
    key: `svc:${slugKey(s.name)}`,
    name: s.name,
    category: s.category,
    priceMxn: s.price_mxn,
    durationMin: s.duration_min,
    imageReuse: "preview_only",
  }));
  const faqs: MaisonStarterFaq[] = sc.faq_prompts.map((q, i) => ({
    key: `faq:${i}:${slugKey(q.slice(0, 40))}`,
    question: q,
  }));
  const sectionText: MaisonStarterSectionText[] = sc.section_text.map((row) => ({
    key: `sec:${row.key}`,
    labelEn: row.en,
    labelEs: row.es,
  }));
  return {
    demoSlug: "maison-nails",
    services,
    faqs,
    sectionText,
    imagesLicensedForReuse: sc.images_licensed_for_reuse === true,
    counts: { ...MAISON_STARTER_COUNTS },
  };
}

/** Normalize for duplicate match (W52): name + category, case/diacritic-insensitive. */
export function normalizeServiceMatchKey(name: string, category: string): string {
  return `${slugKey(name)}|${slugKey(category)}`;
}

export type ExistingServiceMatch = {
  id: string;
  title: string;
  category: string | null;
};

export function findServiceDuplicate(
  starter: MaisonStarterService,
  existing: ExistingServiceMatch[],
): ExistingServiceMatch | null {
  const want = normalizeServiceMatchKey(starter.name, starter.category);
  for (const row of existing) {
    const got = normalizeServiceMatchKey(row.title, row.category ?? "");
    if (got === want) return row;
  }
  return null;
}

export type ImportSelectionState = {
  serviceKeys: string[];
  faqKeys: string[];
  sectionKeys: string[];
};

export type DuplicateResolution = "keep_existing" | "add_as_draft" | "skip";

export function emptyImportSelection(): ImportSelectionState {
  return { serviceKeys: [], faqKeys: [], sectionKeys: [] };
}

export function selectionCounts(sel: ImportSelectionState): {
  services: number;
  faqs: number;
  sections: number;
  total: number;
} {
  const services = sel.serviceKeys.length;
  const faqs = sel.faqKeys.length;
  const sections = sel.sectionKeys.length;
  return { services, faqs, sections, total: services + faqs + sections };
}

/** Sticky summary line (W51). */
export function selectionSummaryLine(
  sel: ImportSelectionState,
  locale: "en" | "es",
): string {
  const c = selectionCounts(sel);
  if (c.total === 0) {
    return locale === "es" ? "Nada seleccionado aún" : "Nothing selected yet";
  }
  const parts: string[] = [];
  if (c.services) {
    parts.push(
      locale === "es"
        ? `${c.services} servicio${c.services === 1 ? "" : "s"}`
        : `${c.services} service${c.services === 1 ? "" : "s"}`,
    );
  }
  if (c.faqs) {
    parts.push(
      locale === "es"
        ? `${c.faqs} pregunta${c.faqs === 1 ? "" : "s"} FAQ`
        : `${c.faqs} FAQ prompt${c.faqs === 1 ? "" : "s"}`,
    );
  }
  if (c.sections) {
    parts.push(
      locale === "es"
        ? `${c.sections} texto${c.sections === 1 ? "" : "s"} de sección`
        : `${c.sections} section text`,
    );
  }
  return locale === "es" ? `${parts.join(" · ")} seleccionados` : `${parts.join(" · ")} selected`;
}

/**
 * Drafts that will actually be created after resolutions (W53–W54).
 * keep_existing / skip do not create a service draft.
 */
export function plannedServiceDraftCount(
  selectedServiceKeys: string[],
  resolutions: Record<string, DuplicateResolution>,
  duplicates: Record<string, ExistingServiceMatch | null>,
): number {
  let n = 0;
  for (const key of selectedServiceKeys) {
    const dup = duplicates[key];
    if (!dup) {
      n += 1;
      continue;
    }
    const res = resolutions[key] ?? "keep_existing";
    if (res === "add_as_draft") n += 1;
  }
  return n;
}
