# PR-BILINGUAL — Spanish metadata + ES sitemap alternates for marketing pages

Status: SPEC (copy + code snippet ready; owners wire locale-aware metadata)
Scope: the 11 marketing pages served on the apex marketing host, plus the marketing branch of `web/src/app/sitemap.ts`.
Depends on: A3 (hreflang/alternates) and A4 (positioning tagline swap) from the audit plan. Coordinate with A4 for the homepage title (see note under `/`).

Audit context: `web/docs/tulala-seo-organic-marketing-audit-2026-07-22.md` — finding #7 "[MEDIUM — CODE] Metadata is English-only (static exports) even though page bodies are fully bilingual; sitemap omits /es alternates for marketing." This PR supplies the ES strings and the sitemap change.

---

## 1. ES titles + meta descriptions

Ground rules applied to every string below:

- Natural Spanish, mirrors the EN meaning; no literal word-for-word calques.
- NO em dashes anywhere (audit rule; the ES homepage title uses a colon instead of the EN em dash).
- Titles below are the `%s` slot only. The root layout template (`web/src/app/layout.tsx`, `title.template: "%s · Tulala"`) appends the brand suffix, so do NOT bake "· Tulala" into sub-page titles. Only `/` uses the full default title (no template).
- Descriptions stay under ~160 characters where the EN already is; none invent features, prices, reviews, or locations. Every claim below exists in the EN source string it mirrors.

### `/` (marketing homepage)

EN today (root layout default): `Tulala — The Talent Business Platform`
EN target after A4 lands (brand tagline swap): `Tulala — The Commerce Platform for Talent`

| Locale | Title |
|---|---|
| ES (current tagline) | `Tulala: la plataforma de negocio para el talento` |
| ES (post-A4 tagline, use this if A4 is merged first) | `Tulala: la plataforma de comercio para el talento` |

EN description (from `PLATFORM_BRAND.description` in `web/src/lib/brand/tulala.ts`): "Tulala is the operating system for talent businesses — a branded storefront, a structured booking pipeline, and the shared discovery network that sends new work your way."

ES description:

> Tulala es donde operan los negocios de talento: una tienda en línea con tu marca, un pipeline de reservas estructurado y una red compartida de descubrimiento que te trae trabajo nuevo.

Note: the EN description contains an em dash and the "operating system" phrasing the audit flags; rewriting the EN string is owned by the positioning PR (A4/A5), not this one. The ES version above already complies with the no-em-dash rule and does not use the "operating system" metaphor, so it will not need a second pass.

### `/get-started` — `web/src/app/(marketing)/get-started/page.tsx`

EN: `Start your business, free` / "Build your own website in one click, get your link, and start taking bookings and payments. For agencies, networks, bands, studios, teams, or just you."

- ES title: `Empieza tu negocio gratis`
- ES description: `Crea tu propio sitio web en un clic, obtén tu enlace y empieza a recibir reservas y pagos. Para agencias, redes, bandas, estudios, equipos o solo para ti.`

### `/operators` — `web/src/app/(marketing)/operators/page.tsx`

EN: `For independent operators` / "You ARE the business. Tulala gives independent coordinators and operators the structure of a real agency, without the overhead of building one."

- ES title: `Para operadores independientes`
- ES description: `El negocio eres tú. Tulala da a coordinadores y operadores independientes la estructura de una agencia real, sin el costo de montar una.`

### `/agencies` — `web/src/app/(marketing)/agencies/page.tsx`

EN: `For agencies & representation` / "Run a branded roster site on your own domain, manage people in a modern CMS, and convert inquiries through a real pipeline, not a spreadsheet."

- ES title: `Para agencias y representación`
- ES description: `Opera un sitio de roster con tu marca en tu propio dominio, gestiona a tu gente en un CMS moderno y convierte consultas con un pipeline real, no con una hoja de cálculo.`

### `/organizations` — `web/src/app/(marketing)/organizations/page.tsx`

EN: `For staffing, casting & placement` / "A taxonomy-driven people directory that actually works, for staffing, casting, placement, and large representation operations."

- ES title: `Para staffing, casting y colocación`
- ES description: `Un directorio de personas basado en taxonomía que de verdad funciona, para operaciones de staffing, casting, colocación y representación a gran escala.`

### `/how-it-works` — `web/src/app/(marketing)/how-it-works/page.tsx`

EN: `How it works` / "Three surfaces, one platform: a branded roster site, structured people profiles, and a real inquiry → offer → booking pipeline. Here's the full walkthrough."

- ES title: `Cómo funciona`
- ES description: `Tres superficies, una plataforma: un sitio de roster con tu marca, perfiles estructurados de personas y un pipeline real de consulta → oferta → reserva. Aquí está el recorrido completo.`

(The `→` arrows are kept: they are product-pipeline notation, not em dashes, and the EN uses them.)

### `/network` — `web/src/app/(marketing)/network/page.tsx`

EN: `The shared network` / "Every roster site plugs into a shared discovery hub, so clients can browse across the whole network, not just your inbox."

