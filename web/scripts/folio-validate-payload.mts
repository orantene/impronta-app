import { FOLIO_DESIGN_TOKEN_DEFAULTS } from "@/lib/talent-site/theme-catalog/collection/folio-defaults";
import { STYLE_TOKEN_DEFS, styleTokenValidator } from "@/lib/site-admin/tokens/style-tokens";
import { buildFolioPayload } from "@/lib/talent-site/theme-catalog/collection/designs";
import { validateDesign } from "@/lib/talent-site/theme-catalog/validate";

for (const def of STYLE_TOKEN_DEFS) {
  const v = FOLIO_DESIGN_TOKEN_DEFAULTS[def.key];
  if (v === undefined) continue;
  const r = styleTokenValidator(def).safeParse(v);
  if (!r.success) console.log("INVALID", def.key, v, String(r.error));
}
const p = buildFolioPayload();
console.log("keys", Object.keys(p.tokenDefaults || {}));
console.log(JSON.stringify(validateDesign(p), null, 2));
