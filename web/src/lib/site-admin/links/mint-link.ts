import "server-only";

import { z } from "zod";

import { CODE_PATTERN } from "@/lib/links/code";
import { createLink, type LinkSummary } from "@/lib/links/link-store";

/**
 * Mint a readable short link from the builder.
 *
 * Until now nothing in the product called `createLink`: the `qr_code` block's
 * inspector could only PICK an existing link and `public.links` started empty,
 * so nothing could ever be shared for the first time (`docs/plans/qr-links-plan.md`
 * §"the deadlock"). This is the first writer. It is deliberately narrow:
 *
 *   - the code is operator-readable (`CODE_PATTERN`), never opaque: an opaque
 *     code GRANTS (a table's bill, a session) and is minted by the engine that
 *     owns the grant, not by a page editor;
 *   - the target is a PATH on the tenant's own host. A workspace editing its
 *     website must not be able to mint `improntamodels.com/q/x` → another host;
 *     off-site redirects stay with the links surface and its allow-list;
 *   - the tenant comes from the caller's guard, never from the input.
 *
 * `deps` is the injection seam for tests (mock.module is unusable under tsx
 * here, see `copy-published-to-draft.test.ts`); production never passes it.
 */
export const mintLinkInputSchema = z.object({
  code: z.string().trim().toLowerCase().min(1).max(32).regex(CODE_PATTERN, "Use letters, numbers and dashes only."),
  name: z.string().trim().min(1).max(80),
  targetPath: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((p) => p.startsWith("/") && !p.startsWith("//") && !/[\s\\]/.test(p), {
      message: "The destination must be a path on this site, like /lumina.",
    }),
  label: z.string().trim().min(1).max(40).optional(),
});

export type MintLinkInput = z.input<typeof mintLinkInputSchema>;

export type MintLinkResult =
  | { ok: true; link: LinkSummary }
  | { ok: false; error: string };

type Guard = { ok: true; tenantId: string; userId: string | null } | { ok: false; error: string };

export type MintLinkDeps = {
  guard: () => Promise<Guard>;
  createLink: typeof createLink;
};

export async function mintLink(
  input: unknown,
  deps: MintLinkDeps,
): Promise<MintLinkResult> {
  const guard = await deps.guard();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = mintLinkInputSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "Check the link details." };
  }
  const { code, name, targetPath } = parsed.data;
  const label = parsed.data.label ?? targetPath.split("?")[0].split("/").filter(Boolean).pop() ?? "page";

  const created = await deps.createLink({
    tenantId: guard.tenantId,
    code,
    codeMode: "readable",
    name,
    kind: "other",
    targets: [{ when: "always", to: { to: targetPath, label } }],
    createdBy: guard.userId,
  });
  if (!created.ok) return { ok: false, error: created.reason };
  const { id, name: linkName, kind, status } = created.link;
  return { ok: true, link: { id, code: created.link.code, name: linkName, kind, status } };
}
