/**
 * Unified layer search — sections, builder children, and freeform tree rows.
 * Matches visible labels, kind keys, and EN/ES section-type aliases (TUL-80).
 */

import { foldSearchText } from "@/lib/site-admin/add-gallery/section-search";
import {
  BUILDER_NODE_REGISTRY,
  type BuilderNodeKind,
} from "@/lib/site-admin/builder-node";

export interface FreeformLayerSearchRow {
  id: string;
  label: string;
  kind: BuilderNodeKind;
  role?: string | null;
  sectionTypeKey?: string | null;
}

/**
 * Extra EN/ES synonyms for section / embed type keys so Structure search finds
 * "servicios" / "galeria" even when the row still shows an English type key or
 * a generic layout label (Stack).
 */
const LAYER_TYPE_ALIASES: Readonly<Record<string, ReadonlyArray<string>>> = {
  services: ["services", "servicios", "offerings", "ofertas"],
  services_list: ["services", "servicios", "list", "lista"],
  services_catalog: [
    "services",
    "servicios",
    "catalog",
    "catalogo",
    "catálogo",
    "catalogue",
  ],
  gallery: ["gallery", "galeria", "galería", "photos", "fotos", "portfolio"],
  gallery_strip: [
    "gallery",
    "galeria",
    "galería",
    "strip",
    "photos",
    "fotos",
    "mosaic",
  ],
  masonry: ["gallery", "galeria", "galería", "masonry", "mosaic", "fotos"],
  lookbook: ["gallery", "galeria", "galería", "lookbook", "fotos"],
  faq_accordion: [
    "faq",
    "faqs",
    "questions",
    "preguntas",
    "pregunta",
    "acordeon",
    "acordeón",
    "preguntas frecuentes",
  ],
  testimonials_trio: [
    "testimonials",
    "testimonial",
    "testimonios",
    "testimonio",
    "reseñas",
    "reseña",
    "reviews",
  ],
  hero: ["hero", "portada", "banner", "cover"],
  hero_split: ["hero", "portada", "banner", "split"],
  about: ["about", "acerca", "sobre", "nosotros"],
  contact_form: ["contact", "contacto", "form", "formulario"],
  cta_banner: ["cta", "banner", "call to action"],
  booking_widget: ["booking", "reservas", "agendar", "book"],
  featured_talent: ["featured", "talent", "talentos", "destacados"],
  directory: ["directory", "directorio", "roster"],
};

function aliasesForTypeKey(typeKey: string | null | undefined): string[] {
  if (!typeKey) return [];
  const normalized = typeKey.trim().toLowerCase();
  if (!normalized) return [];
  const direct = LAYER_TYPE_ALIASES[normalized];
  if (direct) return [...direct];
  // Template ids use hyphens; section keys use underscores.
  const underscored = normalized.replace(/-/g, "_");
  if (underscored !== normalized && LAYER_TYPE_ALIASES[underscored]) {
    return [...LAYER_TYPE_ALIASES[underscored]];
  }
  return [];
}

/** Build a folded haystack for a layer / section search row. */
export function layerSearchHaystack(parts: {
  label?: string | null;
  kind?: string | null;
  kindLabel?: string | null;
  role?: string | null;
  sectionTypeKey?: string | null;
  extra?: ReadonlyArray<string | null | undefined>;
}): string {
  const typeKey = parts.sectionTypeKey ?? "";
  return foldSearchText(
    [
      parts.label,
      parts.kind,
      parts.kindLabel,
      parts.role,
      typeKey,
      typeKey.replace(/_/g, " "),
      typeKey.replace(/-/g, " "),
      ...aliasesForTypeKey(typeKey),
      ...(parts.extra ?? []),
    ]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .join(" "),
  );
}

export function builderNodeRowMatchesSearch(
  row: FreeformLayerSearchRow,
  query: string,
): boolean {
  const q = foldSearchText(query);
  if (!q) return true;
  const kindLabel = BUILDER_NODE_REGISTRY[row.kind].label;
  const haystack = layerSearchHaystack({
    label: row.label,
    kind: row.kind,
    kindLabel,
    role: row.role,
    sectionTypeKey: row.sectionTypeKey,
  });
  return haystack.includes(q);
}

/** Section navigator rows (legacy FlatRow path) — same alias + fold rules. */
export function sectionLayerMatchesSearch(parts: {
  cleanedName: string;
  displayName: string;
  sectionTypeKey: string;
  query: string;
}): boolean {
  const q = foldSearchText(parts.query);
  if (!q) return true;
  return layerSearchHaystack({
    label: parts.cleanedName,
    sectionTypeKey: parts.sectionTypeKey,
    extra: [parts.displayName],
  }).includes(q);
}

/** Filter rows + keep ancestors of matches visible. */
export function filterFreeformRowsWithAncestors<
  T extends {
    id: string;
    depth: number;
    label: string;
    kind: BuilderNodeKind;
    role?: string | null;
    sectionTypeKey?: string | null;
  },
>(
  rows: readonly T[],
  query: string,
  sectionTypeKeyForRow?: (row: T) => string | null,
): T[] {
  const q = foldSearchText(query);
  if (!q) return [...rows];

  const matchIds = new Set<string>();
  for (const row of rows) {
    if (
      builderNodeRowMatchesSearch(
        {
          id: row.id,
          label: row.label,
          kind: row.kind,
          role: row.role,
          sectionTypeKey:
            row.sectionTypeKey ?? sectionTypeKeyForRow?.(row) ?? null,
        },
        q,
      )
    ) {
      matchIds.add(row.id);
    }
  }

  if (matchIds.size === 0) return [];

  const ancestorIds = new Set<string>();
  for (const row of rows) {
    if (!matchIds.has(row.id)) continue;
    let wantDepth = row.depth - 1;
    const idx = rows.indexOf(row);
    for (let i = idx - 1; i >= 0 && wantDepth >= 0; i -= 1) {
      if (rows[i].depth === wantDepth) {
        ancestorIds.add(rows[i].id);
        wantDepth -= 1;
      }
    }
  }

  const visible = new Set([...matchIds, ...ancestorIds]);
  return rows.filter((r) => visible.has(r.id));
}
