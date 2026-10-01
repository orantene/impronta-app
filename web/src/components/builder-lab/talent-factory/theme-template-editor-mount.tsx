"use client";

/**
 * Client mount for the TALENT design editor (theme_template surface). Builds the
 * adapter + config on the client (they carry functions, so they cannot cross the
 * RSC boundary), then mounts the ONE page builder with the "lab" header and a
 * Home / Shell tab switch. Talent-only: the config mirrors the talent page
 * builder, never the agency Studio.
 */

import { SaveAsNewDesignDialog } from "./save-as-new-design-dialog";
import { PublishDesignButton } from "./publish-design-button";
import { ThemeTemplateSubjectPicker } from "@/lib/talent-site/theme-template/subject-picker";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { BuilderEditorMount } from "@/lib/site-admin/builder-core/mount/BuilderEditorMount";
import { buildThemeTemplateBuilderConfig } from "@/lib/site-admin/builder-core/config";
import { createBoundThemeTemplateAdapter } from "@/lib/site-admin/builder-core/adapters/theme-template-adapter";
import type { InEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import { themeTemplateEditHref, type ThemeDraftTree } from "@/lib/talent-site/theme-template/types";

import { EDITOR_COPY, type EditorLang } from "./theme-template-editor-copy";

export interface ThemeTemplateEditorMountProps {
  design: string;
  /** Code design whose demos/palettes this design inherits (== design for code designs). */
  sourceDesign?: string;
  tree: ThemeDraftTree;
  tenantId: string;
  lang: EditorLang;
  subjectCode: string | null;
  subjectLabel: string | null;
  look?: string;
  canvasRenderData: InEditorCanvasRenderData | null;
}

export function ThemeTemplateEditorMount({
  design,
  sourceDesign,
  tree,
  tenantId,
  lang,
  subjectCode,
  subjectLabel,
  look,
  canvasRenderData,
}: ThemeTemplateEditorMountProps) {
  const router = useRouter();
  const t = EDITOR_COPY[lang];
  const surfaceConfig = useMemo(
    () => buildThemeTemplateBuilderConfig(createBoundThemeTemplateAdapter(design, tree)),
    [design, tree],
  );
  const tabHref = (next: ThemeDraftTree) =>
    themeTemplateEditHref(design, {
      tree: next,
      subject: subjectCode ?? undefined,
      look,
      lang,
    });
  const tabClass = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs ${active ? "bg-black/80 text-white" : "bg-black/5 text-black/70"}`;

  const headerActions = (
    <div className="flex flex-wrap items-center gap-3 text-black/80" data-theme-template-header>
      <nav aria-label={t.tabsAria} className="flex items-center gap-1" data-tree-tabs>
        <Link href={tabHref("home")} className={tabClass(tree === "home")} aria-current={tree === "home" ? "page" : undefined}>
          {t.tabHome}
        </Link>
        <Link href={tabHref("shell")} className={tabClass(tree === "shell")} aria-current={tree === "shell" ? "page" : undefined}>
          {t.tabShell}
        </Link>
      </nav>
      <ThemeTemplateSubjectPicker design={sourceDesign ?? design} subject={subjectCode ?? null} look={look ?? null} lang={lang} />
      <SaveAsNewDesignDialog sourceDesign={design} lang={lang} />
      <PublishDesignButton design={design} lang={lang} />
      <Link
        href="/platform/admin/builder-lab/themes"
        className="text-xs text-black/70 underline hover:text-black"
        data-release-manager-link
      >
        {t.releaseManager}
      </Link>
    </div>
  );

  return (
    <div data-testid="theme-template-editor" data-design={design} data-tree={tree}>
      <BuilderEditorMount
        surfaceConfig={surfaceConfig}
        tenantId={tenantId}
        workspacePlan="network"
        locale={lang}
        pageSlug={design}
        canInsertRawHtmlElements={false}
        canvasRenderData={canvasRenderData}
        tenantSiteLabel={
          subjectLabel ? t.previewing(subjectLabel) : t.pageTitle
        }
        headerVariant="lab"
        onExit={() => router.push("/platform/admin/builder-lab")}
        exitLabel={t.exit}
        previewSubjectChip={headerActions}
      />
    </div>
  );
}
