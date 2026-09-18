// Shared node source for the guide-sync pipeline scripts. No side effects on
// import — safe for both generate-guide-articles.mjs and
// check-guide-coverage.mjs to import.
//
// The ad-hoc "support.*" nodes (the drawer's own controls) live in
// src/lib/guide/adhoc-nodes.ts, imported here via the tsx loader — NOT
// duplicated in this file. They diverged once already (the app's
// registry-fallback didn't know about them until the drawer's own Helper
// mode hotspots pointed at ids the client-side reader couldn't resolve);
// one source read from both sides of the pipeline is how that stays fixed.

export async function loadRegistry() {
  const registryMod = await import("../../src/components/admin/shell/internal/help-registry.ts");
  const adhocMod = await import("../../src/lib/guide/adhoc-nodes.ts");
  return { ...registryMod.DRAWER_HELP, ...adhocMod.ADHOC_GUIDE_NODES };
}
