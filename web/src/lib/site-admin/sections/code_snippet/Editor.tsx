"use client";
import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { codeSnippetSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { CodeSnippetV1 } from "./schema";

export function CodeSnippetEditor({ initial, onChange, tenantId }: SectionEditorProps<CodeSnippetV1>) {
  const value: CodeSnippetV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    filename: initial.filename ?? "example.ts",
    language: initial.language ?? "typescript",
    code: initial.code ?? "// Paste your code here\nconst hello = 'world';\nconsole.log(hello);",
    showLineNumbers: initial.showLineNumbers ?? false,
    showCopyButton: initial.showCopyButton ?? true,
    variant: initial.variant ?? "dark",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm schema={codeSnippetSchemaV1} value={value} onChange={(next) => onChange({ ...value, ...(next as Partial<CodeSnippetV1>) })} tenantId={tenantId} sectionTypeKey="code_snippet" excludeKeys={["presentation"]} />
      <PresentationPanel value={value.presentation} onChange={(next) => onChange({ ...value, presentation: next })} />
    </div>
  );
}
