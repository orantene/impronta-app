"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseWithSchema } from "@/lib/admin/validation";
import { requireStaff } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";

const localeSchema = z.enum(["en", "es"]);
const zoneSchema = z.enum(["header", "footer"]);

const navUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  locale: localeSchema,
  zone: zoneSchema,
  label: z.string().min(1).max(300),
  href: z.string().min(1).max(2000),
  sort_order: z.number().int().min(0).max(9999).optional().default(0),
  visible: z.boolean().optional().default(true),
});

export async function saveCmsNavigationItem(
  input: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = parseWithSchema(navUpsertSchema, input);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const session = await requireStaff();
  if (!session.ok) return { ok: false, error: session.error };

  let href = parsed.data.href.trim();
  if (!href.startsWith("/") && !href.startsWith("http")) {
    href = `/${href}`;
  }

  const row = {
    locale: parsed.data.locale,
    zone: parsed.data.zone,
    label: parsed.data.label.trim(),
    href,
    sort_order: parsed.data.sort_order ?? 0,
    visible: parsed.data.visible ?? true,
  };

  if (parsed.data.id) {
    const { data: updated, error } = await session.supabase
      .from("cms_navigation_items")
      .update(row)
      .eq("id", parsed.data.id)
      .select("id")
      .single();

    if (error || !updated) {
      logServerError("cms/saveNav/update", error);
      return { ok: false, error: "Could not update navigation item." };
    }

    const { error: logErr } = await session.supabase.from("activity_log").insert({
      actor_id: session.user.id,
      entity_type: "cms_navigation_item",
      entity_id: parsed.data.id,
      action: "update",
      metadata: { label: row.label, href: row.href },
    });
    if (logErr) logServerError("cms/saveNav/audit", logErr);

    revalidatePath("/admin/site-settings/content/navigation");
    return { ok: true, id: updated.id };
  }

  const { data: inserted, error: insErr } = await session.supabase
    .from("cms_navigation_items")
    .insert(row)
    .select("id")
    .single();

  if (insErr || !inserted) {
    logServerError("cms/saveNav/insert", insErr);
    return { ok: false, error: "Could not create navigation item." };
  }

  const { error: logErr } = await session.supabase.from("activity_log").insert({
    actor_id: session.user.id,
    entity_type: "cms_navigation_item",
    entity_id: inserted.id,
    action: "create",
    metadata: { label: row.label, href: row.href },
  });
  if (logErr) logServerError("cms/saveNav/audit", logErr);

  revalidatePath("/admin/site-settings/content/navigation");
  return { ok: true, id: inserted.id };
}

export async function deleteCmsNavigationItem(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireStaff();
  if (!session.ok) return { ok: false, error: session.error };

  const { error } = await session.supabase.from("cms_navigation_items").delete().eq("id", id);
  if (error) {
    logServerError("cms/deleteNav", error);
    return { ok: false, error: "Could not delete item." };
  }

  const { error: logErr } = await session.supabase.from("activity_log").insert({
    actor_id: session.user.id,
    entity_type: "cms_navigation_item",
    entity_id: id,
    action: "delete",
    metadata: {},
  });
  if (logErr) logServerError("cms/deleteNav/audit", logErr);

  revalidatePath("/admin/site-settings/content/navigation");
  return { ok: true };
}
