/**
 * DS-22: a section's small eyebrow that says the same words as its heading
 * ("TRABAJO RECIENTE" above "Trabajo reciente") adds nothing. The render skips
 * it; the stored copy is untouched. Compared ignoring case, accents, the
 * italic markers the builder titles carry ({i}...{/i}), punctuation and spacing.
 */
function plain(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/\{\/?i\}/gi, "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function eyebrowDuplicatesHeading(
  eyebrow: string | null | undefined,
  heading: string | null | undefined,
): boolean {
  const e = plain(eyebrow);
  return e !== "" && e === plain(heading);
}
