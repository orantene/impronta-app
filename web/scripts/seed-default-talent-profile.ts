/**
 * Idempotent publisher for the PLATFORM-DEFAULT talent profile freeform template.
 *
 * Upserts the built-in `buildDefaultTalentProfileTree()` into `builder_templates`
 * under the reserved slug `__platform_default_talent_profile__`
 * (kind=page_template, target_context=talent, status=published). Safe to re-run:
 * re-running updates the existing row's tree + republishes it (bumps version).
 *
 * Once seeded, the lead edits this default in the Builder Lab (no deploy needed).
 *
 * USAGE (from `web/`):
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/seed-default-talent-profile.ts
 * or with an env file:
 *   node --env-file=.env.local --import tsx scripts/seed-default-talent-profile.ts
 *
 * This script ONLY writes the template row. It does NOT enable the feature —
 * the resolver stays gated behind the `DEFAULT_TALENT_FREEFORM_PROFILE` env flag
 * (default OFF). Nothing changes on the live site until BOTH the flag is set AND
 * this template is seeded.
 */
import { createClient } from "@supabase/supabase-js";

import { validateBuilderNodeTree } from "../src/lib/site-admin/builder-node/validate";
import {
  DEFAULT_TALENT_PROFILE_TEMPLATE_SLUG,
  buildDefaultTalentProfileTree,
} from "../src/lib/talent-site/default-talent-tree";

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Build + validate the default tree (drops any prop the schema doesn't allow).
  const rawTree = buildDefaultTalentProfileTree();
  const validation = validateBuilderNodeTree(rawTree);
  const tree = validation.tree;
  if (!validation.ok) {
    // eslint-disable-next-line no-console
    console.warn(
      `Validation flagged ${validation.issues.length} issue(s):`,
      JSON.stringify(validation.issues, null, 2),
    );
  }
  if (tree.length === 0) {
    throw new Error("Default talent tree validated to empty — aborting.");
  }
  // eslint-disable-next-line no-console
  console.log(`Validated default talent tree: ${tree.length} root section(s).`);

  const now = new Date().toISOString();

  const { data: existing, error: selErr } = await supabase
    .from("builder_templates")
    .select("id, version")
    .eq("slug", DEFAULT_TALENT_PROFILE_TEMPLATE_SLUG)
    .maybeSingle();
  if (selErr) throw new Error(`Lookup failed: ${selErr.message}`);

  const basePayload = {
    kind: "page_template" as const,
    status: "published" as const,
    target_context: "talent" as const,
    title: "Platform default — Talent profile",
    slug: DEFAULT_TALENT_PROFILE_TEMPLATE_SLUG,
    description:
      "The premium default freeform layout served for any talent without a published Max site (gated by DEFAULT_TALENT_FREEFORM_PROFILE). Edit here to update the default — no deploy required.",
    category: "Platform",
    gallery_tab: "page_templates" as const,
    required_plan: "free",
    builder_tree: tree as unknown as object,
    published_at: now,
    changelog: "Seed: platform default talent profile.",
  };

  if (existing) {
    const row = existing as { id: string; version: number };
    const { error: updErr } = await supabase
      .from("builder_templates")
      .update({
        ...basePayload,
        version: (row.version ?? 1) + 1,
        updated_at: now,
      })
      .eq("id", row.id);
    if (updErr) throw new Error(`Update failed: ${updErr.message}`);
    // eslint-disable-next-line no-console
    console.log(
      `Updated + republished existing template ${row.id} (version ${(row.version ?? 1) + 1}).`,
    );
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("builder_templates")
      .insert({ ...basePayload, version: 1, schema_version: 1 })
      .select("id")
      .single();
    if (insErr) throw new Error(`Insert failed: ${insErr.message}`);
    // eslint-disable-next-line no-console
    console.log(
      `Inserted + published template ${(inserted as { id: string }).id}.`,
    );
  }

  // eslint-disable-next-line no-console
  console.log("Done. The template is published. The feature stays OFF until");
  // eslint-disable-next-line no-console
  console.log("DEFAULT_TALENT_FREEFORM_PROFILE=1 is set in the environment.");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
