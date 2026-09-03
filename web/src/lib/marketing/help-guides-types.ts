/**
 * Shapes for the /help role guides.
 *
 * Extracted from help-guides.ts so the per-audience guide modules can import
 * the types without importing the registry that imports them back — a module
 * cycle here evaluates to undefined at chunk load with no build error, which
 * this codebase has already been bitten by once.
 */

export type HelpGuide = {
  heading: string;
  body: string;
};

/**
 * A guide set in one language. The English fields live on the role directly;
 * `es` carries the same shape when a role has been authored in Spanish too.
 */
export type HelpGuideTranslation = {
  title: string;
  intro: string;
  guides: HelpGuide[];
};

export type HelpGuideRoleContent = HelpGuideTranslation & {
  ctaPrimary: { label: string; href: string };
  /**
   * Spanish content, when it exists.
   *
   * Optional on purpose: most of /help is English-only, and the guest AI
   * corpus drops English guides from Spanish grounding rather than answer a
   * Spanish visitor from an English source. A role that carries `es` is one a
   * Spanish reader can actually be served, and the corpus uses exactly that
   * distinction — presence of this field, not a hardcoded list of roles.
   */
  es?: HelpGuideTranslation;
};
