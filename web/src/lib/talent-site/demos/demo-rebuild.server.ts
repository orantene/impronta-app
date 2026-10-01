// PLACEHOLDER: replaced by A1 at integration
import "server-only";

import type { createServiceRoleClient } from "@/lib/supabase/admin";

import type { DemoRebuildRequest, DemoRebuildResult } from "./types";

type Admin = NonNullable<ReturnType<typeof createServiceRoleClient>>;

export async function rebuildDemos(
  _admin: Admin,
  _req: DemoRebuildRequest,
  _actorId: string | null,
): Promise<DemoRebuildResult> {
  throw new Error("not implemented");
}

export async function restoreDemoRun(
  _admin: Admin,
  _runId: string,
): Promise<{ ok: boolean; error?: string }> {
  throw new Error("not implemented");
}
