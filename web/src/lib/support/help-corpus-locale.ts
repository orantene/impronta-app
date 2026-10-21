import { SUPPORT_HELP_REGISTRY, flattenHelpCorpus, retrieveHelpEntries } from "./help-corpus";
import type { HelpCorpusEntry } from "./help-corpus";
import { TALENT_HELP_ES } from "./help-corpus-es";
import { TALENT_EDITION_HELP_ES } from "./help-corpus-es-edition";

/** True for "es", "es-MX", "es_419" and similar. */
export function isSpanishLocale(locale: string | null | undefined): boolean {
  return /^es(?:[-_]|$)/i.test((locale ?? "").trim());
}

const CORPUS_EN = flattenHelpCorpus();
const CORPUS_ES = flattenHelpCorpus({ ...SUPPORT_HELP_REGISTRY, ...TALENT_HELP_ES, ...TALENT_EDITION_HELP_ES });

/** The corpus for a locale: Spanish twins replace the talent entries when the user is on es. */
export function helpCorpusForLocale(locale: string | null | undefined): HelpCorpusEntry[] {
  return isSpanishLocale(locale) ? CORPUS_ES : CORPUS_EN;
}

/** Drop-in for retrieveHelpEntries that selects the corpus by the user's locale. */
export function retrieveHelpEntriesForLocale(
  question: string,
  locale: string | null | undefined,
  opts: Omit<Parameters<typeof retrieveHelpEntries>[1], "corpus"> = {},
): HelpCorpusEntry[] {
  return retrieveHelpEntries(question, { ...opts, corpus: helpCorpusForLocale(locale) });
}
