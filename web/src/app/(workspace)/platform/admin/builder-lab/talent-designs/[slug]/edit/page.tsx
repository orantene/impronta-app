/**
 * Platform HQ · Builder Lab · Talent design editor.
 * /platform/admin/builder-lab/talent-designs/[slug]/edit?tree=home|shell&subject=&look=&lang=
 *
 * TALENT-ONLY (surface "theme_template"): opens a talent DESIGN draft in the
 * real page builder. Linked only from the Talent Template Factory tab. Admin
 * gated by the (workspace)/platform/admin layout AND re-checked here, plus the
 * THEME_TEMPLATE_EDITOR_ENABLED flag (default ON; set "0" to disable).
 * Renders inside the ?iframe=1 device frames too (BuilderEditorMount handles it).
 */
import { notFound } from "next/navigation";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { buildInEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { findDemo, demosFor } from "@/lib/talent-site/demos/registry";
import type { DemoDesign } from "@/lib/talent-site/demos/types";
import { openThemeDraft } from "@/lib/talent-site/theme-template/drafts.server";
import { THEME_TEMPLATE_EDITOR_FLAG, type ThemeDraftTree } from "@/lib/talent-site/theme-template/types";
import { ThemeTemplateEditorMount } from "@/components/builder-lab/talent-factory/theme-template-editor-mount";
import { EDITOR_COPY, type EditorLang } from "@/components/builder-lab/talent-factory/theme-template-editor-copy";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function TalentDesignEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getCachedActorSession();
  if (!isPlatformAdmin(session.profile)) notFound();
  if (process.env[THEME_TEMPLATE_EDITOR_FLAG] === "0") notFound();

  const { slug } = await params;
  const sp = await searchParams;
  const lang: EditorLang = first(sp.lang) === "es" ? "es" : "en";
  const t = EDITOR_COPY[lang];
  const tree: ThemeDraftTree = first(sp.tree) === "shell" ? "shell" : "home";
  const look = first(sp.look) || undefined;

  const admin = createServiceRoleClient();
  if (!admin) notFound();

  const draft = await openThemeDraft(admin, slug, session.user?.id ?? null);
  if (!draft.ok) {
    return (
      <div className="mx-auto max-w-[900px] px-6 py-8 text-white" data-theme-template-error>
        <h1 className="text-xl font-semibold">{t.pageTitle}</h1>
        <p className="mt-2 text-sm text-white/70">{t.draftUnavailable(draft.error)}</p>
      </div>
    );
  }

  // Hub tenant = the platform's own workspace (builder credentials / asset scope).
  const { data: hub } = await admin
    .from("agencies")
    .select("id")
    .eq("kind", "hub")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const tenantId = (hub?.id as string | undefined) ?? null;
  if (!tenantId) notFound();

  // Preview subject: ?subject=, else this design's reference demo.
  const referenceCode = demosFor(slug as DemoDesign).find((d) => d.reference)?.profileCode ?? null;
  const requested = first(sp.subject);
  const subjectCode = requested && findDemo(requested) ? requested : referenceCode;
  let subjectId: string | null = null;
  let subjectLabel: string | null = null;
  if (subjectCode) {
    const { data: profile } = await admin
      .from("talent_profiles")
      .select("id, display_name")
      .eq("profile_code", subjectCode)
      .maybeSingle();
    if (profile) {
      subjectId = profile.id as string;
      subjectLabel = (profile.display_name as string | null)?.trim() || subjectCode;
    }
  }

  const nodes = (tree === "shell" ? draft.value.payload.shellTree : draft.value.payload.homeTree) ?? [];
  const canvas = await buildInEditorCanvasRenderData({
    tree: nodes as BuilderNodeTree,
    tenantId,
    locale: lang,
    previewSubject: subjectId ? { kind: "talent", id: subjectId, locale: lang } : null,
  });

  return (
    <div
      data-talent-design-editor
      style={{ position: "fixed", inset: 0, zIndex: 50, overflow: "auto", outline: "none" }}
      className="bg-neutral-200"
    >
      <ThemeTemplateEditorMount
        design={slug}
        tree={tree}
        tenantId={tenantId}
        lang={lang}
        subjectCode={subjectCode}
        subjectLabel={subjectLabel}
        look={look}
        canvasRenderData={{ ...canvas, designSlug: slug }}
      />
    </div>
  );
}
