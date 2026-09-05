/**
 * STARTER PERSONALISATION — make a platform-authored starter tree speak as the
 * tenant it is being stamped for.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * New-tenant seeding is moving from the hardcoded legacy composition
 * (`buildFreeStarterEntries`, which interpolates the display name and picks one
 * of four audience heroes) to an admin-authored template published in Builder
 * Lab. The Lab template is a plain `builder_templates.builder_tree`: whatever
 * the admin typed, byte for byte. Without this pass, adopting the Lab template
 * would trade personalisation for modern freeform architecture. This module is
 * how we keep both.
 *
 * ── The vocabulary an author types ─────────────────────────────────────────
 * Two forms, both inside DOUBLE braces, both typed into an ordinary text field
 * in the visual builder (no JSON, no code node):
 *
 *   1. A NAME variable
 *        {{business.name}}      (alias: {{businessName}}; case-insensitive,
 *                                surrounding spaces ignored)
 *      Resolves to the tenant's display name, or {@link STARTER_BUSINESS_NAME_FALLBACK}
 *      when the tenant has none yet.
 *
 *   1b. TWO OPTIONAL FACTS, present or ABSENT, never invented
 *        {{business.tagline}}   the tenant's own one-line description
 *        {{business.city}}      the tenant's city
 *      Each resolves to the tenant's value when one exists and is STRIPPED
 *      (like an unknown placeholder, whitespace tidied) when it does not. A
 *      design must not carry a fictional description or city for a tenant
 *      that has none: a restaurant named El Paisa in Glew rendered as "Modern
 *      Mexican Kitchen · Mexico City" because the fixture copy was literal.
 *      Say nothing rather than invent.
 *
 *   2. An AUDIENCE SWITCH — one template, four businesses
 *        {{audience: agency=A curated roster, ready for your next production.
 *                  | organization=Book us for your next event.
 *                  | business=Come see what we do.
 *                  | else=Available for your next project.}}
 *      Cases are `key=value` separated by `|`. The first matching key wins;
 *      `else` is the fallback; with no `else`, the FIRST listed case is used, so
 *      an audience switch can never blank a headline.
 *
 * Deliberately NOT a template language: there are no loops, no nesting, no
 * expressions. A placeholder is a leaf. That is what keeps it safe to run over
 * an arbitrary operator-authored tree.
 *
 * ── Degradation rules (the ones that matter at publish time) ───────────────
 *  - An UNKNOWN placeholder (`{{whatever}}`) is REMOVED, not left in place.
 *    Raw `{{...}}` on a live storefront is the failure mode we are guarding
 *    against; a slightly shorter sentence is strictly better than visible
 *    template syntax. The surrounding whitespace/punctuation is tidied so the
 *    removal does not leave a double space or a space before a full stop.
 *  - An UNTERMINATED `{{` is left exactly as typed (it is not a placeholder,
 *    and eating the rest of the string would be worse than showing two braces).
 *  - SINGLE braces are never touched. `{brand}` is the i18n catalog's own
 *    convention and passes through untouched.
 *  - LITERAL double braces: prefix with a backslash. `\{{business.name}}`
 *    publishes as the text `{{business.name}}`. The backslash is consumed; a
 *    backslash anywhere else is untouched.
 *  - A tree with NO placeholders is returned BY REFERENCE (copy-on-write), so
 *    "unchanged" is provable with an identity check, not just deep equality.
 *
 * ── What gets substituted ──────────────────────────────────────────────────
 * The walk is generic over the whole node (props, children, `responsive`
 * buckets, `i18n` overlays, component instance overrides, experiment prop
 * overrides) and substitutes a string ONLY when its own property key is in
 * {@link STARTER_COPY_PROP_KEYS} — human copy. Keys carrying machine values
 * (`href`, `src`, `id`, `name`, `sourceKey`, class-like and style fields) are
 * not in that set and are therefore never rewritten. Four subtrees are skipped
 * wholesale because their keys are opaque or aliased: see
 * {@link STARTER_OPAQUE_SUBTREE_KEYS}.
 *
 * Pure: no I/O, no clock, no randomness. Two callers (seed time and the
 * render-time default-storefront fallback) share this one implementation.
 */

import type { BuilderNodeTree } from "./types";

/** Name used when the tenant has no display name yet. Matches the legacy
 *  `buildFreeStarterEntries` fallback so both starter paths read alike. */
export const STARTER_BUSINESS_NAME_FALLBACK = "Our studio";

