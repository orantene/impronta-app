/**
 * site-templates — public surface.
 *
 *   Layer 1  LOOKS / getLook            (looks/)
 *   Layer 2  BUSINESS_COMPONENTS,
 *            resolveComponentsForType,
 *            buildComponentsForType     (business-components.ts)
 *   Engine   instantiateSite            (instantiate-site.ts)
 *
 * Layer 3 (lifestyle stock) plugs in through `ImageResolver`; the composer
 * (`composeSiteFromBrief`) owns the IO. Nothing here touches Supabase.
 */

export * from "./types";
export { LOOKS, getLook } from "./looks";
export {
  BUSINESS_COMPONENTS,
  FAMILY_COMPONENTS,
  TYPE_OVERRIDES,
  buildComponentsForType,
  familyForType,
  resolveComponentsForType,
} from "./business-components";
export { instantiateSite, resolveIdentityTemplate, type InstantiateSiteInput, type InstantiateSiteResult } from "./instantiate-site";
export { LOOK_COPY_DEFAULTS, COMPONENT_EMPTY_STATES, COMPONENT_LABELS } from "./copy";
export { exampleContext, fixtureImageResolver, emptyImageResolver, EXAMPLE_IDENTITY } from "./examples";
export { buildImageResolver, type CandidateImage } from "./image-resolver";
export { resolveTenantBusinessType, type ResolvedBusinessType } from "./tenant-business-type";
export { toPortableLook, parsePortableLook, type PortableLook } from "./portable-look";
export { DEFAULT_LOOK_BY_FAMILY } from "./look-defaults";
export { themePatchFromPalette } from "./theme-from-palette";
export { buildCopyPassPrompt, screenCopyReply, screenCopyValue, COPY_PASS_KEYS } from "./copy-pass";
// Server-only modules (composer, shell writer, logo re-theme, site_looks) are
// NOT re-exported here: this barrel is imported by client components.
export type { ComposeSiteInput, ComposeSiteResult, ComposeOutcome, SiteComposeStamp, SiteComposePlaced } from "./compose-site-from-brief.server";
