/**
 * TUL-207: the HARD allow-list of the demo talents this script may touch, and the
 * profiles it must never touch. Pure data: no imports, no database.
 *
 * Every profile code below comes from the repo's own demo sources
 * (`src/lib/talent-site/theme-catalog/theme-demos.ts`, `registry.ts`,
 * `scripts/demo-talents/demos.ts`). The script still resolves each code to a
 * profile at run time and REFUSES unless that profile is flagged
 * `talent_profiles.is_demo = true` and its site slug is the one listed here.
 *
 * The "-demo" host names the owner uses map to these site slugs: the demo host
 * label is `<site_slug>-demo` (see `stripTalentDemoHostSuffix`), and
 * `maison-v2-demo` is the vanity alias of Alba's published site.
 */

export interface DemoTarget {
  profileCode: string;
  /** The `talent_sites.site_slug` the profile must have. */
  siteSlug: string;
  /** The demo host label(s) this target answers to, for the dry-run header. */
  hosts: readonly string[];
}

export const ALLOWED_TARGETS: readonly DemoTarget[] = [
  { profileCode: "TAL-93020", siteSlug: "alba-nail-artist", hosts: ["alba-nail-artist-demo", "maison-v2-demo"] },
  { profileCode: "TAL-93002", siteSlug: "renata-lashes", hosts: ["renata-lashes-demo"] },
  { profileCode: "TAL-93105", siteSlug: "sofia-rinaldi", hosts: ["sofia-rinaldi-demo"] },
  { profileCode: "TAL-93212", siteSlug: "ramon-gutierrez-pacheco", hosts: ["ramon-gutierrez-pacheco-demo"] },
  { profileCode: "TAL-93007", siteSlug: "sofia-barra", hosts: ["sofia-barra-demo"] },
  { profileCode: "TAL-93004", siteSlug: "lucia-herrera", hosts: ["lucia-herrera-demo"] },
  { profileCode: "TAL-93114", siteSlug: "rafael-hernandez-cuevas", hosts: ["rafael-hernandez-cuevas-demo"] },
  { profileCode: "TAL-93113", siteSlug: "elena-garza-trevino", hosts: ["elena-garza-trevino-demo"] },
  { profileCode: "TAL-93111", siteSlug: "noemi-castaneda", hosts: ["noemi-castaneda-demo"] },
];

/** Real talents and QA talents: never a target, whatever else says so. */
export const FORBIDDEN_PROFILE_CODES: readonly string[] = ["TAL-93938", "TAL-93900"];
export const FORBIDDEN_SITE_SLUGS: readonly string[] = ["book-jorgelina", "jorg-beauty-qa"];
