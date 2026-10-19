/**
 * The ONE way to turn JSON-LD into the body of a `<script type="application/ld+json">`.
 * `<` is escaped so a name or title containing `</script>` cannot close the tag
 * and inject markup. The result is still valid JSON that round-trips.
 */
export function jsonLdScriptString(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
