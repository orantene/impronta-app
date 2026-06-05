/**
 * Runtime flag — client-rendered builder canvas (W3 Sub-step B).
 *
 * DEFAULT OFF. When unset / not exactly `"1"` or `"true"`, the storefront body
 * renders EXACTLY as it does today (server-rendered canvas + `router.refresh()`
 * per edit — the safety net). Only when `NEXT_PUBLIC_BUILDER_CLIENT_CANVAS`
 * is explicitly enabled does the in-place editor mount `<ClientBuilderCanvas>`
 * for the freeform builder tree.
 *
 * `NEXT_PUBLIC_*` is inlined at build time, so this reads identically on the
 * server (homepage-cms-sections) and the client (ClientBuilderCanvas) — there
 * is no per-request divergence that could cause a hydration mismatch about
 * WHICH path renders.
 */
export function isBuilderClientCanvasEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_BUILDER_CLIENT_CANVAS;
  return raw === "1" || raw === "true";
}
