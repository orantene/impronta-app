import assert from "node:assert/strict";
import { test } from "node:test";

import { getPageDesign } from "@/lib/site-admin/builder-node/page-designs";
import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

import {
  raceWithTimeout,
  resolveSignupStarterTree,
  SIGNUP_AI_MODEL,
} from "./signup-ai-draft";

function collectText(tree: BuilderNodeTree): string {
  const parts: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      parts.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const child of Object.values(value as Record<string, unknown>)) {
        walk(child);
      }
    }
  };
  walk(tree);
  return parts.join("\n");
}

test("signup copy uses Sonnet, not the page-builder Opus pin", () => {
  assert.equal(SIGNUP_AI_MODEL, "claude-sonnet-5");
});

test("raceWithTimeout returns null when the work does not finish", async () => {
  const hung = new Promise<string>(() => undefined);
  const result = await raceWithTimeout(hung, 15);
  assert.equal(result, null);
});

test("a restaurant brief bakes the restaurant design without a model", async () => {
  const draft = await resolveSignupStarterTree({
    personalisation: {
      businessName: "Casa Muna",
      audience: "business",
    },
    businessDescription: "A neighbourhood restaurant in Tulum.",
    loadPlatformDefault: async () => {
      throw new Error("platform default must not run when the design bakes");
    },
    generateCopy: null,
  });
  assert.ok(draft);
  assert.equal(draft!.source, "design");
  assert.equal(draft!.designId, "restaurant");
  assert.ok(draft!.builderTree.length > 0);
  assert.ok(getPageDesign("restaurant"));
});

test("a hanging model call still publishes the selected design", async () => {
  const draft = await resolveSignupStarterTree({
    personalisation: {
      businessName: "Casa Muna",
      audience: "business",
    },
    businessDescription: "A neighbourhood restaurant in Tulum.",
    loadPlatformDefault: async () => null,
    generateCopy: () => new Promise(() => undefined),
    timeoutMs: 20,
  });
  assert.ok(draft);
  assert.equal(draft!.source, "design");
  assert.equal(draft!.designId, "restaurant");
});

test("a throwing model call falls back to the selected design", async () => {
  const draft = await resolveSignupStarterTree({
    personalisation: {
      businessName: "Casa Muna",
      audience: "business",
    },
    businessDescription: "A neighbourhood restaurant in Tulum.",
    loadPlatformDefault: async () => null,
    generateCopy: async () => {
      throw new Error("provider down");
    },
  });
  assert.ok(draft);
  assert.equal(draft!.source, "design");
});

test("usable model copy marks the draft as ai_adapted", async () => {
  const draft = await resolveSignupStarterTree({
    personalisation: {
      businessName: "Casa Muna",
      audience: "business",
    },
    businessDescription: "A neighbourhood restaurant in Tulum.",
    loadPlatformDefault: async () => null,
    generateCopy: async () =>
      JSON.stringify({
        replacements: {
          ignored: "skip",
        },
      }),
  });
  // The stub does not know field ids, so replacements miss and we stay on design.
  // A second call below walks real extracted copy.
  assert.ok(draft);
  assert.equal(draft!.source, "design");

  let capturedIds: string[] = [];
  const adapted = await resolveSignupStarterTree({
    personalisation: {
      businessName: "Casa Muna",
      audience: "business",
    },
    businessDescription: "A neighbourhood restaurant in Tulum.",
    loadPlatformDefault: async () => null,
    generateCopy: async (input) => {
      const fields = JSON.parse(input.userMessage.split("Fields:\n")[1] ?? "[]") as Array<{
        id: string;
        text: string;
      }>;
      capturedIds = fields.map((field) => field.id);
      const replacements: Record<string, string> = {};
      if (fields[0]) replacements[fields[0].id] = "Casa Muna cooks what the coast gives.";
      return JSON.stringify({ replacements });
    },
  });
  assert.ok(adapted);
  assert.ok(capturedIds.length > 0, "the model must receive extracted field ids");
  assert.equal(adapted!.source, "ai_adapted");
  assert.match(collectText(adapted!.builderTree), /Casa Muna cooks what the coast gives/);
});

test("agency without a keyword uses the platform default loader", async () => {
  const platform: BuilderNodeTree = [
    {
      id: "root",
      kind: "container",
      props: { layout: "stack" },
      children: [
        {
          id: "hero",
          kind: "heading",
          props: { text: "A curated roster for your next production.", level: 1 },
        },
      ],
    } as BuilderNode,
  ];
  const draft = await resolveSignupStarterTree({
    personalisation: {
      businessName: "Riviera Maya Work",
      audience: "agency",
    },
    businessDescription: "We represent local talent.",
    loadPlatformDefault: async () => platform,
    generateCopy: null,
  });
  assert.ok(draft);
  assert.equal(draft!.source, "platform_default");
  assert.equal(draft!.designId, null);
  assert.equal(draft!.builderTree.length > 0, true);
});

test("when the platform default is missing the seed returns null", async () => {
  const draft = await resolveSignupStarterTree({
    personalisation: { businessName: "Agency", audience: "agency" },
    businessDescription: "We represent local talent.",
    loadPlatformDefault: async () => null,
    generateCopy: null,
  });
  assert.equal(draft, null);
});
