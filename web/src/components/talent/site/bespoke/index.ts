/**
 * Bespoke, hand-built premium templates (not composed from the section
 * registry). When a key is bespoke, the preview route (and later the public
 * talent site) renders the dedicated component full-bleed instead of the
 * section renderer. Rendering is wired in the route via static branches so each
 * component can receive its own typed content/config.
 */
export const BESPOKE_KEYS = new Set<string>([
  "chef",
  "singer",
  "photographer",
  "hybrid-singer-massage",
  "hybrid-chef-massage",
  "hybrid-model-dj",
  "model-flight",
]);

export function hasBespokeTemplate(key: string): boolean {
  return BESPOKE_KEYS.has(key);
}
