/**
 * TUL-369 split (PM 2026-10-09): EN↔ES guess maps kept as a FALLBACK only.
 *
 * Prefer `props.i18n.es` / `props.i18n.en` (seeded overlays). Use this table
 * only when a node has no overlay for the target locale — so live sites that
 * still lack i18n.es keep Spanish pages readable until PM heals them
 * (`qa:heal-seed-i18n-missing-es`). Follow-up PR deletes this file once the
 * recount is 0.
 *
 * Built from `SEED_TEXT_ES` plus authored-overlay `labelsEs`.
 */
import { registeredAuthoredOverlays } from "./theme-catalog/collection/authored";
import { SEED_TEXT_ES } from "./theme-catalog/seed-i18n";

/**
 * Seed table plus the `labelsEs` of every committed authored overlay.
 * An overlay entry wins a clash.
 */
const SEEDED_LABELS_ES: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = { ...SEED_TEXT_ES };
  for (const [, o] of registeredAuthoredOverlays()) Object.assign(out, o.labelsEs);
  return out;
})();

/**
 * Seeded labels with a `{{token}}` are matched as patterns after hydration.
 */
const SEEDED_PATTERNS_ES: ReadonlyArray<{ re: RegExp; es: string }> = Object.entries(SEEDED_LABELS_ES)
  .filter(([en]) => en.includes("{{"))
  .map(([en, es]) => {
    const source = en
      .split(/(\{\{\w+\}\})/)
      .map((part) => {
        const m = /^\{\{(\w+)\}\}$/.exec(part);
        if (m) return "(.+?)";
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
    let i = 0;
    const out = es.replace(/\{\{\w+\}\}/g, () => `$${(i += 1)}`);
    return { re: new RegExp(`^${source}$`), es: out };
  });

/** Inverse: Spanish seed → English (legacy Spanish-base trees). */
const SEEDED_LABELS_EN: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {};
  for (const [en, es] of Object.entries(SEEDED_LABELS_ES)) {
    if (en === es || en.includes("{{") || es in out) continue;
    out[es] = en;
  }
  return out;
})();

function localisePattern(value: string): string | null {
  for (const p of SEEDED_PATTERNS_ES) {
    if (p.re.test(value)) return value.replace(p.re, p.es);
  }
  return null;
}

export type GuessLabelTarget = "es" | "en";

/**
 * Guess-map replacement for one seeded string, or null when unknown.
 * Callers must only use this when the node has no `props.i18n[locale]`.
 */
export function guessSeededLabelFallback(value: string, target: GuessLabelTarget): string | null {
  const key = value.trim();
  if (!key) return null;
  if (target === "es") {
    const hit = SEEDED_LABELS_ES[key] ?? localisePattern(key);
    return hit && hit !== value ? hit : null;
  }
  const hit = SEEDED_LABELS_EN[key];
  return hit && hit !== value ? hit : null;
}

/** True when the node carries any overlay bag for `locale`. */
export function nodeHasLocaleOverlay(props: Record<string, unknown> | undefined, locale: GuessLabelTarget): boolean {
  const i18n = props?.i18n;
  if (!i18n || typeof i18n !== "object" || Array.isArray(i18n)) return false;
  const bag = (i18n as Record<string, unknown>)[locale];
  return !!bag && typeof bag === "object" && !Array.isArray(bag) && Object.keys(bag as object).length > 0;
}

/**
 * Dev-only warning when the guess map covers a missing overlay.
 * Names profile (when known) and node key/kind so heal inventory can find it.
 */
export function warnGuessMapFallback(input: {
  profileCode?: string | null;
  nodeKey?: string | null;
  nodeKind?: string | null;
  locale: GuessLabelTarget;
  path: string;
  from: string;
  to: string;
}): void {
  if (process.env.NODE_ENV === "production") return;
  const where = [
    input.profileCode ? `profile=${input.profileCode}` : null,
    input.nodeKey ? `node=${input.nodeKey}` : null,
    input.nodeKind ? `kind=${input.nodeKind}` : null,
    `path=${input.path}`,
  ]
    .filter(Boolean)
    .join(" ");
  console.warn(
    `[talent-site] guess-map fallback (${input.locale}) ${where}: ${JSON.stringify(input.from)} → ${JSON.stringify(input.to)} (no props.i18n.${input.locale}; heal via qa:heal-seed-i18n-missing-es)`,
  );
}
