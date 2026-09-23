/**
 * Talent Max SITE: shared SECTION builders for the starter-template gallery.
 *
 * Thin re-export. The builders moved to the talent SECTION KIT
 * (`theme-catalog/section-kit.ts`), where every top-level section carries
 * `slotKey` + `originRole` and styles bind to `token:` refs instead of hex
 * literals, so the same builders serve the five starter templates and the
 * theme gallery's built-in Designs.
 */
export {
  aboutBlock,
  buildKitShell,
  buildKitStandardShell,
  contactBlock,
  defaultIdFactory,
  galleryBlock,
  heroCentered,
  heroCover,
  heroSplit,
  servicesBlock,
} from "../theme-catalog/section-kit";
export type { KitShellOptions } from "../theme-catalog/section-kit";
