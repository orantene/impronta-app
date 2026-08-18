"use server";

/**
 * Inbox destinations for the freeform form node's section picker.
 * Inquiry routing lives on the contact_form section the operator picks —
 * this list surfaces that so they do not paste a raw UUID.
 */

import { requireSession } from "@/lib/server/action-guards";
import { requireEditSurfaceTenantScope } from "@/lib/saas";
import { logServerError } from "@/lib/server/safe-error";

export type InboxFormSectionPick = {
  id: string;
  name: string;
  routingMode: "internal" | "inquiry";
};

export type ListInboxFormSectionsResult =
  | { ok: true; sections: InboxFormSectionPick[] }
  | { ok: false; error: string };

export async function listInboxFormSectionsAction(): Promise<ListInboxFormSectionsResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  try {
    const { data, error } = await auth.supabase
      .from("cms_sections")
      .select("id, name, props_jsonb, status")
      .eq("tenant_id", scope.tenantId)
      .eq("section_type_key", "contact_form")
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(80);

    if (error) {
      logServerError("edit-mode/list-inbox-form-sections", error);
      return { ok: false, error: "Could not load form destinations." };
    }

    const sections: InboxFormSectionPick[] = (data ?? []).map((row) => {
      const props = (row.props_jsonb ?? {}) as { routingMode?: unknown };
      return {
        id: row.id,
        name: row.name?.trim() || "Untitled form",
        routingMode: props.routingMode === "inquiry" ? "inquiry" : "internal",
      };
    });
    return { ok: true, sections };
  } catch (error) {
    logServerError("edit-mode/list-inbox-form-sections", error);
    return { ok: false, error: "Could not load form destinations." };
  }
}
