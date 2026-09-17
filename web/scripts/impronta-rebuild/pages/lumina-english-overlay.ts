/**
 * /lumina — English base + Spanish overlay (language audit, 2026-09-17).
 *
 * The LUMINA launch-party page was authored in Spanish in the builder, on
 * the tenant's PRIMARY (English) row, with no translation layer. The English
 * site therefore served Spanish. Under the one-design-per-page model the
 * base text must be English and Spanish must live in `i18n.es`, so this
 * script, keyed by the exact current Spanish strings:
 *   - moves every Spanish string into the node's `i18n.es`,
 *   - writes the English translation as the base text,
 *   - inserts a Spanish `cms_pages` row (same tree, Spanish meta) so
 *     `/es/lumina` keeps a Spanish <title>/description,
 * and commits through the same revision+CAS path the editor uses.
 *
 * Idempotent: a string already carrying the expected overlay is skipped.
 *
 *   npx tsx scripts/impronta-rebuild/pages/lumina-english-overlay.ts [--apply]
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { translatableTextOf } from "@/lib/site-admin/builder-node/translatable-text";
import { localizablePropsForKind } from "@/lib/i18n/builder-i18n-props";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { commitPageRevisionThenVersion } from "@/lib/site-admin/server/page-revision-commit";

/** Spanish (as authored) → English. Strings absent here are left untouched. */
export const LUMINA_EN: Record<string, string> = {
  "Sáb 21 nov · Cancún · Entradas disponibles": "Sat 21 Nov · Cancún · Tickets available",
  "Impronta Models presenta": "Impronta Models presents",
  "Fiesta de lanzamiento": "Launch party",
  "Sábado 21 de noviembre · 18:00 h → 3:00 am · Cancún, Quintana Roo": "Saturday 21 November · 6:00 pm → 3:00 am · Cancún, Quintana Roo",
  "Comprar entradas": "Buy tickets",
  "Ver el programa": "See the programme",
  "Desfile de moda": "Fashion show",
  "Show de fuego": "Fire show",
  "Parrilla gourmet": "Gourmet grill",
  "Telas y aros": "Silks & hoops",
  "Feria artesanal": "Artisan market",
  "Apertura 23:00": "Opening 11 pm",
  "La noche": "The night",
  "El programa": "The programme",
  "Arranca LUMINA": "LUMINA begins",
  "Abren las puertas. Puesto de hidratación y feria artesanal desde el inicio.": "Doors open. Hydration station and artisan market from the start.",
  "Juegos de kermés": "Fair games",
  "Dos horas de juegos, premios y parrilla encendida.": "Two hours of games, prizes and the grill already lit.",
  "Show de magia + malabares": "Magic + juggling show",
  "La pasarela Impronta: nuestro roster en vivo.": "The Impronta runway: our roster, live.",
  "Show premium “Mi corazón se apaga”": "Premium show “Mi corazón se apaga”",
  "Apertura LUMINA": "LUMINA opening",
  "Entrada después de las 23 h: $500 con un trago.": "Entry after 11 pm: $500 with one drink.",
  "Show de fuego 🔥": "Fire show 🔥",
  "Show de telas + aros": "Silks + hoops show",
  "Cierre aéreo.": "An aerial finale.",
  "Lo que te espera": "What awaits you",
  "Nos acompañan": "Joining us",
  "Silueta de una modelo caminando la pasarela bajo luz dorada": "Silhouette of a model walking the runway under golden light",
  "7 DJs estratégicamente seleccionados": "7 hand-picked DJs",
  "Toda la noche, cabina a cabina.": "All night, booth to booth.",
  "Brasas desde las 18 h": "Embers from 6 pm",
  "Pizza gourmet": "Gourmet pizza",
  "Horno a la vista": "Open oven",
  "Puesto de helados": "Ice-cream stand",
  "Toda la noche": "All night",
  "Mini feria artesanal": "Mini artisan market",
  "Diseño local": "Local design",
  "Puesto de hidratación": "Hydration station",
  "Agua libre toda la noche": "Free water all night",
  "Desfile & shows": "Runway & shows",
  "Artista de fuego girando poi encendidos contra el cielo nocturno": "Fire artist spinning lit poi against the night sky",
  "Show de fuego · 1:30 am": "Fire show · 1:30 am",
  "Cuando la pista está llena, el fuego sale al patio.": "When the floor is full, the fire moves to the patio.",
  "Acróbata en telas aéreas doradas suspendida sobre el escenario": "Aerialist on golden silks suspended above the stage",
  "Telas + aros · 3:00 am": "Silks + hoops · 3:00 am",
  "El cierre, en el aire.": "The finale, in the air.",
  "Después de las 23 h": "After 11 pm",
  "Entrada $500 · incluye 1 trago": "Entry $500 · includes 1 drink",
  "Llegas para la apertura LUMINA. Compra ahora y entra directo.": "You arrive for the LUMINA opening. Buy now and walk straight in.",
  "Elegir esta entrada": "Choose this ticket",
  Entradas: "Tickets",
  "Elegí tu entrada": "Choose your ticket",
  "Cortesía: solo por invitación. Si recibiste un enlace, tu entrada aparece aquí automáticamente.": "Complimentary: by invitation only. If you received a link, your ticket appears here automatically.",
  "Mesa VIP bajo luz cálida y dorada": "VIP table under warm golden light",
  "Mesa VIP": "VIP table",
  "Tu mesa, toda la noche": "Your table, all night",
  "◆  Hasta 10 personas por mesa": "◆  Up to 10 people per table",
  "◆  $10,000 MXN en consumo incluidos": "◆  $10,000 MXN in consumption included",
  "◆  Ubicación preferente frente a la pasarela": "◆  Prime position facing the runway",
  "◆  Solo 20 mesas": "◆  Only 20 tables",
  "Reservar mesa · $15,000": "Reserve a table · $15,000",
  Dónde: "Where",
  "El lugar": "The venue",
  Preguntas: "Questions",
  "¿Qué incluye cada entrada?": "What does each ticket include?",
  "General: copa de vino. Después de las 23 h: un trago. Mesa para 10: la mesa toda la noche y $10,000 MXN en consumo.": "General: a glass of wine. After 11 pm: one drink. Table for 10: the table all night and $10,000 MXN in consumption.",
  "Elegante nocturno. Dorado y negro son bienvenidos.": "Evening elegant. Gold and black are welcome.",
  "Edad mínima": "Minimum age",
  "Mayores de 18 años con identificación.": "18 and over, with ID.",
  "Reembolsos y transferencias": "Refunds and transfers",
  "Puedes transferir tu entrada a otra persona desde el enlace de tu ticket. No hay reembolsos después del 19 de noviembre.": "You can transfer your ticket to someone else from your ticket link. No refunds after 19 November.",
  "Puertas 18:00 h · Apertura LUMINA 23:00 h · Cierre 3:00 am. Estacionamiento y zona de taxis en la entrada.": "Doors 6:00 pm · LUMINA opening 11:00 pm · Close 3:00 am. Parking and taxi rank at the entrance.",
  "Calle 12 Norte entre Av. 10 y Av. 15, Centro, Playa del Carmen, Q. Roo": "Calle 12 Norte between Av. 10 and Av. 15, Centro, Playa del Carmen, Q. Roo",
  "Sáb 21 nov · 18:00 → 3:00 am": "Sat 21 Nov · 6:00 pm → 3:00 am",
  "Cómo llegar": "How to get there",
  "Ver en Google Maps": "Open in Google Maps",
  "¿Cómo entro?": "How do I get in?",
  "Recibes un e-mail con tu QR. Lo muestras en la puerta desde el teléfono; no hace falta imprimir.": "You receive an e-mail with your QR. Show it at the door from your phone; no need to print.",
};

