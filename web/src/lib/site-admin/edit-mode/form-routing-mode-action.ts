"use server";

/**
 * Set a contact_form section's `routingMode` from the freeform form node's
 * inspector (inquiry email loop, 2026-08-20).
 *
 * THE GAP THIS CLOSES: `routingMode` decides whether a submission becomes a
 * real inquiry (the engine path — guest client provisioned by email, the
 * conversation the reply-mirror email later attaches to) or an inbox row. The
 * picker in `listInboxFormSectionsAction` DISPLAYS the mode, and the submit
 * route ENFORCES it, but nothing in the product could ever SET it — flipping a
 * form to inquiry mode required an engineer with DB access. This action is the
 * missing writer.
 *
 * Routes through the section's own validated save path (`upsertSection` →
 * registry schema re-validation → revision row → audit event), never a raw
 * props write, then re-publishes when the section was already live so the
 * public form actually picks the change up (the storefront reads the
 * published side).
 */

import { requireSession } from "@/lib/server/action-guards";
import { requireEditSurfaceTenantScope } from "@/lib/saas";
import { logServerError } from "@/lib/server/safe-error";
import { publishSection, upsertSection } from "@/lib/site-admin/server/sections";

export type SetFormRoutingModeResult =
  | { ok: true; routingMode: "internal" | "inquiry"; published: boolean }
  | { ok: false; error: string };

export async function setInboxFormRoutingModeAction(
  sectionId: string,
  routingMode: "internal" | "inquiry",
): Promise<SetFormRoutingModeResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  try {
    const { data: row, error } = await auth.supabase
      .from("cms_sections")
      .select("id, name, section_type_key, schema_version, version, props_jsonb, status")
      .eq("id", sectionId)
      .eq("tenant_id", scope.tenantId)
      .eq("section_type_key", "contact_form")
      .maybeSingle();
    if (error) {
      logServerError("edit-mode/set-form-routing-mode/load", error);
      return { ok: false, error: "Could not load this form." };
    }
    if (!row) return { ok: false, error: "Form not found in this workspace." };

    const section = row as {
      id: string;
      name: string;
      schema_version: number;
      version: number;
      props_jsonb: Record<string, unknown> | null;
      status: string;
    };

    const nextProps = {
      ...(section.props_jsonb ?? {}),
      routingMode,
    };

    const saved = await upsertSection(auth.supabase, {
      tenantId: scope.tenantId,
      values: {
        id: section.id,
        tenantId: scope.tenantId,
        sectionTypeKey: "contact_form",
        schemaVersion: section.schema_version,
        name: section.name,
        props: nextProps,
        expectedVersion: section.version,
      },
      actorProfileId: auth.user.id,
    });
    if (!saved.ok) {
      return {
        ok: false,
        error:
          saved.code === "VERSION_CONFLICT"
            ? "Someone else just changed this form. Reopen it and try again."
            : (saved.message ?? "Could not save the destination."),
      };
    }

    // A live form must re-publish or the public page keeps the old routing —
    // the storefront reads the published side, not the draft.
    let published = false;
    if (section.status === "published") {
      const pub = await publishSection(auth.supabase, {
        tenantId: scope.tenantId,
        values: {
          id: section.id,
          tenantId: scope.tenantId,
          expectedVersion: saved.data.version,
        },
        actorProfileId: auth.user.id,
      });
      if (!pub.ok) {
        return {
          ok: false,
          error:
            "Saved the change, but publishing it failed — the live form still uses the old destination.",
        };
      }
      published = true;
    }

    return { ok: true, routingMode, published };
  } catch (error) {
    logServerError("edit-mode/set-form-routing-mode", error);
    return { ok: false, error: "Could not save the destination." };
  }
}
