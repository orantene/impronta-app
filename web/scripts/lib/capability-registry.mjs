import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * capability-registry.mjs — the capability key set, parsed once.
 *
 * Extracted from `check-capability-keys.mjs` when that guard was split into a
 * credential-free half (registry vs `roles.ts`, stays in the `ci` chain) and a
 * credentialed half (`plan_capabilities` rows, now `manual:capability-keys-db`).
 * Both need the registry, and a second copy of this parser is exactly the kind
 * of duplicate that drifts and then disagrees about what a valid key is.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "..", "..");

export function readSource(relPath) {
  return readFileSync(resolve(WEB_ROOT, relPath), "utf8");
}

/**
 * Parse the registry keys from `lib/access/capabilities.ts` by matching the
 * string keys at the top level of the `CAPABILITIES = { ... }` literal.
 * We deliberately don't import the TS module — these scripts run in plain Node
 * without a TS loader, and the regex parse is robust enough for the source's
 * stable shape.
 *
 * Throws rather than returning empty: a zero-key registry means the parse broke,
 * and every caller would then report "no unknown keys found" while comparing
 * against nothing.
 */
export function readRegistryKeys() {
  const src = readSource("src/lib/access/capabilities.ts");
  const startIdx = src.indexOf("export const CAPABILITIES = {");
  if (startIdx < 0) throw new Error("CAPABILITIES literal not found");
  const tail = src.slice(startIdx);
  const endIdx = tail.indexOf("} as const;");
  if (endIdx < 0) throw new Error("CAPABILITIES end-of-literal not found");
  const body = tail.slice(0, endIdx);

  // Match keys like: `view_dashboard:` or `"agency.site_admin.media.delete":`
  const keys = new Set();
  const re = /^\s*(?:"([^"]+)"|([a-zA-Z_][\w.]*))\s*:\s*define\(/gm;
  let m;
  while ((m = re.exec(body)) !== null) {
    keys.add(m[1] ?? m[2]);
  }
  if (keys.size === 0) throw new Error("no capability keys parsed from registry");
  return keys;
}
