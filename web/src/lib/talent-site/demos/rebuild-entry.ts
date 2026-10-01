/**
 * Pure decisions for the demo rebuild entry points (API route + admin UI):
 * who may call, and what a request body must look like. No IO here so the
 * decisions are unit-testable.
 */
import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { DemoRebuildRequest, DemoRestoreRequest } from "./types";

export function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type RebuildAuthDecision =
  | { allow: true; via: "bearer" | "admin"; actorId: string | null }
  | { allow: false; status: 401 | 403 | 503; error: string };

/**
 * A bearer token is judged on its own: right CRON_SECRET passes, wrong is 401
 * (a script must never fall back to a browser cookie by accident). With no
 * bearer, a signed-in platform admin passes, a signed-in non-admin is 403,
 * anyone else is 401.
 */
export function decideRebuildAuth(input: {
  secret: string | undefined;
  authorization: string | null;
  userId: string | null;
  isAdmin: boolean;
}): RebuildAuthDecision {
  const token = input.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (token) {
    if (!input.secret) return { allow: false, status: 503, error: "not_configured" };
    return sameSecret(token, input.secret)
      ? { allow: true, via: "bearer", actorId: null }
      : { allow: false, status: 401, error: "unauthorized" };
  }
  if (!input.userId) return { allow: false, status: 401, error: "unauthorized" };
  if (!input.isAdmin) return { allow: false, status: 403, error: "forbidden" };
  return { allow: true, via: "admin", actorId: input.userId };
}

/** Tolerant read of restoreDemoRun's return: only an explicit `ok: false` is a failure. */
export function restoreOutcome(r: unknown): { ok: boolean; error?: string } {
  if (r && typeof r === "object" && "ok" in r && (r as { ok: unknown }).ok === false) {
    const e = (r as { error?: unknown }).error;
    return { ok: false, error: typeof e === "string" ? e : undefined };
  }
  return { ok: true };
}

const CODE =/^TAL-[A-Z0-9]{3,24}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const rebuildSchema = z
  .object({
    design: z.enum(["maison-v2", "folio"]).optional(),
    only: z.array(z.string().regex(CODE)).max(100).optional(),
    dryRun: z.boolean().optional(),
    publish: z.boolean().optional(),
  })
  .strict();

const restoreSchema = z.object({ runId: z.string().regex(UUID) }).strict();

export function parseRebuildBody(raw: unknown): { ok: true; data: DemoRebuildRequest } | { ok: false } {
  const r = rebuildSchema.safeParse(raw ?? {});
  return r.success ? { ok: true, data: r.data } : { ok: false };
}

export function parseRestoreBody(raw: unknown): { ok: true; data: DemoRestoreRequest } | { ok: false } {
  const r = restoreSchema.safeParse(raw);
  return r.success ? { ok: true, data: r.data } : { ok: false };
}
