#!/usr/bin/env node
/**
 * Phase 3 — section scaffolder.
 *
 * Usage:
 *   pnpm new:section <snake_case_name> [--label "Friendly Label"] [--purpose feature]
 *
 * Creates the standard 5-file section module + reminders to register
 * the new entry in registry.ts, registry-editors.ts,
 * default-content.ts, heading-hierarchy.ts, and ai-rewrite-action.ts.
 *
 * The scaffolder uses the `<ZodSchemaForm>` auto-binder so the new
 * Editor.tsx is ~30 lines instead of ~150. Operator fills in the
 * schema and the inspector renders itself.
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: pnpm new:section <snake_case_name> [--label \"Label\"] [--purpose hero|trust|feature|conversion]");
  process.exit(1);
}

const name = args[0];
if (!/^[a-z][a-z0-9_]*$/.test(name)) {
  console.error(`Invalid section name "${name}". Use snake_case (e.g. video_reel).`);
  process.exit(1);
}
const labelIdx = args.indexOf("--label");
const purposeIdx = args.indexOf("--purpose");
const label = labelIdx >= 0 ? args[labelIdx + 1] : toTitle(name);
const purpose = purposeIdx >= 0 ? args[purposeIdx + 1] : "feature";

function toTitle(s) {
  return s.replace(/_/g, " ").replace(/\b./g, (c) => c.toUpperCase());
}
function toCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function toPascal(s) {
  const c = toCamel(s);
  return c[0].toUpperCase() + c.slice(1);
}

const dir = resolve(process.cwd(), "src/lib/site-admin/sections", name);
if (existsSync(dir)) {
  console.error(`Section "${name}" already exists at ${dir}`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });

const camel = toCamel(name);
const pascal = toPascal(name);

writeFileSync(
  join(dir, "meta.ts"),
  `import type { SectionMeta } from "../types";
export const ${camel}Meta: SectionMeta = {
  key: "${name}",
  label: "${label}",
  description: "TODO: describe what this section does and when to use it.",
  businessPurpose: "${purpose}",
  visibleToAgency: true,
};
`,
);

writeFileSync(
  join(dir, "schema.ts"),
  `import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

export const ${camel}SchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  // TODO: add fields here
  presentation: sectionPresentationSchema,
});

export type ${pascal}V1 = z.infer<typeof ${camel}SchemaV1>;
export const ${camel}SchemasByVersion = { 1: ${camel}SchemaV1 } as const;
`,
);

writeFileSync(
  join(dir, "migrations.ts"),
  `export const ${camel}Migrations: Record<number, (old: unknown) => unknown> = {};
`,
);

writeFileSync(
  join(dir, "Component.tsx"),
  `import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, SectionHead, Stack } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { ${pascal}V1 } from "./schema";

export function ${pascal}Component({ props }: SectionComponentProps<${pascal}V1>) {
  const { eyebrow, headline, presentation } = props;
  return (
    <section
      className="site-${name.replace(/_/g, "-")}"
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <Container>
        <Stack gap="airy">
          <SectionHead eyebrow={eyebrow} headline={headline} />
          {/* TODO: render the section body */}
        </Stack>
      </Container>
    </section>
  );
}
`,
);

writeFileSync(
  join(dir, "Editor.tsx"),
  `"use client";
import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { ${camel}SchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { ${pascal}V1 } from "./schema";

export function ${pascal}Editor({ initial, onChange, tenantId }: SectionEditorProps<${pascal}V1>) {
  const value: ${pascal}V1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={${camel}SchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<${pascal}V1>) })}
        tenantId={tenantId}
        sectionTypeKey="${name}"
        excludeKeys={["presentation"]}
      />
      <PresentationPanel value={value.presentation} onChange={(next) => onChange({ ...value, presentation: next })} />
    </div>
  );
}
`,
);

console.log(`✓ Scaffolded section "${name}" at src/lib/site-admin/sections/${name}/`);
console.log("\nNext steps:");
console.log(`  1. Add fields to schema.ts`);
console.log(`  2. Render them in Component.tsx`);
console.log(`  3. Register in src/lib/site-admin/sections/registry.ts (entry + SECTION_REGISTRY map)`);
console.log(`  4. Register in src/lib/site-admin/sections/registry-editors.ts (entry + map)`);
console.log(`  5. Add defaults in src/lib/site-admin/sections/shared/default-content.ts`);
console.log(`  6. Map in src/lib/site-admin/a11y/heading-hierarchy.ts (HEADING_MAP)`);
console.log(`  7. Map in src/lib/site-admin/edit-mode/ai-rewrite-action.ts (REWRITABLE_FIELDS)`);
console.log(`  8. Map in src/lib/site-admin/edit-mode/heading-lint-action.ts (HEADLINE_PROP_BY_TYPE)`);
console.log(`  9. Add CSS in src/app/token-presets.css`);
console.log(`\nPreview: visit http://localhost:3000/dev/section-sandbox/${name}`);
