"use server";

/**
 * admin-platform-default-templates.ts — super-admin actions for the Builder Lab
 * → Default surfaces tab.
 *
 * A super-admin can point the platform DEFAULT storefront / DEFAULT talent
 * profile at any PUBLISHED template (without re-seeding the reserved slug) and
 * toggle the talent freeform default — all without a deploy. The render path
 * reads these pointers on every unconfigured homepage + every fallback talent,
 * so the read side (in `@/lib/platform/default-templates`) is fallback-safe.
 *
 * Pattern mirrors admin-platform-default-theme.ts: platform-admin gated,
 * `{ ok, error }` results. The DB read/write live in the server-only lib so this
 * action file stays free of a raw untenanted `.from(...)` (the no-untenanted-from
 * ratchet). Published-template options come from the existing registry action.
 */

import { revalidatePath } from "next/cache";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { CLIENT_ERROR } from "@/lib/server/safe-error";
import {
  loadPlatformDefaultTemplatePointers,
  writePlatformDefaultTemplatePointer,
  writePlatformDefaultTalentFreeformEnabled,
  type PlatformDefaultTemplatePointers,
  type PlatformTemplateSurface,
} from "@/lib/platform/default-templates";
import { listPublishedTemplates } from "@/lib/site-admin/builder-core/templates/registry-actions";
import {
  revalidateTargetsForPointerWrite,
  type LabRevalidateTarget,
} from "@/lib/site-admin/builder-core/templates/lab-cache-paths";
import type { BuilderTemplateTarget } from "@/lib/site-admin/builder-core/templates/registry-rows";

/** A lightweight published-template option for the Default-surfaces select. */
export interface DefaultSurfaceTemplateOption {
  id: string;
  title: string;
  slug: string;
  targetContext: BuilderTemplateTarget;
}

async function requireSuperAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false, error: "Platform admin access required." };
  }
  return { ok: true, userId: session.user.id };
}

/**
 * Cache paths a DEFAULT-pointer write invalidates.
 *
 * Every OTHER template-affecting write in the Lab (`publishTemplate`,
 * `unpublishTemplate`, `archiveTemplate`, the rollout ramp, the shell apply)
 * calls `revalidatePath("/platform/admin")`. The pointer write called nothing at
 * all, which made it the one write in the Lab that could change what the public
 * renders while leaving both the admin tree and the public surface untouched.
 *
 * The path list itself now lives in `lab-cache-paths.ts` — a plain module both
 * this file and `registry-actions.ts` read, so the two writers cannot drift
 * apart again (they already had: the segment TYPE was wrong on the publish side
 * and the pointer side had no call at all). See that file for why
 * `/platform/admin` is revalidated as a LAYOUT and why the public path is
 * per-surface rather than blanket.
 */
function applyRevalidation(targets: ReadonlyArray<LabRevalidateTarget>): void {
  for (const target of targets) {
    if (target.type) revalidatePath(target.path, target.type);
    else revalidatePath(target.path);
  }
}

/** Map a DEFAULT surface to the template target_context filter it offers. */
function targetForSurface(
  surface: PlatformTemplateSurface,
): BuilderTemplateTarget {
  return surface === "talent" ? "talent" : "workspace";
}

/**
 * Load the current pointers + the published `page_template` options for a
 * surface. Gated to super-admins. The options list never throws (the registry
 * action returns a discriminated result); on a list failure we return the
 * pointers with an empty option set so the panel still renders + can clear.
 */
export async function loadPlatformDefaultTemplatesAction(
  surface: PlatformTemplateSurface = "storefront",
): Promise<
  | {
      ok: true;
      pointers: PlatformDefaultTemplatePointers;
      options: DefaultSurfaceTemplateOption[];
    }
  | { ok: false; error: string }
> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const pointers = await loadPlatformDefaultTemplatePointers();

  const listed = await listPublishedTemplates({
    targetContext: targetForSurface(surface),
    galleryTab: "page_templates",
  });
  const options: DefaultSurfaceTemplateOption[] = listed.ok
    ? listed.data.map((t) => ({
        id: t.id,
        title: t.title,
        slug: t.slug,
        targetContext: t.target_context,
      }))
    : [];

  return { ok: true, pointers, options };
}

/**
 * Save (or clear, when `templateId` is null) the DEFAULT template pointer for a
 * surface. Super-admin gated. The render fallback chain (pointer → reserved slug
 * → built-in) means clearing the pointer restores the reserved-slug default.
 */
export async function savePlatformDefaultTemplatePointerAction(input: {
  surface: PlatformTemplateSurface;
  templateId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const result = await writePlatformDefaultTemplatePointer(
    input.surface,
    gate.userId,
    input.templateId,
  );
  if (!result.ok) return { ok: false, error: CLIENT_ERROR.update };

  applyRevalidation(revalidateTargetsForPointerWrite(input.surface));

  return { ok: true };
}

/**
 * Toggle the talent freeform default (Builder Lab → Default surfaces). When ON,
 * talents with no published Max site render the freeform default. OR-ed with the
 * legacy env flag at render time. Super-admin gated.
 */
export async function savePlatformDefaultTalentFreeformAction(input: {
  enabled: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const result = await writePlatformDefaultTalentFreeformEnabled(
    gate.userId,
    input.enabled,
  );
  if (!result.ok) return { ok: false, error: CLIENT_ERROR.update };

  // Same class of write: it changes what an anonymous visitor sees on the
  // fallback talent profile, so it invalidates the same two paths the talent
  // pointer does.
  applyRevalidation(revalidateTargetsForPointerWrite("talent"));

  return { ok: true };
}
