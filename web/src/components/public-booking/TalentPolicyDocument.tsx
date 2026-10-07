/**
 * The body of a talent policy page: a title, numbered clauses, the version
 * line. Paints only from the site's theme tokens (system colours as the
 * fallback, never a literal), so it reads right on every design and inside the
 * booking sheet. Pure: no hooks, renders on the server and in the client sheet.
 */

import type { CSSProperties, ReactNode } from "react";

import type { PolicyPageModel } from "@/lib/talent-policies/public";

const URL_RE = /(https?:\/\/[^\s]+)/g;

function linkify(text: string): ReactNode[] {
  return text.split(URL_RE).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>
        {part}
      </a>
    ) : (
      part
    ),
  );
}

/** The platform default is shown as a plain policy: no version line, never an "not published yet" admission. */
export function versionLine(model: PolicyPageModel): string | null {
  const es = model.locale === "es";
  if (model.isDefault) return null;
  const when = model.publishedAt ? new Date(model.publishedAt).toISOString().slice(0, 10) : "";
  return es ? `Versión ${model.version}${when ? `, publicada el ${when}` : ""}` : `Version ${model.version}${when ? `, published ${when}` : ""}`;
}

const INK = "var(--token-color-ink, CanvasText)";
const SOFT = "color-mix(in srgb, var(--token-color-ink, CanvasText) 66%, var(--token-color-background, Canvas))";
const LINE = "var(--token-color-line, color-mix(in srgb, CanvasText 16%, Canvas))";

export function TalentPolicyDocument({ model, headingTag = "h1" }: { model: PolicyPageModel; headingTag?: "h1" | "h2" }) {
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
            <p style={{ margin: 0, color: SOFT, overflowWrap: "anywhere" }}>{linkify(c.body)}</p>
          </li>
        ))}
      </ol>
    </article>
  );
}
