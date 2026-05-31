import { z } from "zod";
import { nodePresentationSchema } from "../shared/node-presentation";
import { sectionPresentationSchema } from "../shared/presentation";

export const joinRegisterSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  copy: z.string().max(400).optional(),
  /**
   * Button label. Falls back to the workspace's configured registration CTA
   * label when left blank, so the block stays in step with the global setting.
   */
  ctaLabel: z.string().max(60).optional(),
  variant: z.enum(["card", "inline", "banner"]).default("card"),
  align: z.enum(["left", "center"]).default("center"),
  /** Phase 4 — BuilderNode child-style overrides. */
  nodePresentation: z
    .object({
      eyebrow: nodePresentationSchema,
      headline: nodePresentationSchema,
      copy: nodePresentationSchema,
      primaryCta: nodePresentationSchema,
    })
    .optional(),
  presentation: sectionPresentationSchema,
});

export type JoinRegisterV1 = z.infer<typeof joinRegisterSchemaV1>;
export const joinRegisterSchemasByVersion = { 1: joinRegisterSchemaV1 } as const;
