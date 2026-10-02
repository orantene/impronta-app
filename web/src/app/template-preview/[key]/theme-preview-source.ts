/**
 * `?source=code` on the theme preview (Template Factory, parity fix loop).
 *
 * Renders the IN-CODE Design payload (the built-in a deploy would sync) instead
 * of the published catalog row, hydrated with a demo talent's content. An edit
 * to a payload or token file is then one HMR refresh and one parity pass, with
 * no sync, release or rebuild. It shows unreleased work, so it is gated to
 * platform admins and local development; anyone else gets the normal render.
 */
export function isCodeSourceRequested(
  param: string | null | undefined,
  gate: { isPlatformAdmin: boolean; nodeEnv?: string },
): boolean {
  if (param?.trim().toLowerCase() !== "code") return false;
  return gate.isPlatformAdmin || (gate.nodeEnv ?? process.env.NODE_ENV) === "development";
}

/**
 * `?source=draft`: the OPEN talent_theme_drafts payload, read-only, for the parity
 * fast loop. Unreleased work, so platform admins only (no dev-mode bypass).
 */
export function isDraftSourceRequested(
  param: string | null | undefined,
  gate: { isPlatformAdmin: boolean },
): boolean {
  return param?.trim().toLowerCase() === "draft" && gate.isPlatformAdmin;
}
