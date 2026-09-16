"use server";

import { revalidatePath } from "next/cache";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { importLook, setLookStatus, syncBuiltinLooks } from "@/lib/site-admin/builder-core/site-templates/site-looks.server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const PATH = "/platform/admin/builder-lab/looks";
type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function gate(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) return { ok: false, error: "Super admin access required." };
  return { ok: true, userId: session.user.id };
}

export async function actionSyncBuiltinLooks(): Promise<Result<{ created: number; updated: number }>> {
  const g = await gate();
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  const res = await syncBuiltinLooks(admin, g.userId);
  if (!res.ok) return res;
  revalidatePath(PATH);
  return { ok: true, data: { created: res.created, updated: res.updated } };
}

/** Import a PortableLook pasted or uploaded as JSON. */
export async function actionImportLook(fd: FormData): Promise<Result<{ slug: string }>> {
  const g = await gate();
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  const file = fd.get("file");
  const text = file instanceof File && file.size > 0 ? await file.text() : String(fd.get("json") ?? "");
  if (!text.trim()) return { ok: false, error: "Paste or choose a .look.json file." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "That is not valid JSON." };
  }
  const res = await importLook(admin, parsed, g.userId);
  if (!res.ok) return { ok: false, error: res.reasons.slice(0, 8).join(" · ") };
  revalidatePath(PATH);
  return { ok: true, data: { slug: res.slug } };
}

export async function actionSetLookStatus(id: string, status: "draft" | "published" | "archived"): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  const res = await setLookStatus(admin, id, status);
  if (!res.ok) return res;
  revalidatePath(PATH);
  return { ok: true, data: null };
}
