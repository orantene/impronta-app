/**
 * seed-catalog-2026-09.ts — Impronta's sellable products in the workspace Menu.
 *
 * The owner's 2026-09-17 list, as `talent_offerings` rows with
 * `owner_kind = 'workspace'` (the rows the admin Menu page edits, the inbox
 * quotes against and the POS counter can charge). Prices in MXN, per person
 * where she sells per person. Every row is INQUIRY-FIRST (`booking_mode:
 * request`): the marketing pages send the visitor to a form that names the
 * product, and the team confirms seats, date and payment in the thread.
 *
 * Idempotent: keyed by English title. Re-running updates price/copy on the
 * existing row and never duplicates. Archives the two stale rows the Menu
 * still carried ("test", and the USD-priced September posing course that
 * the October MXN course replaces).
 *
 * USAGE (from web/):  npx tsx scripts/impronta-rebuild/seed-catalog-2026-09.ts [--apply]
 */
import { createClient } from "@supabase/supabase-js";

interface Product {
  key: string;
  kind: "service" | "package";
  category: string;
  title: { en: string; es: string };
  description: { en: string; es: string };
  priceType: "per_person" | "flat_package" | "custom";
  priceDisplay: "exact" | "from" | "quote";
  amountCents: number | null;
  featured: boolean;
  visibility: "public" | "on_request";
  sortOrder: number;
}

export const CATALOG: readonly Product[] = [
  {
    key: "model-for-a-day",
    kind: "package",
    category: "Experiencias",
    title: { en: "Model for a Day · 27 Sep 2026", es: "Modelo por un día · 27 sep 2026" },
    description: {
      en: "One day inside the agency: posing direction from the Impronta team, a styled session with a professional photographer, and edited images to keep. No experience needed. Limited seats; seat confirmed by message once payment is in.",
      es: "Un día dentro de la agencia: dirección de posing del equipo Impronta, una sesión con styling y fotógrafo profesional, y fotos editadas para ti. No necesitas experiencia. Lugares limitados; el lugar se confirma por mensaje al recibir el pago.",
    },
    priceType: "per_person",
    priceDisplay: "exact",
    amountCents: 250000,
    featured: true,
    visibility: "public",
    sortOrder: 10,
  },
  {
    key: "posing-course",
    kind: "package",
    category: "Cursos",
    title: { en: "Posing Course · October 2026", es: "Curso de Posing · octubre 2026" },
    description: {
      en: "The complete course on posing for photo and runway: angles, movement, expression and casting presence, taught by the people who direct it every week. Small group. Dates confirmed on sign-up.",
      es: "El curso completo de posing para foto y pasarela: ángulos, movimiento, expresión y presencia en casting, impartido por quienes lo dirigen cada semana. Grupo pequeño. Fechas confirmadas al inscribirte.",
    },
    priceType: "per_person",
    priceDisplay: "exact",
    amountCents: 700000,
    featured: true,
    visibility: "public",
    sortOrder: 20,
  },
  {
    key: "self-makeup",
    kind: "package",
    category: "Cursos",
    title: { en: "Self-Makeup Workshop (coming soon)", es: "Taller de automaquillaje (próximamente)" },
    description: {
      en: "Camera-ready makeup you can do yourself, taught by the makeup artists who prepare our talent. Date and price to be announced; interested people join the list.",
      es: "Maquillaje listo para cámara que puedes hacer tú misma, impartido por las maquilladoras que preparan a nuestro talento. Fecha y precio por anunciar; los interesados se anotan en la lista.",
    },
    priceType: "custom",
    priceDisplay: "quote",
    amountCents: null,
    featured: false,
    visibility: "on_request",
    sortOrder: 30,
  },
  {
    key: "session-studio",
    kind: "service",
    category: "Sesiones de fotos",
    title: { en: "Photo session · studio + photographer", es: "Sesión de fotos · estudio + fotógrafo" },
    description: {
      en: "Impronta's studio, a professional photographer, direction on set and 10 edited photographs.",
      es: "El estudio de Impronta, un fotógrafo profesional, dirección en set y 10 fotografías editadas.",
    },
    priceType: "flat_package",
    priceDisplay: "exact",
    amountCents: 150000,
    featured: true,
    visibility: "public",
    sortOrder: 40,
  },
  {
    key: "session-makeup",
    kind: "service",
    category: "Sesiones de fotos",
    title: { en: "Photo session + makeup artist", es: "Sesión de fotos + maquilladora" },
    description: {
      en: "Studio, professional photographer and a makeup artist on set. Edited images delivered.",
      es: "Estudio, fotógrafo profesional y maquilladora en set. Fotos editadas entregadas.",
    },
    priceType: "flat_package",
    priceDisplay: "exact",
    amountCents: 250000,
    featured: false,
    visibility: "public",
    sortOrder: 50,
  },
  {
    key: "session-complete",
    kind: "service",
    category: "Sesiones de fotos",
    title: { en: "Complete session · makeup + hair + styling", es: "Sesión completa · maquillaje + peinado/estética" },
    description: {
      en: "Studio, photographer, makeup, hair and styling: the full production. From $3,000 MXN; exact price ($3,000 or $3,500) confirmed with the brief.",
      es: "Estudio, fotógrafo, maquillaje, peinado y estética: la producción completa. Desde $3,000 MXN; precio exacto ($3,000 o $3,500) confirmado con la solicitud.",
    },
    priceType: "flat_package",
    priceDisplay: "from",
    amountCents: 300000,
    featured: false,
    visibility: "public",
    sortOrder: 60,
  },
  {
    key: "session-vintage",
    kind: "service",
    category: "Sesiones de fotos",
    title: { en: "Vintage-era photos", es: "Fotos de época" },
    description: {
      en: "A period-styled themed session: wardrobe, makeup and set designed around an era.",
      es: "Una sesión temática ambientada en otra época: vestuario, maquillaje y set diseñados alrededor de una era.",
    },
    priceType: "flat_package",
    priceDisplay: "exact",
    amountCents: 300000,
    featured: false,
    visibility: "public",
    sortOrder: 70,
  },
  {
    key: "show",
    kind: "package",
    category: "Show",
    title: { en: "Show Impronta · hotels, resorts & venues", es: "Show Impronta · hoteles, resorts y venues" },
    description: {
      en: "A complete live production for hotels, resorts, beach clubs, casinos and restaurants: original scenography, wardrobe, dancers, acrobats and choreography, delivered as one booking. Quoted per venue and format (resident, special night, activation).",
      es: "Una producción en vivo completa para hoteles, resorts, beach clubs, casinos y restaurantes: escenografía original, vestuario, bailarines, acróbatas y coreografías, entregada como una sola reserva. Se cotiza por venue y formato (residente, noche especial, activación).",
    },
    priceType: "custom",
    priceDisplay: "quote",
    amountCents: null,
    featured: true,
    visibility: "public",
    sortOrder: 80,
  },
];

