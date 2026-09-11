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
import type { PosCollectionMethodState } from "@/components/admin/pos";
// `pos-copy`, not the barrel — see the same note in `../page.tsx`.
import { chromeCopy, collectSheetCopy, issuesCopy, refusalCopy } from "@/components/admin/pos/pos-copy";
import { engineRefusalCopy, paymentLinkCopy } from "@/components/admin/pos/pos-copy-engine";
import { minorUnitDivisor } from "@/lib/orders/money-format";
import { listWorkspacePaymentLinks } from "@/lib/payments/links-board";
import { isStripeConfigured } from "@/lib/stripe/client";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { formatClock } from "../counter-model";

import { projectsModeCopy } from "./projects-copy";
import { ProjectsModeClient } from "../mode-clients";
import type { ProjectsModeDetail, ProjectsModeView } from "./projects-mode-client";
import { loadProjectForMode, loadProjectsForMode } from "./projects-mode-loader";
import { projectsModeRow, type ProjectsModeRow } from "./projects-mode-model";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asView(raw: unknown): ProjectsModeView {
  return raw === "projects" || raw === "receipts" || raw === "links" || raw === "issues" ? raw : "collect";
}

export async function ProjectsModePage(props: {
  tenantId: string;
  workspaceName: string;
  posPath: string;
  workspacePath: string;
  receiptOrigin: string;
  methods: PosCollectionMethodState[];
  /** The signed-in person, as the header's cashier chip names them. */
  cashierName: string;
  /** Whether a cash drawer (shift) is open right now, for the footer line. */
  drawerOpen: boolean;
  tr: Translator;
  locale: string;
  search: { project?: string; view?: string };
}) {
  const projectParam = typeof props.search.project === "string" ? props.search.project : null;
  const admin = createServiceRoleClient();

  const [list, detail, links] = await Promise.all([
    loadProjectsForMode(props.tenantId),
    projectParam
      ? UUID.test(projectParam)
        ? loadProjectForMode(props.tenantId, projectParam)
        : Promise.resolve<ProjectsModeDetail>({ ok: false, reason: "invalid" })
      : Promise.resolve<ProjectsModeDetail | null>(null),
    // The Links destination (POSPaymentLink) and each sale's own links.
    admin ? listWorkspacePaymentLinks(admin, { tenantId: props.tenantId }) : Promise.resolve({ ok: false as const, reason: "unavailable" as const }),
  ]);

  const rows: ProjectsModeRow[] = list.ok ? list.projects.map(projectsModeRow) : [];
  const currency = detail?.ok ? detail.project.currency : rows[0]?.currency ?? "USD";

  return (
    <ProjectsModeClient
      workspaceName={props.workspaceName}
      cashierName={props.cashierName}
      drawerOpen={props.drawerOpen}
      posPath={props.posPath}
      workspacePath={props.workspacePath}
      receiptOrigin={props.receiptOrigin}
      initialView={asView(props.search.view)}
      list={list.ok ? { ok: true, rows } : { ok: false }}
      detail={detail}
      minorUnitDivisor={minorUnitDivisor(currency)}
      methods={props.methods}
      links={
        links.ok
          ? links.rows.map((row) => ({
              code: row.code,
              url: `${props.receiptOrigin}/pay/${row.code}`,
              orderId: row.orderId,
              amountCents: row.amountCents,
              currency: row.currency,
              status: row.status,
              sentAt: formatClock(row.createdAt, props.locale),
              expiresAt: formatClock(row.expiresAt, props.locale),
              customerName: row.customerName,
              title: row.title,
              receiptHref: row.receiptCode && props.receiptOrigin ? `${props.receiptOrigin}/r/${row.receiptCode}` : null,
            }))
          : []
      }
      linkProvider={isStripeConfigured() ? "stripe" : "mock"}
      copy={{
        mode: projectsModeCopy(props.tr),
        collectSheet: collectSheetCopy(props.tr),
        refusal: refusalCopy(props.tr),
        chrome: chromeCopy(props.tr),
        issues: issuesCopy(props.tr),
        paymentLink: paymentLinkCopy(props.tr),
        engineRefusal: engineRefusalCopy(props.tr),
      }}
    />
  );
}