/**
 * Property keys whose STRING value is human copy and may carry placeholders.
 *
 * Chosen by reading every `props` shape in `./types.ts`. Notable deliberate
 * OMISSIONS, each for a reason:
 *   - `href`, `src`, `imageSrc`, `imageUrl`, `backgroundImageUrl`, `permalink`,
 *     `mediaUrl`, `action` — destinations, not copy.
 *   - `id`, `sectionId`, `mediaId`, `taxonomyTermId`, `classRef`, `sourceKey`,
 *     `honeypotName`, `handle`, `icon`, `platform`, `provider` — identifiers.
 *   - every `style` field (`backgroundImage`, `customCss`, colours, …) and
 *     `code.html` — machine values / raw markup.
 *   - `name`: it is the pricing-tier display name AND the form field's
 *     SUBMISSION KEY (`BuilderFormField.name`). One key, two meanings, and
 *     rewriting a submission key would corrupt lead capture. Tier names are
 *     therefore not personalised; author the name into `description` instead.
 *   - `layerLabel`, `menu.groups`, `statItems[].value` — editor chrome / data.
 */
export const STARTER_COPY_PROP_KEYS: ReadonlySet<string> = new Set([
  // universal text-bearing leaves
  "text",
  "label",
  "title",
  "alt",
  "imageAlt",
  "backgroundImageAlt",
  "caption",
  "description",
  "tagline",
  "quote",
  // editorial furniture used across hero / grid / cta shapes
  "eyebrow",
  "headline",
  "subheadline",
  "highlight",
  "intro",
  "copy",
  "sub",
  "headingLead",
  "headingAccent",
  "reassurance",
  "emptyStateText",
  "statCountLabel",
  // action + form copy
  "ctaLabel",
  "primaryCtaLabel",
  "secondaryCtaLabel",
  "seeAllLabel",
  "submitLabel",
  "searchSubmitLabel",
  "placeholder",
  "searchPlaceholder",
  "consentText",
  "options",
  // navigation + accessible names
  "brand",
  "badge",
  "menuLabel",
  "ariaLabel",
]);

/**
 * Subtrees skipped wholesale, because a key inside them does NOT mean what the
 * same key means on a node's props:
 *   - `fieldBindings` — `{ text: "talent.displayName" }`: the value is a data
 *     SOURCE PATH, not copy. Substituting there would break the binding.
 *   - `dataBinding`   — `sourceKey` / `filterQuery`: a query, not copy.
 *   - `sectionProps`  — a curated section's own opaque config blob.
 *   - `config`        — `section_embed`'s opaque curated-section payload; its
 *     keys mix copy with hrefs and we cannot tell them apart here.
 *   - `visibilityCondition` — a predicate.
 */
export const STARTER_OPAQUE_SUBTREE_KEYS: ReadonlySet<string> = new Set([
  "fieldBindings",
  "dataBinding",
  "sectionProps",
  "config",
  "visibilityCondition",
]);

/** Everything the substitution knows about the tenant being stamped. */
export interface StarterPersonalisation {
  /** Tenant display / public name. Null or blank falls back to the constant. */
  businessName?: string | null;
  /**
   * The tenant's own one-line description (identity `tagline`). Absent means
   * `{{business.tagline}}` is stripped, never replaced with fixture copy.
   */
  businessTagline?: string | null;
  /** The tenant's city (identity `address_city`). Absent strips `{{business.city}}`. */
  businessCity?: string | null;
  /**
   * Signup answer to "Which describes you best?" ("agency" | "organization" |
   * "business" | "operator"). Absent at render-time fallback, where the answer
   * is not recoverable from the tenant row; audience switches then resolve to
   * their `else` case (or their first case).
   */
  audience?: string | null;
}

/** True when `key` (or the last segment of a dotted i18n key) is copy. */
function isCopyKey(key: string): boolean {
  if (STARTER_COPY_PROP_KEYS.has(key)) return true;
  const dot = key.lastIndexOf(".");
  return dot > -1 && STARTER_COPY_PROP_KEYS.has(key.slice(dot + 1));
}

/** Resolve one `{{audience: a=…|b=…|else=…}}` body against the context. */
function resolveAudienceSwitch(
  body: string,
  audience: string | null | undefined,
): string | null {
  const cases: Array<[string, string]> = [];
  for (const part of body.split("|")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    if (!key) continue;
    cases.push([key, part.slice(eq + 1).trim()]);
  }
  if (cases.length === 0) return null;
  const wanted = (audience ?? "").trim().toLowerCase();
  const hit =
    (wanted ? cases.find(([k]) => k === wanted) : undefined) ??
    cases.find(([k]) => k === "else") ??
    cases[0]!;
  return hit[1];
}

