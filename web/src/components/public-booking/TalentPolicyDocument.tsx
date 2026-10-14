/**
 * The body of a talent policy page: a title, numbered clauses, the version
 * line. Paints only from the site's theme tokens (system colours as the
 * fallback, never a literal), so it reads right on every design and inside the
 * booking sheet. Pure: no hooks, renders on the server and in the client sheet.
 */

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import type { PolicyPageModel } from "@/lib/talent-policies/public";
import { localizedLegalUrl, TULALA_LEGAL_PRIVACY_URL, TULALA_LEGAL_TERMS_URL } from "@/lib/talent-site/footer-socket";

// "Términos: https://…" links the word; a bare URL shows without its scheme.
const URL_RE = /(?:(\p{L}+): )?(https?:\/\/[^\s]+)/gu;

const LINK_STYLE: CSSProperties = { color: "inherit", textDecoration: "underline" };

/** The stored clause text keeps the bare URLs (it is hashed per version); the page names them. */
const TULALA_DOC_NAMES: Readonly<Record<string, { es: string; en: string }>> = {
  [TULALA_LEGAL_TERMS_URL]: { es: "Términos de Tulala", en: "Tulala Terms" },
  [TULALA_LEGAL_PRIVACY_URL]: { es: "Privacidad de Tulala", en: "Tulala Privacy" },
};
const DOC_LEAD_RE = /(?:Términos|Terms|Privacidad|Privacy):\s*$/;

function linkify(text: string, locale: string): ReactNode[] {
  const es = locale.toLowerCase().startsWith("es");
  const parts = text.split(URL_RE);
  return parts.map((part, i) => {
    const doc = TULALA_DOC_NAMES[part];
    if (doc || /^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={doc ? localizedLegalUrl(part, locale) : part}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          {doc ? (es ? doc.es : doc.en) : part}
        </a>
      );
    }
    if (!TULALA_DOC_NAMES[parts[i + 1] ?? ""]) return part;
    const lead = part.replace(DOC_LEAD_RE, "");
    return TULALA_DOC_NAMES[parts[i - 1] ?? ""] && lead.trim() === "" ? " · " : lead;
  });
}

/** The platform default is shown as a plain policy: no version line, never an "not published yet" admission. */
export function versionLine(model: PolicyPageModel): string | null {
  const es = model.locale === "es";
  if (model.isDefault) return null;
  const when = model.publishedAt ? new Date(model.publishedAt).toISOString().slice(0, 10) : "";
  return es ? `Versión ${model.version}${when ? `, publicada el ${when}` : ""}` : `Version ${model.version}${when ? `, published ${when}` : ""}`;
}

/** Locale-aware "back to site" label for the policy page escape hatch (TUL-516 H1). */
export function policyHomeLabel(locale: string): string {
  return (locale ?? "").toLowerCase().startsWith("es") ? "Volver al sitio" : "Back to site";
}

const INK = "var(--token-color-ink, CanvasText)";
const SOFT = "color-mix(in srgb, var(--token-color-ink, CanvasText) 66%, var(--token-color-background, Canvas))";
const LINE = "var(--token-color-line, color-mix(in srgb, CanvasText 16%, Canvas))";

export function TalentPolicyDocument({
  model,
  headingTag = "h1",
  homeHref,
}: {
  model: PolicyPageModel;
  headingTag?: "h1" | "h2";
  /** When set (full policy pages), a home link sits above the title so the visitor is never stuck. */
  homeHref?: string;
}) {
  const Heading = headingTag;
  const line = versionLine(model);
  const wrap: CSSProperties = {
    color: INK,
    fontFamily: "var(--site-body-font, inherit)",
    lineHeight: 1.6,
    fontSize: 16,
  };
  return (
    <article data-talent-policy-doc={model.doc} data-policy-default={model.isDefault ? "true" : "false"} lang={model.locale} style={wrap}>
      {homeHref ? (
        <p data-policy-home="" style={{ margin: "0 0 18px", fontSize: 14 }}>
          <Link href={homeHref} style={{ color: INK, textUnderlineOffset: 3 }}>
            {policyHomeLabel(model.locale)}
          </Link>
        </p>
      ) : null}
      <Heading style={{ fontFamily: "var(--site-heading-font, inherit)", fontSize: 28, lineHeight: 1.2, margin: "0 0 6px" }}>{model.title}</Heading>
      {line ? (
        <p data-policy-version={model.version ?? "default"} style={{ margin: "0 0 24px", fontSize: 13, color: SOFT }}>
          {line}
        </p>
      ) : (
        <div aria-hidden style={{ height: 12 }} />
      )}
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 18 }}>
        {model.clauses.map((c) => (
          <li key={c.n} style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>
              {c.n}. {c.title}
            </h2>
            <p style={{ margin: 0, color: SOFT, overflowWrap: "anywhere" }}>{linkify(c.body, model.locale)}</p>
          </li>
        ))}
      </ol>
      {model.custom ? (
        <section data-policy-custom="" style={{ marginTop: model.clauses.length > 0 ? 28 : 0 }}>
          <h2 style={{ fontFamily: "var(--site-heading-font, inherit)", fontSize: 20, lineHeight: 1.3, margin: "0 0 10px" }}>{model.custom.heading}</h2>
          <ol style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 8 }}>
            {model.custom.items.map((line, i) => (
              <li key={i} style={{ overflowWrap: "anywhere" }}>
                {linkify(line, model.locale)}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </article>
  );
}
