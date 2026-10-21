/**
 * The demo allow-list for repair-demo-alt-i18n.mts (Refs TUL-1792), derived from CODE only:
 *  - gallery demos that render a seeded demo talent (allowedDemoProfileCodes: built, kind demo-talent),
 *  - THEME_DEMOS (theme-demos.ts), live or not yet live,
 *  - the seed definitions in scripts/demo-talents/demos.ts (DEMOS).
 * buildAllowList keeps only TAL-93xxx codes and drops TAL-93938 / TAL-93940.
 */
import { allowedDemoProfileCodes } from "../../src/app/template-preview/[key]/demo-preview-source";
import { THEME_DEMOS } from "../../src/lib/talent-site/theme-catalog/theme-demos";
import { buildAllowList } from "../lib/demo-alt-i18n.mjs";
import { DEMOS } from "./demos";

export function rawDemoCodes(): string[] {
  return [...allowedDemoProfileCodes(), ...THEME_DEMOS.map((d) => d.profileCode), ...DEMOS.map((d) => d.profileCode)];
}

export function demoAltAllowList(): { allowed: Set<string>; dropped: string[] } {
  return buildAllowList(rawDemoCodes());
}
