/**
 * Public policy pages: what `/politicas` and `/privacidad` show, and the
 * version id a booking stamps. Pure model plus two small reads that take the
 * client they are handed (service role), so the node:test suite can drive them
 * with the in-memory fake.
 *
 * Text comes from the latest PUBLISHED version (the rendered snapshot, never
 * re-rendered from live facts: decision 6.6-3). With no version published the
 * page shows a neutral platform default instead of a 404. No em dashes.
 */

import { logServerError } from "@/lib/server/safe-error";

import { CUSTOM_CLAUSES_HEADING, customClausesFor } from "./custom-clauses";
import { loadPublishedPolicy, type PublishedPolicy } from "./store";
import { TULALA_DOC_LINKS, type PolicyClause, type PolicyLocale } from "./render";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

export type PolicyDoc = "booking" | "privacy";

/** Route segment to the document it serves. */
export function policyDocForSlug(slug: string | null | undefined): PolicyDoc | null {
  if (slug === "politicas") return "booking";
  if (slug === "privacidad") return "privacy";
  return null;
}

export const POLICY_SLUG: Record<PolicyDoc, string> = { booking: "politicas", privacy: "privacidad" };

/** The dead default on talent hosts: `/privacy` now lands on `/privacidad`. */
export const LEGACY_PRIVACY_SLUG = "privacy";

export function asPolicyLocale(locale: string | null | undefined): PolicyLocale {
  return typeof locale === "string" && locale.toLowerCase().startsWith("en") ? "en" : "es";
}

/**
 * Language of a policy page on the platform path (`/t/[code]/...`): the
 * talent's PRIMARY, unless the URL asks for another (`/en` prefix or
 * `?locale=`), bounded by the languages she offers. The visitor's browser
 * cookie never decides: a policy reads in the language she wrote it in.
 */
export function choosePolicyLocale(input: {
  prefixLocale: string | null | undefined;
  queryLocale: string | null | undefined;
  primary: string;
  supported: readonly string[];
}): string {
  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  for (const c of [norm(input.prefixLocale), norm(input.queryLocale)]) {
    if (c && input.supported.includes(c)) return c;
  }
  return input.primary;
}

export type PolicyPageModel = {
  doc: PolicyDoc;
  locale: PolicyLocale;
  title: string;
  clauses: PolicyClause[];
  /** Published version number, or null when the neutral default is shown. */
  version: number | null;
  publishedAt: string | null;
  isDefault: boolean;
  /** The talent's own rules, rendered after the generated clauses. Absent when she wrote none. */
  custom?: { heading: string; items: string[] };
};

const TITLES: Record<PolicyDoc, Record<PolicyLocale, string>> = {
  booking: { es: "Políticas de reserva", en: "Booking policies" },
  privacy: { es: "Privacidad", en: "Privacy" },
};

type Clause = Omit<PolicyClause, "n">;

function numbered(list: Clause[]): PolicyClause[] {
  return list.map((c, i) => ({ n: i + 1, ...c }));
}

/** Neutral platform text: promises nothing a talent has not published. */
export function defaultClauses(doc: PolicyDoc, locale: PolicyLocale): PolicyClause[] {
  const es = locale === "es";
  if (doc === "booking") {
    return numbered([
      {
        title: es ? "Reservas" : "Bookings",
        body: es
          ? "Las condiciones de cada servicio, como el depósito y los cambios o cancelaciones, se muestran antes de que confirmes tu reserva."
          : "The terms of each service, such as the deposit and changes or cancellations, are shown before you confirm your booking.",
      },
      {
        title: es ? "Pagos" : "Payments",
        body: es
          ? "Los pagos en línea se procesan a través de Tulala. Si el servicio permite pagar en persona, lo verás al reservar."
          : "Online payments are processed through Tulala. If the service allows paying in person, you will see it when you book.",
      },
      {
        title: es ? "Contacto" : "Contact",
        body: es
          ? "Usa el formulario o el chat de este sitio para escribir antes de reservar."
          : "Use the form or the chat on this site to write before you book.",
      },
    ]);
  }
  return numbered([
    {
      title: es ? "Qué datos se recogen" : "What is collected",
      body: es
        ? "Tu nombre, tus datos de contacto y los detalles de tu solicitud, solo para atender tu reserva o tu consulta."
        : "Your name, your contact details and the details of your request, only to handle your booking or enquiry.",
    },
    {
      title: es ? "Quién los maneja" : "Who handles them",
      body: es
        ? `Los datos personales y los pagos se manejan a través de Tulala. Términos: ${TULALA_DOC_LINKS.terms} Privacidad: ${TULALA_DOC_LINKS.privacy}`
        : `Personal data and payments are handled through Tulala. Terms: ${TULALA_DOC_LINKS.terms} Privacy: ${TULALA_DOC_LINKS.privacy}`,
    },
    {
      title: es ? "Tus derechos" : "Your rights",
      body: es
        ? "Puedes pedir acceso a tus datos o que se eliminen escribiendo desde este sitio."
        : "You can ask for access to your data, or for it to be deleted, by writing from this site.",
    },
  ]);
}

