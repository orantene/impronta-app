/**
 * AI-at-signup orchestrator. Pure except for the injected loaders / model.
 *
 * Order:
 *   1. Pick a PAGE_DESIGN or the Lab platform default (deterministic).
 *   2. Bake / load that tree.
 *   3. Race a bounded copy rewrite against a timeout.
 *   4. Personalise name + audience, prune roster furniture, validate.
 *   5. Any miss falls through to the next source. Signup never dead-ends
 *      on the model: a working static site always publishes.
 */

import {
  bakePageDesignTree,
  getPageDesign,
} from "@/lib/site-admin/builder-node/page-designs";
import {
  personaliseStarterBuilderTree,
  type StarterPersonalisation,
} from "@/lib/site-admin/builder-node/starter-personalisation";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import type { JsonSchemaForChat } from "@/lib/ai/provider";

import { pruneStarterRosterForAudience } from "./starter-roster-prune";
import { pickSignupDesign } from "./signup-design-pick";
import {
  applySignupCopyFields,
  extractSignupCopyFields,
  parseSignupCopyReplacements,
  SIGNUP_COPY_JSON_SCHEMA,
  SIGNUP_COPY_MAX_CHARS,
} from "./signup-copy-adapt";

export const SIGNUP_AI_TIMEOUT_MS = 5_000;
export const SIGNUP_AI_MAX_TOKENS = 1_200;
export const SIGNUP_AI_MODEL = "claude-sonnet-5";

export type SignupStarterSource = "ai_adapted" | "design" | "platform_default";

export type SignupStarterDraft = {
  builderTree: BuilderNodeTree;
  source: SignupStarterSource;
  designId: string | null;
};

export type SignupCopyGenerateFn = (input: {
  systemPrompt: string;
  userMessage: string;
  jsonSchema: JsonSchemaForChat;
  maxTokens: number;
}) => Promise<string | null>;

export async function raceWithTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function finishTree(
  tree: BuilderNodeTree,
  personalisation: StarterPersonalisation,
): BuilderNodeTree | null {
  const stamped = personaliseStarterBuilderTree(tree, personalisation);
  const pruned = pruneStarterRosterForAudience(
    stamped,
    personalisation.audience,
  );
  const validated = validateBuilderNodeTree(pruned);
  return validated.tree.length > 0 ? validated.tree : null;
}

function buildCopyPrompts(input: {
  personalisation: StarterPersonalisation;
  businessDescription: string;
  fields: ReadonlyArray<{ id: string; text: string }>;
}): { systemPrompt: string; userMessage: string } {
  const name =
    input.personalisation.businessName?.trim() || "this business";
  const audience = input.personalisation.audience?.trim() || "operator";
  const systemPrompt = [
    "You rewrite homepage copy for a newly signed-up business.",
    "Return JSON only: {\"replacements\": {\"<id>\": \"<text>\"}}.",
    "Rules:",
    "- Rewrite only the supplied fields. Do not add keys.",
    `- Each value is at most ${SIGNUP_COPY_MAX_CHARS} characters.`,
    "- Write in the same language as the brief. Default English.",
    "- Do not use em dashes or en dashes.",
    "- Do not invent clients, reviews, awards, press, or numbers the brief does not state.",
    "- Do not mention Tulala, the page builder, or that this is a template.",
    "- Keep the tone of a real business site, not onboarding instructions.",
  ].join("\n");
  const userMessage = [
    `Business name: ${name}`,
    `Signup audience: ${audience}`,
    `What they do: ${input.businessDescription}`,
    "Fields:",
    JSON.stringify(input.fields),
  ].join("\n");
  return { systemPrompt, userMessage };
}

async function adaptCopy(input: {
  tree: BuilderNodeTree;
  personalisation: StarterPersonalisation;
  businessDescription: string;
  generateCopy: SignupCopyGenerateFn;
  timeoutMs: number;
}): Promise<BuilderNodeTree | null> {
  const fields = extractSignupCopyFields(input.tree);
  if (fields.length === 0) return null;
  const prompts = buildCopyPrompts({
    personalisation: input.personalisation,
    businessDescription: input.businessDescription,
    fields,
  });
  const text = await raceWithTimeout(
    input.generateCopy({
      systemPrompt: prompts.systemPrompt,
      userMessage: prompts.userMessage,
      jsonSchema: SIGNUP_COPY_JSON_SCHEMA as JsonSchemaForChat,
      maxTokens: SIGNUP_AI_MAX_TOKENS,
    }),
    input.timeoutMs,
  );
  if (!text) return null;
  const replacements = parseSignupCopyReplacements(text);
  if (replacements.size === 0) return null;
  const adapted = applySignupCopyFields(input.tree, fields, replacements);
  return adapted === input.tree ? null : adapted;
}

function bakePickedDesign(designId: string): BuilderNodeTree | null {
  const design = getPageDesign(designId);
  if (!design) return null;
  const baked = bakePageDesignTree(design.tree, design.dataSources);
  return baked.length > 0 ? baked : null;
}

export async function resolveSignupStarterTree(input: {
  personalisation: StarterPersonalisation;
  businessDescription?: string | null;
  loadPlatformDefault: () => Promise<BuilderNodeTree | null>;
  generateCopy?: SignupCopyGenerateFn | null;
  timeoutMs?: number;
}): Promise<SignupStarterDraft | null> {
  const timeoutMs = input.timeoutMs ?? SIGNUP_AI_TIMEOUT_MS;
  const description = input.businessDescription?.trim() ?? "";
  const pick = pickSignupDesign({
    audience: input.personalisation.audience,
    businessDescription: description,
  });

  const tryAdapt = async (
    tree: BuilderNodeTree,
  ): Promise<BuilderNodeTree | null> => {
    if (!input.generateCopy || description.length === 0) return null;
    try {
      return await adaptCopy({
        tree,
        personalisation: input.personalisation,
        businessDescription: description,
        generateCopy: input.generateCopy,
        timeoutMs,
      });
    } catch {
      return null;
    }
  };

  if (pick.source === "page_design" && pick.designId) {
    const baked = bakePickedDesign(pick.designId);
    if (baked) {
      const adapted = await tryAdapt(baked);
      const finished = finishTree(adapted ?? baked, input.personalisation);
      if (finished) {
        return {
          builderTree: finished,
          source: adapted ? "ai_adapted" : "design",
          designId: pick.designId,
        };
      }
    }
  }

  const platform = await input.loadPlatformDefault();
  if (!platform || platform.length === 0) return null;
  const adapted = await tryAdapt(platform);
  const finished = finishTree(adapted ?? platform, input.personalisation);
  if (!finished) return null;
  return {
    builderTree: finished,
    source: adapted ? "ai_adapted" : "platform_default",
    designId: null,
  };
}