/** Stale rows to archive, by exact current title. */
const ARCHIVE_TITLES = ["test", "Posing course — September (12 spots)"];

async function main() {
  const { loadEnvLocal } = await import("../load-env-local.mjs");
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("env missing");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const slug = process.env.IMPRONTA_SEED_TENANT_SLUG ?? "impronta";
  const { data: tenant } = await sb.from("agencies").select("id").eq("slug", slug).maybeSingle();
  if (!tenant) throw new Error("tenant not found");
  const tenantId = tenant.id as string;

  const { data: existing, error } = await sb
    .from("talent_offerings")
    .select("id, title, status")
    .eq("tenant_id", tenantId)
    .eq("owner_kind", "workspace");
  if (error) throw error;
  const byTitle = new Map((existing ?? []).map((r) => [r.title as string, r]));

  console.log(`${apply ? "APPLY" : "DRY RUN"} · ${slug}`);
  for (const p of CATALOG) {
    const row = {
      tenant_id: tenantId,
      talent_profile_id: null,
      owner_kind: "workspace",
      kind: p.kind,
      title: p.title.en,
      title_i18n: p.title,
      description: p.description.en,
      description_i18n: p.description,
      category: p.category,
      price_type: p.priceType,
      price_display: p.priceDisplay,
      amount_cents: p.amountCents,
      currency: "MXN",
      booking_mode: "request",
      allow_pay_in_person: true,
      reserve_mode: "full",
      status: "published",
      visibility: p.visibility,
      moderation_state: "approved",
      is_featured: p.featured,
      sort_order: p.sortOrder,
      require_account_to_book: false,
    };
    const hit = byTitle.get(p.title.en);
    console.log(`  ${hit ? "update" : "insert"}  ${p.title.en}  ${p.amountCents != null ? `$${(p.amountCents / 100).toLocaleString("en-US")} MXN` : "quote"} · ${p.priceType}`);
    if (!apply) continue;
    if (hit) {
      const { error: e } = await sb.from("talent_offerings").update(row).eq("id", hit.id);
      if (e) throw e;
    } else {
      const { error: e } = await sb.from("talent_offerings").insert(row);
      if (e) throw e;
    }
  }
  for (const t of ARCHIVE_TITLES) {
    const hit = byTitle.get(t);
    if (!hit || hit.status === "archived") continue;
    console.log(`  archive ${t}`);
    if (!apply) continue;
    const { error: e } = await sb.from("talent_offerings").update({ status: "archived" }).eq("id", hit.id);
    if (e) throw e;
  }
  console.log(apply ? "DONE" : "DRY RUN complete — nothing written.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
