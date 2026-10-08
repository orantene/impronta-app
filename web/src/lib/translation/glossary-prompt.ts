import glossary from "@/i18n/glossary.json";

/** Shared with short-label translation (taxonomy, locations) and the talent field translate. Pure. */
export function glossaryPromptBlock(): string {
  const terms = (glossary as { protectedTerms: string[] }).protectedTerms;
  return `Keep these brand/product terms unchanged (do not translate): ${terms.join(", ")}.`;
}