/** Parse the stored snapshot back into clauses ("1. Title\nBody" blocks). */
export function parsePublishedClauses(text: string): PolicyClause[] {
  const out: PolicyClause[] = [];
  for (const block of text.split("\n\n")) {
    const nl = block.indexOf("\n");
    if (nl < 0) continue;
    const title = block.slice(0, nl).replace(/^\d+\.\s*/, "").trim();
    const body = block.slice(nl + 1).trim();
    if (title && body) out.push({ n: out.length + 1, title, body });
  }
  return out;
}

const PRIVACY_TITLES = new Set(["Contacto", "Contact", "Pagos y datos personales", "Payments and personal data"]);

export function buildPolicyPage(input: {
  doc: PolicyDoc;
  locale: string | null | undefined;
  published: PublishedPolicy | null;
}): PolicyPageModel {
  const locale = asPolicyLocale(input.locale);
  const title = TITLES[input.doc][locale];
  const text = input.published ? (locale === "es" ? input.published.textEs : input.published.textEn) : "";
  let clauses = text ? parsePublishedClauses(text) : [];
  if (input.doc === "privacy") {
    clauses = clauses.filter((c) => PRIVACY_TITLES.has(c.title)).map((c, i) => ({ ...c, n: i + 1 }));
  }
  const items = input.doc === "booking" && input.published ? customClausesFor(input.published.customClauses, locale) : [];
  const custom = items.length > 0 ? { custom: { heading: CUSTOM_CLAUSES_HEADING[locale], items } } : {};
  // Her own rules alone are a real policy: no platform placeholder next to them.
  if (!input.published || (clauses.length === 0 && items.length === 0)) {
    return { doc: input.doc, locale, title, clauses: defaultClauses(input.doc, locale), version: null, publishedAt: null, isDefault: true };
  }
  return { doc: input.doc, locale, title, clauses, version: input.published.version, publishedAt: input.published.publishedAt, isDefault: false, ...custom };
}

export async function loadPolicyPage(
  admin: Admin,
  input: { talentProfileId: string; doc: PolicyDoc; locale: string | null | undefined },
): Promise<PolicyPageModel> {
  const published = await loadPublishedPolicy(admin, input.talentProfileId);
  return buildPolicyPage({ doc: input.doc, locale: input.locale, published });
}

/**
 * The id a booking stamps: the latest published version for the talent, or
 * null (none published, or the read failed). Never throws; a booking is never
 * blocked by the snapshot.
 */
export async function loadLatestPolicyVersionId(admin: Admin, talentProfileId: string | null | undefined): Promise<string | null> {
  if (!talentProfileId) return null;
  try {
    const { data, error } = await admin
      .from("talent_policy_versions")
      .select("id")
      .eq("talent_profile_id", talentProfileId)
      .order("version", { ascending: false })
      .limit(1);
    if (error) {
      logServerError("talentPolicies.latestVersionId", error);
      return null;
    }
    const id = ((data ?? []) as Array<{ id?: unknown }>)[0]?.id;
    return typeof id === "string" ? id : null;
  } catch (e) {
    logServerError("talentPolicies.latestVersionId", e);
    return null;
  }
}