const TITLE_EN = "LUMINA Launch Party · 21 November, Playa del Carmen"; // the site appends "· Impronta"
const TITLE_ES = "Fiesta de lanzamiento LUMINA · 21 de noviembre, Playa del Carmen";
const META_EN = "Impronta Models presents LUMINA: fashion show, 7 DJs, fire and aerial shows, gourmet grill and artisan market. Saturday 21 November, Playa del Carmen. Tickets and VIP tables.";
const META_ES = "Impronta Models presenta LUMINA: desfile de moda, 7 DJs, show de fuego y aéreo, parrilla gourmet y feria artesanal. Sábado 21 de noviembre, Playa del Carmen. Entradas y mesas VIP.";

function setNested(obj: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const next = cur[p];
    if (Array.isArray(next)) cur = next as unknown as Record<string, unknown>;
    else if (next && typeof next === "object") cur = next as Record<string, unknown>;
    else return;
  }
  (cur as Record<string, unknown>)[parts[parts.length - 1]!] = value;
}

export function englishBaseWithSpanishOverlay(tree: BuilderNode[]): { tree: BuilderNode[]; moved: number; untranslated: string[] } {
  let moved = 0;
  const untranslated: string[] = [];
  const walk = (nodes: BuilderNode[]): BuilderNode[] =>
    nodes.map((node) => {
      const props = structuredClone(node.props) as Record<string, unknown>;
      const i18n = { ...((props.i18n as Record<string, Record<string, string>> | undefined) ?? {}) };
      const es = { ...(i18n.es ?? {}) };
      let touched = false;
      // Generic text props plus the per-kind localizable props the renderer
      // resolves (location_map overlay copy is not in the generic set).
      const entries = translatableTextOf(node);
      const seen = new Set(entries.map((e) => e.prop));
      for (const prop of localizablePropsForKind(node.kind)) {
        const v = props[prop];
        if (!seen.has(prop) && typeof v === "string" && v.trim()) entries.push({ prop, value: v.trim() });
      }
      for (const t of entries) {
        const en = LUMINA_EN[t.value];
        if (en === undefined) {
          if (/[áéíóúñ¿¡]/i.test(t.value) || /\b(de|la|el|los|las|con|para|por)\b/i.test(t.value)) untranslated.push(`${node.id} ${t.prop}: ${t.value}`);
          continue;
        }
        if (es[t.prop] === t.value) continue; // already overlaid
        es[t.prop] = t.value;
        if (t.prop.includes(".")) setNested(props, t.prop, en);
        else props[t.prop] = en;
        touched = true;
        moved += 1;
      }
      let next: BuilderNode = node;
      if (touched) {
        i18n.es = es;
        props.i18n = i18n;
        next = { ...node, props, i18n } as BuilderNode;
      }
      const children = (next as { children?: BuilderNode[] }).children;
      if (Array.isArray(children)) {
        const nc = walk(children);
        if (nc.some((c, i) => c !== children[i])) next = { ...next, children: nc } as BuilderNode;
      }
      return next;
    });
  return { tree: walk(tree), moved, untranslated };
}