- ES title: `La red compartida`
- ES description: `Cada sitio de roster se conecta a un hub compartido de descubrimiento, para que los clientes exploren toda la red, no solo tu bandeja de entrada.`

### `/pricing` — `web/src/app/(marketing)/pricing/page.tsx`

EN: `Pricing` / "Start free, forever. Upgrade on your schedule. Transparent plans for operators, agencies, and large placement networks."

- ES title: `Precios`
- ES description: `Empieza gratis, para siempre. Mejora tu plan a tu ritmo. Planes transparentes para operadores, agencias y grandes redes de colocación.`

### `/faq` — `web/src/app/(marketing)/faq/page.tsx`

EN: `Frequently asked` / "The honest answers to the questions every operator, agency, and staffing team asks before signing up."

- ES title: `Preguntas frecuentes`
- ES description: `Respuestas honestas a las preguntas que todo operador, agencia y equipo de staffing hace antes de registrarse.`

### `/legal/privacy` — `web/src/app/(marketing)/legal/privacy/page.tsx`

EN: `Privacy` / "How Tulala collects, stores, and protects data, in plain language."

- ES title: `Privacidad`
- ES description: `Cómo Tulala recopila, guarda y protege los datos, explicado en lenguaje claro.`

### `/legal/terms` — `web/src/app/(marketing)/legal/terms/page.tsx`

EN: `Terms` / "The terms that govern use of Tulala, explained like humans wrote them."

- ES title: `Términos`
- ES description: `Los términos que rigen el uso de Tulala, explicados como los escribiría una persona.`

---

## 2. Implementation pattern for locale-aware metadata (owner guidance)

Today every marketing page uses a static `export const metadata: Metadata`. To serve the ES strings, convert each page to `generateMetadata` reading the request locale, the same way `web/src/app/page.tsx` already does:

```ts
import type { Metadata } from "next";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, {
      en: "Pricing",
      es: "Precios",
    }),
    description: pickLocale(locale, {
      en: "Start free, forever. Upgrade on your schedule. Transparent plans for operators, agencies, and large placement networks.",
      es: "Empieza gratis, para siempre. Mejora tu plan a tu ritmo. Planes transparentes para operadores, agencias y grandes redes de colocación.",
    }),
  };
}
```

Two pages interpolate `PLATFORM_BRAND.name` / `PLATFORM_BRAND.domain` into their strings (`/operators`, `/legal/*`); keep the interpolation in both locales so a future brand rename stays single-sourced.

If A3 (hreflang) has landed, merge its `alternates` output into the same `generateMetadata` return so each page emits localized title/description AND the `en`/`es`/`x-default` alternates from one place.

---

## 3. Sitemap: add ES alternates to the marketing branch

File: `web/src/app/sitemap.ts`. The marketing branch (lines ~91-110) currently emits English-only URLs:

```ts
const marketingEntries: MetadataRoute.Sitemap = marketingPaths.map((path) => ({
  url: new URL(path, base).toString(),
  lastModified: new Date(),
}));
```

The agency branch in the same file already does this correctly for its fixed static paths (lines ~124-132) using `withLocalePath` from `@/i18n/pathnames`, which is already imported at the top of the file. Mirror that pattern — replace the `.map` above with:

```ts
const marketingEntries: MetadataRoute.Sitemap = marketingPaths.flatMap(
  (path) => [
    { url: new URL(path, base).toString(), lastModified: new Date() },
    {
      url: new URL(withLocalePath(path, "es"), base).toString(),
      lastModified: new Date(),
    },
  ],
);
```

Behavior notes:

- `withLocalePath("/", "es")` returns `/es` (the helper collapses the trailing slash), so the homepage pair is `https://<apex>/` + `https://<apex>/es`. Sub-pages become e.g. `/es/pricing`, `/es/legal/privacy`.
- `withLocalePath` returns the unprefixed path for the default locale (`en`), which is why only the `"es"` call is needed; do not emit an `/en/...` entry.
- No new imports are required; `withLocalePath` is imported on line 6.
- The entry count for the marketing host doubles from 11 to 22 (plus platform-talent entries). Well within sitemap limits.
- Prerequisite for these URLs to be non-dead: the `/es/...` marketing routes must actually resolve (A3 scope). If ES marketing paths are served by rewrite/cookie rather than real `/es` URLs at merge time, land A3 first or in the same PR; never ship sitemap entries that 404.

---

## 4. QA checklist

1. `curl -s https://<apex>/sitemap.xml | grep "/es"` lists all 11 ES marketing URLs.
2. View source of `/es/pricing` (or the ES render of `/pricing`): `<title>Precios · Tulala</title>` and the ES description above.
3. View source of EN `/pricing`: unchanged EN title/description (no regression).
4. Homepage `/es` (or ES render of `/`): full ES title without the `%s · Tulala` template double-branding.
5. Grep the diff for the em dash character in any user-facing string: zero matches.
6. `cd web && npx tsc --noEmit && npm run lint` (NODE_OPTIONS=--max-old-space-size=8192 for tsc).
