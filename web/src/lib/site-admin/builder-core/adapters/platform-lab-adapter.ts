/**
 * Platform Lab surface adapter (WS5) — the EPHEMERAL production binding.
 *
 * Persistence is a no-op sink. The Lab is a workshop where a super_admin loads
 * a real subject into the shared editor and authors / tests templates; the only
 * durable output is a `builder_templates` row written through the WS2 registry
 * actions ("Save as page template" / "Save section as gallery item"), NOT a
 * homepage / page write. The builder's own autosave / Save / Publish therefore
 * route through this adapter's no-op sink and write nothing.
 *
 * The pure DI factory (`createPlatformLabAdapter`) lives in
 * `platform-lab-adapter-core.ts`, which has NO runtime imports — that is what
 * the ephemeral-persistence spy test imports. This module binds the production
 * dependencies (here: an empty seed composition; the preview subject is threaded
 * into the render context via the surface config, not the composition payload)
 * into the shared `platformLabAdapter` instance the Lab mount uses.
 *
 * This adapter is NOT the homepage surface, so its mutations call
 * `assertNoLegacyBuilderWrite("platform_lab", …)` defensively (wired inside the
 * core factory). A regression that ever pointed it at `cms_page_sections` /
 * `composition[]` throws loudly instead of corrupting page data.
 */

import type { BuilderSurfaceAdapter } from "../surface-adapter";
import { createPlatformLabAdapter } from "./platform-lab-adapter-core";

export {
  createPlatformLabAdapter,
  emptyLabComposition,
} from "./platform-lab-adapter-core";
export type { PlatformLabAdapterDeps } from "./platform-lab-adapter-core";

/**
 * The production platform_lab adapter. Seeds the editor with an empty freeform
 * canvas (the chosen preview subject hydrates connected nodes at render time
 * via the render context's `previewSubject`, not via the composition payload).
 * `loadInitialComposition` returns `null` so the core falls back to its minimal
 * `emptyLabComposition`.
 */
export const platformLabAdapter: BuilderSurfaceAdapter = createPlatformLabAdapter(
  {
    loadInitialComposition: () => null,
  },
);
