import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

export const codeSnippetSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  filename: z.string().max(120).optional(),
  /** Display language hint (purely cosmetic — no syntax highlight). */
  language: z.string().max(40).default("text"),
  code: z.string().min(1).max(20000),
  showLineNumbers: z.boolean().default(false),
  showCopyButton: z.boolean().default(true),
  variant: z.enum(["dark", "light", "minimal"]).default("dark"),
  presentation: sectionPresentationSchema,
});

export type CodeSnippetV1 = z.infer<typeof codeSnippetSchemaV1>;
export const codeSnippetSchemasByVersion = { 1: codeSnippetSchemaV1 } as const;
