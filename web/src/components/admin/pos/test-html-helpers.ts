/**
 * test-html-helpers.ts — a substring check that agrees with how
 * `renderToStaticMarkup` actually encodes text.
 *
 * React escapes `&`, `<`, `>`, `"` and `'` in every text node it renders
 * (`&#x27;` for an apostrophe, among others). Several of this Counter's real
 * strings carry one — English "customer's", French "n'est", "d'encaisser" —
 * so a naive `markup.includes(copy.someString)` silently fails on exactly
 * the languages and sentences most worth proving. This file is NOT itself a
 * `*.test.ts`/`*.test.tsx` file (the design-system lane glob would try to run
 * it as a suite with zero tests and fail), it is a helper the render tests
 * import.
 */

export function htmlEscapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/>/g, "&gt;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Does the rendered markup contain this exact (unescaped) source text? */
export function markupIncludesText(markup: string, text: string): boolean {
  return markup.includes(htmlEscapeText(text));
}
