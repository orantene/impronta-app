/**
 * fix-es-page-meta.ts — give the older Spanish pages Spanish metadata.
 *
 * Nine Spanish pages predate the rebuild. Their BODIES are the old design (one
 * block each, versus seven to twelve on the rebuilt pages) and rebuilding them
 * is a separate, larger job — 342 strings of copy.
 *
 * But their METADATA is wrong in a way a visitor sees today: five carry English
 * meta titles and three carry none at all, so a Spanish page shows
 * "About · Impronta" in the browser tab and in Google's result. That is the
 * cheap half of the fix and it does not wait for the expensive half.
 *
 * TITLES AND DESCRIPTIONS ONLY. This script never touches `blocks`, so it
 * cannot damage a page body while improving its head.
 *
 * DRY RUN IS THE DEFAULT.
 *
 *   IMPRONTA_SEED_TENANT_SLUG=impronta npx tsx scripts/impronta-rebuild/fix-es-page-meta.ts
 *   IMPRONTA_SEED_TENANT_SLUG=impronta npx tsx scripts/impronta-rebuild/fix-es-page-meta.ts --apply
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface EsMeta {
  title: string;
  metaTitle: string;
  metaDescription: string;
}

/**
 * Spanish head copy for the pages the rebuild has not reached yet.
 *
 * Written to match the voice of the rebuilt Spanish pages (agency-managed,
 * concrete, no marketing inflation) so the site reads as one thing while the
 * bodies catch up.
 */
export const ES_PAGE_META: Record<string, EsMeta> = {
  about: {
    title: "Acerca de Impronta",
    metaTitle: "Acerca de Impronta | Agencia de modelos y talento en Tulum",
    metaDescription:
      "Impronta es una agencia boutique de modelos y talento en Tulum y Playa del Carmen. Conocemos a cada persona que representamos y respondemos por cada reserva de principio a fin.",
  },
  contact: {
    title: "Contacto",
    metaTitle: "Contacto | Reserva talento en Tulum y la Riviera Maya",
    metaDescription:
      "Cuéntanos tu brief, tus fechas y el tipo de talento que necesitas. Un coordinador responde personalmente, normalmente en menos de 24 horas.",
  },
  "for-clients": {
    title: "Para Clientes",
    metaTitle: "Para clientes | Reserva modelos y talento en la Riviera Maya",
    metaDescription:
      "Cómo trabaja Impronta con marcas, productoras y organizadores de eventos: un brief, un coordinador y una preselección de talento verificado y disponible.",
  },
  faq: {
    title: "Preguntas Frecuentes",
    metaTitle: "Preguntas frecuentes | Reservas y representación | Impronta",
    metaDescription:
      "Respuestas sobre tarifas, disponibilidad, usos de imagen, viáticos y cómo postularse al roster de Impronta en Tulum y la Riviera Maya.",
  },
  "become-a-model": {
    title: "Conviértete en Modelo",
    metaTitle: "Postúlate como modelo o talento | Impronta, Tulum",
    metaDescription:
      "Postúlate para representación con Impronta. Si tu perfil encaja con el roster, nos conocemos en persona, construimos tu perfil profesional y te ponemos frente a briefs reales.",
  },
  studio: {
    title: "Estudio y Servicios",
    metaTitle: "Estudio y servicios de producción | Impronta, Tulum",
    metaDescription:
      "Estudio, locaciones y servicios de producción de Impronta para shoots, castings y contenido de marca en Tulum y Playa del Carmen.",
  },
  terms: {
    title: "Términos de Servicio",
    metaTitle: "Términos de servicio | Impronta",
    metaDescription:
      "Términos que rigen el uso del sitio de Impronta y las reservas de talento gestionadas por la agencia.",
  },
  privacy: {
    title: "Aviso de Privacidad",
    metaTitle: "Aviso de privacidad | Impronta",
    metaDescription:
      "Cómo Impronta recopila, usa y protege los datos personales de clientes y talento, conforme a la legislación mexicana.",
  },
  "404": {
    title: "Página no encontrada",
    metaTitle: "Página no encontrada | Impronta",
    metaDescription:
      "Esta página no existe o cambió de dirección. Explora el directorio de talento o vuelve al inicio.",
  },
};

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  const { loadEnvLocal } = await import("../load-env-local.mjs");
  loadEnvLocal();

  const apply = process.argv.includes("--apply");
  if (!apply) console.log("DRY RUN — no writes will be made.\n");

  const supabase = serviceClient();
  const slug = process.env.IMPRONTA_SEED_TENANT_SLUG ?? "impronta";
  const { data: tenant } = await supabase
    .from("agencies")
    .select("id")
    .eq("slug", slug)
    .maybeSingle<{ id: string }>();
  if (!tenant) throw new Error(`No tenant for slug "${slug}".`);

  for (const [pageSlug, meta] of Object.entries(ES_PAGE_META)) {
    const { data: row } = await supabase
      .from("cms_pages")
      .select("id, meta_title")
      .eq("tenant_id", tenant.id)
      .eq("locale", "es")
      .eq("slug", pageSlug)
      .neq("status", "archived")
      .maybeSingle<{ id: string; meta_title: string | null }>();

    if (!row) {
      console.log(`  ${pageSlug.padEnd(16)} SKIP — no Spanish page at this slug`);
      continue;
    }
    console.log(
      `  ${pageSlug.padEnd(16)} "${(row.meta_title ?? "(none)").slice(0, 28)}" → "${meta.metaTitle.slice(0, 40)}"`,
    );
    if (!apply) continue;

    const { error } = await supabase
      .from("cms_pages")
      .update({
        title: meta.title,
        meta_title: meta.metaTitle,
        meta_description: meta.metaDescription,
        og_title: meta.metaTitle,
        og_description: meta.metaDescription,
        // Self-canonical: without this a Spanish page can canonicalize to its
        // English twin and ask search engines not to rank it.
        canonical_url: pageSlug === "404" ? null : `/es/p/${pageSlug}`,
      })
      .eq("id", row.id);
    if (error) throw new Error(`${pageSlug}: ${error.message}`);
  }

  if (!apply) console.log("\nRe-run with --apply to write.");
  else console.log("\nDone. Page BODIES are untouched — those are the separate rebuild.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
