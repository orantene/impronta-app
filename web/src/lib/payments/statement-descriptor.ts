/**
 * Stripe `statement_descriptor_suffix` rules: 1-22 chars, at least one letter,
 * none of < > \\ ' " *, Latin characters only. We keep it conservative:
 * ASCII letters, digits and spaces, uppercased.
 */
export function sanitizeStatementDescriptorSuffix(
  name: string | null | undefined,
): string | undefined {
  if (!name) return undefined;
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 22)
    .trim()
    .toUpperCase();
  return /[A-Z]/.test(cleaned) ? cleaned : undefined;
}
