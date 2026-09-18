/**
 * The pure half of `inquiry-name.ts`, importable from client components
 * (`inquiry-name.ts` itself is `server-only` because `currentInquiryName`
 * reads `inquiry_action_log`). The Messages v5 shell computes
 * `RenameInlineProps.generated` with `isGeneratedName` (D-MSG-100/101), so
 * these two live here and `inquiry-name.ts` re-exports them unchanged.
 */

export function fallbackName(contactName: string): string {
  const trimmed = contactName.trim();
  return trimmed === "" ? "Visitor" : trimmed;
}

/**
 * L4: pure. `currentInquiryName` returns `fallbackName(contactName)` exactly
 * when no `messaging_rename` row exists yet for the inquiry (D-MSG-3) — that
 * fallback IS the "generated" name (today: `contact_name`, the intent
 * engine's own extraction from the first message; there is no separate
 * generator to call). A name is "generated" iff it equals the fallback for
 * the SAME contact name; a rename to a value that happens to collide with the
 * fallback is a real edge case (rare — a staff member typing exactly what the
 * client already said) and is treated as generated, matching what
 * `currentInquiryName` itself would return for that inquiry either way.
 */
export function isGeneratedName(name: string, contactName: string): boolean {
  return name === fallbackName(contactName);
}
