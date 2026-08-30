/**
 * Bounded copy rewrite for a selected signup starter tree.
 *
 * The model never emits nodes. It returns replacement strings for copy we
 * already extracted from a baked PAGE_DESIGN or the Lab default. Invalid,
 * empty, or over-long replacements are dropped; the original string stays.
 */

import {
  STARTER_COPY_PROP_KEYS,
  STARTER_OPAQUE_SUBTREE_KEYS,
} from "@/lib/site-admin/builder-node/starter-personalisation";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { parseModelJson } from "@/lib/site-admin/builder-core/ai/generate-nodes";

export const SIGNUP_COPY_MAX_FIELDS = 24;
export const SIGNUP_COPY_MAX_CHARS = 180;
/** Skip one-word chrome ("Book", "Menu") so the model spends tokens on headlines. */
export const SIGNUP_COPY_MIN_CHARS = 8;

/** Testimonials stay as designed. Rewriting them as this business's reviews is fake social proof. */
const SKIP_COPY_KEYS: ReadonlySet<string> = new Set(["quote"]);

export type SignupCopyField = {
  id: string;
  text: string;
};

function isCopyKey(key: string): boolean {
  if (SKIP_COPY_KEYS.has(key)) return false;
  if (STARTER_COPY_PROP_KEYS.has(key)) return true;
  const dot = key.lastIndexOf(".");
  return dot > -1 && STARTER_COPY_PROP_KEYS.has(key.slice(dot + 1));
}

export function extractSignupCopyFields(
  tree: BuilderNodeTree,
  maxFields: number = SIGNUP_COPY_MAX_FIELDS,
): SignupCopyField[] {
  const out: SignupCopyField[] = [];
  const seen = new Set<string>();

  function walk(value: unknown, ownerId: string, key: string | null): void {
    if (out.length >= maxFields) return;
    if (value == null) return;
    if (typeof value === "string") {
      if (!key || !isCopyKey(key)) return;
      const text = value.trim();
      if (text.length < SIGNUP_COPY_MIN_CHARS) return;
      if (text.includes("{{")) return;
      if (seen.has(text)) return;
      seen.add(text);
      out.push({ id: `${ownerId}:${key}:${out.length}`, text });
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, ownerId, key);
      return;
    }
    if (typeof value !== "object") return;
    const rec = value as Record<string, unknown>;
    if (key && STARTER_OPAQUE_SUBTREE_KEYS.has(key)) return;
    const nextOwner =
      typeof rec.id === "string" && rec.id.trim().length > 0 ? rec.id : ownerId;
    for (const [childKey, child] of Object.entries(rec)) {
      if (STARTER_OPAQUE_SUBTREE_KEYS.has(childKey)) continue;
      walk(child, nextOwner, childKey);
    }
  }

  walk(tree, "root", null);
  return out;
}

const EM_DASH = "\u2014";
const EN_DASH = "\u2013";

/** Drop braces, dashes the house style forbids, and anything over the cap. */
export function sanitizeSignupCopy(raw: string): string | null {
  let text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  text = text.replaceAll("{{", "").replaceAll("}}", "").trim();
  text = text.replaceAll(EM_DASH, " - ").replaceAll(EN_DASH, " - ");
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > SIGNUP_COPY_MAX_CHARS) {
    text = text.slice(0, SIGNUP_COPY_MAX_CHARS).trim();
  }
  if (text.length < 2) return null;
  return text;
}

export function parseSignupCopyReplacements(
  text: string | null | undefined,
): Map<string, string> {
  const parsed = parseModelJson(text);
  const out = new Map<string, string>();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out;
  const bag = (parsed as { replacements?: unknown }).replacements;
  if (!bag || typeof bag !== "object" || Array.isArray(bag)) return out;
  for (const [id, value] of Object.entries(bag as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const clean = sanitizeSignupCopy(value);
    if (!clean) continue;
    out.set(id, clean);
  }
  return out;
}

function rewriteCopyValue(
  value: unknown,
  ownerId: string,
  key: string | null,
  textMap: ReadonlyMap<string, string>,
): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (!key || !isCopyKey(key)) return value;
    return textMap.get(value) ?? textMap.get(value.trim()) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteCopyValue(item, ownerId, key, textMap));
  }
  if (typeof value !== "object") return value;
  const rec = value as Record<string, unknown>;
  if (key && STARTER_OPAQUE_SUBTREE_KEYS.has(key)) return value;
  const nextOwner =
    typeof rec.id === "string" && rec.id.trim().length > 0 ? rec.id : ownerId;
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [childKey, child] of Object.entries(rec)) {
    if (STARTER_OPAQUE_SUBTREE_KEYS.has(childKey)) {
      next[childKey] = child;
      continue;
    }
    const rewritten = rewriteCopyValue(child, nextOwner, childKey, textMap);
    if (rewritten !== child) changed = true;
    next[childKey] = rewritten;
  }
  return changed ? next : value;
}

/**
 * Apply replacements keyed by extract ids. Unknown ids are ignored.
 * Same original string is rewritten everywhere it appears as copy.
 */
export function applySignupCopyFields(
  tree: BuilderNodeTree,
  fields: readonly SignupCopyField[],
  replacements: ReadonlyMap<string, string>,
): BuilderNodeTree {
  const textMap = new Map<string, string>();
  for (const field of fields) {
    const next = replacements.get(field.id);
    if (!next || next === field.text) continue;
    textMap.set(field.text, next);
  }
  if (textMap.size === 0) return tree;
  const rewritten = rewriteCopyValue(tree, "root", null, textMap);
  return Array.isArray(rewritten) ? (rewritten as BuilderNodeTree) : tree;
}

export const SIGNUP_COPY_JSON_SCHEMA = {
  name: "signup_copy_replacements",
  strict: false,
  schema: {
    type: "object",
    required: ["replacements"],
    properties: {
      replacements: {
        type: "object",
        additionalProperties: { type: "string" },
        description: "Map of field id to rewritten copy. Omit ids you will not change.",
      },
    },
  },
} as const;
