import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";

/** Minimal props — nested layout lives on persisted builder nodes. */
export const blankSectionSchemaV1 = z.object({
  presentation: sectionPresentationSchema.optional(),
});

export type BlankSectionV1 = z.infer<typeof blankSectionSchemaV1>;

export const blankSectionSchemasByVersion = { 1: blankSectionSchemaV1 } as const;
