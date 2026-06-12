/**
 * Directory field-driven filter sidebar — public entry point (barrel).
 *
 * This module was split into focused seam modules for maintainability; it stays
 * as the stable public import path so no caller changes. The implementation
 * lives in:
 *   - `directory-filter-shared.ts`       — shared types + pure helpers
 *   - `directory-filter-catalog-load.ts` — frozen catalog skeleton + visibility gate
 *   - `directory-filter-facet-rpcs.ts`   — per-facet count RPC wrappers
 *   - `directory-filter-sections.ts`     — section building, block assembly, caching
 */

export type {
  DirectoryFilterPresentation,
  DirectoryFilterOption,
  DirectoryFilterSection,
  DirectoryFilterSidebarBlock,
  DirectoryTopBarFacetModel,
  DirectoryTalentTypeTopBarModel,
  DirectoryFilterSidebarModel,
  DirectoryFilterRequestContext,
  DirectorySurface,
} from "@/lib/directory/directory-filter-shared";

export {
  DIRECTORY_TALENT_TYPE_FIELD_KEY,
  directorySurfaceFromTenantId,
} from "@/lib/directory/directory-filter-shared";

export {
  getCachedDirectoryFilterSidebarModel,
  getCachedDirectoryFilterSections,
} from "@/lib/directory/directory-filter-sections";