type Row = { id: string; version: number; status: string; blocks: BuilderNode[]; template_schema_version: number | null; title: string; meta_description: string | null; meta_title: string | null; og_title: string | null; og_description: string | null; canonical_url: string | null };

async function main() {
  const { loadEnvLocal } = await import("../../load-env-local.mjs");
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("env missing");
  const sb: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });
  const { data: tenant } = await sb.from("agencies").select("id").eq("slug", process.env.IMPRONTA_SEED_TENANT_SLUG ?? "impronta").maybeSingle();
  if (!tenant) throw new Error("tenant not found");
  const tenantId = tenant.id as string;
  const { data: identity } = await sb.from("agency_business_identity").select("updated_by").eq("tenant_id", tenantId).maybeSingle();
  const actor = (identity?.updated_by as string | null) ?? null;

  const sel = "id, version, status, blocks, template_schema_version, title, meta_description, meta_title, og_title, og_description, canonical_url";
  const { data: en } = await sb.from("cms_pages").select(sel).eq("tenant_id", tenantId).eq("locale", "en").eq("slug", "lumina").maybeSingle<Row>();
  if (!en) throw new Error("no en/lumina row");
  const spanishTree = en.blocks ?? [];
  const r = englishBaseWithSpanishOverlay(spanishTree);
  const v = validateBuilderNodeTree(r.tree);
  if (!v.ok) throw new Error(v.issues.map((i) => i.message).join("; "));
  console.log(`${apply ? "APPLY" : "DRY"} lumina: ${r.moved} strings moved to i18n.es with English base; ${r.untranslated.length} Spanish-looking strings left as-is`);
  for (const u of r.untranslated) console.log("   ?", u.slice(0, 120));
  const { data: es } = await sb.from("cms_pages").select(sel).eq("tenant_id", tenantId).eq("locale", "es").eq("slug", "lumina").maybeSingle<Row>();
  console.log(`  es/lumina row: ${es ? `exists v${es.version}` : "INSERT"}`);
  if (!apply) return;

  if (r.moved > 0 || en.title !== TITLE_EN) {
    const next = en.version + 1;
    const res = await commitPageRevisionThenVersion(sb, {
      tenantId, pageId: en.id, beforeVersion: en.version,
      update: { blocks: v.tree, version: next, updated_by: actor, edit_session_id: null, draft_seq: null, title: TITLE_EN, meta_title: TITLE_EN, meta_description: META_EN, og_title: TITLE_EN, og_description: META_EN },
      revision: { kind: "published", version: next, templateSchemaVersion: en.template_schema_version ?? 1, snapshot: { kind: "published", title: TITLE_EN, status: en.status, locale: "en", meta_description: META_EN, version: next, published_at: new Date().toISOString(), composition: [], builderTree: v.tree } },
      actorProfileId: actor, logScope: "impronta-rebuild/lumina-english-overlay",
    });
    if (!res.ok) throw new Error(`en commit: ${res.reason}`);
    console.log(`  en/lumina → v${next}`);
  }
  if (es && es.title !== TITLE_ES) {
    const { error } = await sb.from("cms_pages").update({ title: TITLE_ES, meta_title: TITLE_ES, meta_description: META_ES, og_title: TITLE_ES, og_description: META_ES, updated_by: actor }).eq("id", es.id);
    if (error) throw new Error(`es meta: ${error.message}`);
    console.log("  es/lumina meta updated");
  }
  if (!es) {
    const { data: ins, error } = await sb.from("cms_pages").insert({
      tenant_id: tenantId, locale: "es", slug: "lumina", template_key: "standard_page", status: en.status, is_freeform: true,
      blocks: spanishTree, version: 1, updated_by: actor, published_at: new Date().toISOString(),
      title: TITLE_ES, meta_title: TITLE_ES, meta_description: META_ES, og_title: TITLE_ES, og_description: META_ES,
      canonical_url: "/es/p/lumina", noindex: false, include_in_sitemap: true,
    }).select("id").single<{ id: string }>();
    if (error || !ins) throw new Error(`es insert: ${error?.message}`);
    await sb.from("cms_page_revisions").insert({ tenant_id: tenantId, page_id: ins.id, kind: "published", version: 1, template_schema_version: 1, snapshot: { kind: "published", title: TITLE_ES, status: en.status, locale: "es", meta_description: META_ES, version: 1, published_at: new Date().toISOString(), composition: [], builderTree: spanishTree }, created_by: actor });
    console.log("  es/lumina inserted (Spanish meta)");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
