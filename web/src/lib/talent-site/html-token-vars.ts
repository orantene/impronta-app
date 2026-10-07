/**
 * Talent hosts: design-token projection at the <html> level.
 *
 * `renderMaxSiteDocument` paints the resolved design tokens (CSS vars +
 * `data-token-*` attributes) on the `[data-talent-max-site]` root div. Platform
 * UI that is a SIBLING of that div (messages dock, socket, future client
 * account chrome) cannot inherit from it, so it has been fed token props
 * instead. Agency hosts already put the same projection on <html> (root
 * layout). This module builds the talent-host equivalent. Pure on purpose: no
 * React, no server-only imports, unit-testable.
 */

const CSS_VAR_NAME = /^--[a-zA-Z0-9_-]+$/;
const DATA_ATTR_NAME = /^data-token-[a-z0-9-]+$/;
/** A declaration value must not be able to close the rule or the <style> element. */
const UNSAFE_VALUE = /[<>{};\\\n\r]/;

function isSafeValue(value: string): boolean {
  return value.length > 0 && !UNSAFE_VALUE.test(value);
}

/**
 * `html{--token-color-primary:#111 !important;...}` or "" when nothing survives.
 *
 * `!important` is deliberate: the root layout writes registry-default token vars
 * inline on <html> for every route, and an inline declaration outranks any
 * stylesheet rule unless the rule is important. Descendants that set the same
 * var themselves (the root div keeps its own copy) are unaffected.
 */
export function buildHtmlTokenVarsCss(cssVars: Readonly<Record<string, string>>): string {
  const decls: string[] = [];
  for (const [name, raw] of Object.entries(cssVars)) {
    if (!CSS_VAR_NAME.test(name)) continue;
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!isSafeValue(value)) continue;
    decls.push(`${name}:${value} !important`);
  }
  return decls.length > 0 ? `html{${decls.join(";")}}` : "";
}

/** Only well-formed `data-token-*` attributes with simple values reach <html>. */
export function pickHtmlTokenAttrs(
  dataAttrs: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, raw] of Object.entries(dataAttrs)) {
    if (!DATA_ATTR_NAME.test(name)) continue;
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!isSafeValue(value)) continue;
    out[name] = value;
  }
  return out;
}
