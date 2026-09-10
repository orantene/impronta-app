import "server-only";

/**
 * ProjectsModePage — the server half of the Projects point of sale mode.
 *
 * Rendered by `../page.tsx` once the route has resolved the person's usable
 * modes and picked `projects`. Loads every project through the projects
 * reader (one reader, the same one the workspace's Projects screens use), the
 * open project when `?project=` names one, and hands the client component
 * plain data plus copy in the request's own language.
 */

import type { Translator } from "@/components/admin/pos/translator";
import { collectSheetCopy, refusalCopy, type PosCollectionMethodState } from "@/components/admin/pos";
import { minorUnitDivisor } from "@/lib/orders/money-format";

import { projectsModeCopy } from "./projects-copy";
import { ProjectsModeClient, type ProjectsModeDetail, type ProjectsModeView } from "./projects-mode-client";
import { loadProjectForMode, loadProjectsForMode } from "./projects-mode-loader";
import { projectsModeRow, type ProjectsModeRow } from "./projects-mode-model";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asView(raw: unknown): ProjectsModeView {
  return raw === "projects" || raw === "receipts" ? raw : "collect";
}

export async function ProjectsModePage(props: {
  tenantId: string;
  workspaceName: string;
  posPath: string;
  workspacePath: string;
  receiptOrigin: string;
  methods: PosCollectionMethodState[];
  tr: Translator;
  search: { project?: string; view?: string };
}) {
  const projectParam = typeof props.search.project === "string" ? props.search.project : null;

  const [list, detail] = await Promise.all([
    loadProjectsForMode(props.tenantId),
    projectParam
      ? UUID.test(projectParam)
        ? loadProjectForMode(props.tenantId, projectParam)
        : Promise.resolve<ProjectsModeDetail>({ ok: false, reason: "invalid" })
      : Promise.resolve<ProjectsModeDetail | null>(null),
  ]);

  const rows: ProjectsModeRow[] = list.ok ? list.projects.map(projectsModeRow) : [];
  const currency = detail?.ok ? detail.project.currency : rows[0]?.currency ?? "USD";

  return (
    <ProjectsModeClient
      workspaceName={props.workspaceName}
      posPath={props.posPath}
      workspacePath={props.workspacePath}
      receiptOrigin={props.receiptOrigin}
      initialView={asView(props.search.view)}
      list={list.ok ? { ok: true, rows } : { ok: false }}
      detail={detail}
      minorUnitDivisor={minorUnitDivisor(currency)}
      methods={props.methods}
      copy={{
        mode: projectsModeCopy(props.tr),
        collectSheet: collectSheetCopy(props.tr),
        refusal: refusalCopy(props.tr),
      }}
    />
  );
}