/** Resolve one placeholder body. `null` means "unknown" (the caller strips). */
function resolvePlaceholder(
  body: string,
  ctx: StarterPersonalisation,
): string | null {
  const token = body.trim();
  const lower = token.toLowerCase();
  if (lower.startsWith("audience:")) {
    return resolveAudienceSwitch(token.slice("audience:".length), ctx.audience);
  }
  if (lower === "business.name" || lower === "businessname") {
    return ctx.businessName?.trim() || STARTER_BUSINESS_NAME_FALLBACK;
  }
  // Optional facts: a value when the tenant has one, otherwise `null` so the
  // caller strips the placeholder exactly as it strips an unknown one. There
  // is deliberately NO fallback constant here: an invented description or city
  // is the defect these exist to remove.
  if (lower === "business.tagline" || lower === "businesstagline") {
    return ctx.businessTagline?.trim() || null;
  }
  if (lower === "business.city" || lower === "businesscity") {
    return ctx.businessCity?.trim() || null;
  }
  return null;
}

/**
 * Substitute placeholders in ONE author string. Returns the input unchanged
 * (same reference) when it carries nothing this module recognises.
 */
export function personaliseStarterCopy(
  input: string,
  ctx: StarterPersonalisation,
): string {
  if (!input.includes("{{")) return input;

  let out = "";
  let i = 0;
  let stripped = false;
  let changed = false;

  while (i < input.length) {
    const open = input.indexOf("{{", i);
    if (open === -1) {
      out += input.slice(i);
      break;
    }
    // Backslash escape: `\{{…}}` publishes the braces literally.
    if (open > 0 && input[open - 1] === "\\") {
      out += input.slice(i, open - 1) + "{{";
      i = open + 2;
      changed = true;
      continue;
    }
    const close = input.indexOf("}}", open + 2);
    if (close === -1) {
      // Unterminated: not a placeholder. Leave the rest exactly as typed.
      out += input.slice(i);
      break;
    }
    out += input.slice(i, open);
    const resolved = resolvePlaceholder(input.slice(open + 2, close), ctx);
    if (resolved === null) stripped = true;
    else out += resolved;
    changed = true;
    i = close + 2;
  }

  if (!changed) return input;
  if (!stripped) return out;
  // A removed placeholder must not leave "Book  us ." behind.
  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .trim();
}

/**
 * Copy-on-write deep map. Returns the SAME reference when nothing below
 * `value` changed, so an untouched tree is identity-equal to its input.
 */
function mapValue(
  value: unknown,
  key: string,
  ctx: StarterPersonalisation,
): unknown {
  if (typeof value === "string") {
    return isCopyKey(key) ? personaliseStarterCopy(value, ctx) : value;
  }
  if (Array.isArray(value)) {
    let changed = false;
    // Array elements inherit the array's key, so `options: ["a", "b"]` and
    // `chips: [{ label }]` both behave.
    const next = value.map((entry) => {
      const mapped = mapValue(entry, key, ctx);
      if (mapped !== entry) changed = true;
      return mapped;
    });
    return changed ? next : value;
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    let changed = false;
    const next: Record<string, unknown> = {};
    const bindings =
      source.fieldBindings &&
      typeof source.fieldBindings === "object" &&
      !Array.isArray(source.fieldBindings)
        ? (source.fieldBindings as Record<string, unknown>)
        : null;
    for (const [childKey, childValue] of Object.entries(source)) {
      if (STARTER_OPAQUE_SUBTREE_KEYS.has(childKey)) {
        next[childKey] = childValue;
        continue;
      }
      // Repeater display tokens (`text: "{{num}}"` + `fieldBindings.text`)
      // are not Wave 2a placeholders. Stripping them blanks bound steps.
      if (
        bindings &&
        childKey in bindings &&
        typeof childValue === "string"
      ) {
        next[childKey] = childValue;
        continue;
      }
      const mapped = mapValue(childValue, childKey, ctx);
      if (mapped !== childValue) changed = true;
      next[childKey] = mapped;
    }
    return changed ? next : value;
  }
  return value;
}

/**
 * Apply the tenant's personalisation to a platform-authored starter tree.
 *
 * Pure and total: any tree shape is accepted (including one that predates the
 * placeholder vocabulary), and a tree with no placeholders is returned by
 * reference.
 */
export function personaliseStarterBuilderTree(
  tree: BuilderNodeTree,
  ctx: StarterPersonalisation,
): BuilderNodeTree {
  if (!Array.isArray(tree) || tree.length === 0) return tree;
  return mapValue(tree, "", ctx) as BuilderNodeTree;
}
