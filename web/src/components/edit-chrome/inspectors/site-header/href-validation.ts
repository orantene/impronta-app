/**
 * Lightweight href shape check for inspector inputs.
 *
 * Premium UX rule: validation feedback should be inline + non-blocking.
 * The operator types, the input acknowledges shape correctness as they
 * type, and the save still goes through (we don't refuse to persist
 * "bad" hrefs — the storefront will surface broken links separately).
 *
 * Returns one of:
 *   - { kind: "empty" }       — no input yet, treat as neutral
 *   - { kind: "valid", note }  — recognized shape; `note` describes which
 *   - { kind: "warn", message }— shape looks off; show a soft warning
 *
 * Inspector consumes the result to color the input (warn → amber border)
 * and surface a single line of microcopy below the field.
 */

export type HrefValidation =
  | { kind: "empty" }
  | { kind: "valid"; note: string }
  | { kind: "warn"; message: string };

const ABSOLUTE_HTTP = /^https?:\/\//i;
const PROTOCOL_LIKE = /^[a-z][a-z0-9+.-]*:/i;
const INTERNAL_PATH = /^\/[^\s]*$/;
const ANCHOR = /^#[^\s]*$/;
const MAILTO = /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const TEL = /^tel:\+?[0-9\s().-]+$/i;

export function validateHref(raw: string): HrefValidation {
  const v = raw.trim();
  if (!v) return { kind: "empty" };

  if (ABSOLUTE_HTTP.test(v)) {
    // Try the URL constructor — catches typos like "https:/example.com"
    try {
      // eslint-disable-next-line no-new
      new URL(v);
      return { kind: "valid", note: "External link" };
    } catch {
      return {
        kind: "warn",
        message: "Looks like an http link but isn't well-formed.",
      };
    }
  }

  if (MAILTO.test(v)) return { kind: "valid", note: "Email link" };
  if (TEL.test(v)) return { kind: "valid", note: "Phone link" };
  if (ANCHOR.test(v)) return { kind: "valid", note: "Page anchor" };
  if (INTERNAL_PATH.test(v)) return { kind: "valid", note: "Internal path" };

  // Catches things like `mailto:` without an @, or accidental scheme (`htp://`)
  if (PROTOCOL_LIKE.test(v)) {
    return {
      kind: "warn",
      message: "Unrecognized URL scheme — did you mean http://, mailto:, or tel:?",
    };
  }

  // Bare strings ("about", "studio") — operator probably forgot the leading slash
  if (/^[a-z][a-z0-9-]*$/i.test(v)) {
    return {
      kind: "warn",
      message: 'Internal paths start with /. Did you mean "/' + v + '"?',
    };
  }

  return {
    kind: "warn",
    message: "Hmm, that doesn't look like a path or URL.",
  };
}
