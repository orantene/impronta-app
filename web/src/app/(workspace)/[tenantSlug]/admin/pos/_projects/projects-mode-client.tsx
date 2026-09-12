"use client";

/**
 * ProjectsModeClient — the Collect point of sale mode, wired.
 *
 * A sibling of `PosClient` (the counter): same `PosFrame`, same `PosHeader`,
 * same rail contract (`POS_MODE_META.projects.destinations`), same
 * collection engine behind the one primary action. It draws the boards:
 *
 *   collect  — O07 / POSOffice: find a project, see what is due, collect
 *              it through the counter's `CollectSheet` (`collect-screen`).
 *   projects — O03 / O06: every project with its next action; the journey
 *              and the amendment when one is open (`projects-screen`).
 *   links    — POSPaymentLink: not wired, one sentence (`links-screen`).
 *   receipts — a receipt by its public code (`projects-mode-screens`).
 *   issues   — the counter's own frame, not wired (D-POS-28).
 *
 * WHICH PROJECT IS OPEN LIVES IN THE URL (`?project=<id>`), not in state: the
 * server loads that project through the reader on every render, so the
 * balance after a collection is the reader's own figure, never a number this
 * file subtracted. `router.refresh()` after a write is the whole
 * synchronisation. NO `useEffect`, for the reason `pos-client.tsx` gives.
 *
 * REFUSALS ARE DATA. The engine's come back as reason words and go through
 * `refusalFromResult` into the counter's banner; the mode's own (an agreement
 * or a deliverable waiting on the client, a balance that moved) have their
 * own sentences in `projects-copy.ts`. Nothing prints a reason word.
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { POS_MESSAGES_DESTINATION, posMessagesHref } from "@/lib/pos/modes";

import {
  CollectSheet,
  IssuesScreen,
  PosFrame,
  PosHeader,
  PosRefusalBanner,
  type CollectSheetCopy,
  type IssuesCopy,
  type PosChromeCopy,
  type PosCollectionMethodId,
  type PosCollectionMethodState,
  type PosRefusalCopy,
  type PosRefusalReason,
} from "@/components/admin/pos";
import { initialsOf } from "@/components/admin/pos/CustomerSheet";
import { POS_INPUT, POS_REFUSAL_BANNER, POS_SECONDARY_ACTION, POS_SEGMENT, POS_SEGMENT_ACTIVE, POS_SEGMENT_IDLE, POS_SEGMENT_TRACK } from "@/components/admin/pos/pos-classes";
import { interpolate } from "@/i18n/interpolate";
import { cn } from "@/lib/utils";
import { refusalFromResult } from "@/lib/pos/refusal-reason";
import type { ProjectRecord } from "@/lib/projects/project-record";

import { posCollectionKey, tenderAfterKey } from "../counter-model";
import { CollectDetail, CollectList, EmptyDetail } from "./collect-screen";
import { LinksScreen, type LinksScreenRow } from "./links-screen";
import { ProjectsLinkPanel } from "./projects-link-panel";
import { projectsCollect, projectsFindReceipt, type ProjectsReceiptResult } from "./projects-actions";
import type { ProjectsModeCopy, ProjectsModeRefusal } from "./projects-copy";
import { CollectedPanel, ReceiptsScreen, type Collected } from "./projects-mode-screens";
import type { PaymentLinkCopy } from "@/components/admin/pos/PaymentLinkPanel";

import type { ProjectClientContact, ProjectOrderFacts } from "./projects-mode-loader";
import { collectAmount, collectVerdict, findProjects, type CollectSegment, type ProjectsModeRow } from "./projects-mode-model";
import { ProjectDetail, ProjectsList } from "./projects-screen";

export type ProjectsModeDetail =
  | {
      readonly ok: true;
      readonly project: ProjectRecord;
      readonly orders: ProjectOrderFacts[];
      readonly contact: ProjectClientContact | null;
    }
  | { readonly ok: false; readonly reason: "unavailable" | "not_found" | "invalid" };

export type ProjectsModeView = "collect" | "projects" | "links" | "receipts" | "issues";

export type ProjectsModeClientProps = {
  readonly workspaceName: string;
  /** The Messages inbox's unread count: the rail's `messages` badge (seam 10). */
  readonly messagesUnread?: number;
  readonly locationName?: string;
  readonly cashierName: string;
  readonly drawerOpen: boolean;
  readonly posPath: string;
  readonly workspacePath: string;
  readonly receiptOrigin: string;
  readonly initialView: ProjectsModeView;
  readonly list: { readonly ok: true; readonly rows: ProjectsModeRow[] } | { readonly ok: false };
  readonly detail: ProjectsModeDetail | null;
  readonly minorUnitDivisor: number;
  readonly methods: PosCollectionMethodState[];
  /** The Links destination's rows (`listWorkspacePaymentLinks`), newest first. */
  readonly links: readonly LinksScreenRow[];
  /** What `/pay/<code>` does on this workspace. */
  readonly linkProvider: "stripe" | "mock";
  readonly copy: {
    readonly mode: ProjectsModeCopy;
    readonly collectSheet: CollectSheetCopy;
    readonly refusal: PosRefusalCopy;
    readonly chrome: PosChromeCopy;
    readonly issues: IssuesCopy;
    readonly paymentLink: PaymentLinkCopy;
    readonly engineRefusal: Readonly<Record<string, string>>;
  };
};

type Refusal =
  | { kind: "engine"; reason: PosRefusalReason }
  | { kind: "mode"; reason: ProjectsModeRefusal };

const VIEWS: readonly ProjectsModeView[] = ["collect", "projects", "links", "receipts", "issues"];

function isProjectsModeView(id: string): id is ProjectsModeView {
  return (VIEWS as readonly string[]).includes(id);
}

export function ProjectsModeClient(props: ProjectsModeClientProps) {
  const router = useRouter();
  const { copy } = props;
  const mode = copy.mode;
  const b = mode.board;

  const [view, setView] = useState<ProjectsModeView>(props.initialView);
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<CollectSegment>("due_now");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  const [collectOpen, setCollectOpen] = useState(false);
  const [amountMode, setAmountMode] = useState<"balance" | "deposit">("balance");
  const [depositText, setDepositText] = useState("");
  const [method, setMethod] = useState<PosCollectionMethodId>("cash");
  const [tenderedCents, setTenderedCents] = useState(0);
  const [tenderTouched, setTenderTouched] = useState(false);
  const [email, setEmail] = useState(props.detail?.ok ? props.detail.contact?.email ?? "" : "");
  const [phone, setPhone] = useState(props.detail?.ok ? props.detail.contact?.phone ?? "" : "");
  const [collected, setCollected] = useState<Collected | null>(null);

  const [receiptCode, setReceiptCode] = useState("");
  const [receipt, setReceipt] = useState<ProjectsReceiptResult | null>(null);

  const href = useCallback(
    (params: { view?: ProjectsModeView; project?: string | null }) => {
      const q = new URLSearchParams({ mode: "projects" });
      if (params.view) q.set("view", params.view);
      if (params.project) q.set("project", params.project);
      return `${props.posPath}?${q.toString()}`;
    },
    [props.posPath],
  );

  const openProject = useCallback(
    (projectId: string, nextView: ProjectsModeView) => {
      setCollected(null);
      setCollectOpen(false);
      setRefusal(null);
      setView(nextView);
      router.push(href({ view: nextView, project: projectId }));
    },
    [href, router],
  );

  const closeProject = useCallback(() => {
    setCollected(null);
    setCollectOpen(false);
    setRefusal(null);
    router.push(href({ view }));
  }, [href, router, view]);

  const detail = props.detail;
  const project = detail?.ok ? detail.project : null;
  const verdict = project ? collectVerdict(project) : null;
  const currency = project?.currency ?? "USD";
  const orderFacts = useMemo(() => (detail?.ok ? detail.orders : []), [detail]);

  const amountVerdict =
    verdict?.ok
      ? collectAmount({ outstandingCents: verdict.outstandingCents, mode: amountMode, depositText, minorUnitDivisor: props.minorUnitDivisor })
      : null;
  const amountDueCents = amountVerdict?.ok ? amountVerdict.amount.cents : 0;

  /**
   * THE CHARGE, through the same engine as the counter's.
   *
   * The key is derived from the order, its version, the tender and the amount
   * (`posCollectionKey`), so two taps on an unchanged balance are ONE claim.
   * `expectedVersion` is the version this screen loaded, so a second tablet
   * that collected since is refused as a conflict, never paid twice.
   */
  const collect = useCallback(
    async (tender: "cash" | "online_card") => {
      if (!project || !verdict?.ok || !amountVerdict?.ok) return;
      const facts = orderFacts.find((o) => o.orderId === verdict.orderId) ?? null;
      if (!facts) {
        setRefusal({ kind: "mode", reason: "order_changed" });
        return;
      }
      const amountCents = amountVerdict.amount.cents;
      const tendered = tenderTouched ? Math.max(tenderedCents, amountCents) : amountCents;
      setBusy(true);
      setRefusal(null);
      try {
        const result = await projectsCollect({
          projectId: project.id,
          orderId: verdict.orderId,
          method: tender,
          amountCents,
          tenderedCents: tender === "cash" ? tendered : undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          displayName: project.clientName ?? undefined,
          idempotencyKey: posCollectionKey({ orderId: verdict.orderId, version: facts.version, method: tender, amountCents }),
          expectedVersion: facts.version,
        });
        if (!result.ok) {
          if (result.kind === "mode") {
            setRefusal({ kind: "mode", reason: result.reason });
          } else if (result.kind === "engine") {
            setRefusal({ kind: "engine", reason: refusalFromResult({ ok: false, reason: result.reason }, "sale") ?? "paymentUnknown" });
          } else {
            setRefusal({ kind: "engine", reason: refusalFromResult({ ok: false, error: result.error }, "action") ?? "paymentUnknown" });
          }
          return;
        }
        if (result.method === "online_card") {
          window.location.href = result.checkoutUrl;
          return;
        }
        setCollected({
          amountCents: result.amountCents,
          changeCents: result.changeCents,
          outstandingAfterCents: result.outstandingAfterCents,
          receiptCode: result.receiptCode,
          currency,
        });
        setCollectOpen(false);
        setTenderedCents(0);
        // The balance after is read back through the reader, not subtracted.
        router.refresh();
      } finally {
        setBusy(false);
      }
    },
    [amountVerdict, currency, email, orderFacts, phone, project, router, tenderTouched, tenderedCents, verdict],
  );

  const findReceipt = useCallback(async () => {
    setBusy(true);
    try {
      setReceipt(await projectsFindReceipt(receiptCode));
    } finally {
      setBusy(false);
    }
  }, [receiptCode]);

  const receiptHrefFor = (code: string | null) => (code && props.receiptOrigin ? `${props.receiptOrigin}/r/${code}` : null);

  // ── Pieces ─────────────────────────────────────────────────────────

  const refusalBanner = refusal ? (
    refusal.kind === "engine" ? (
      <PosRefusalBanner reason={refusal.reason} copy={copy.refusal} onRetry={() => { setRefusal(null); router.refresh(); }} />
    ) : (
      <div role="alert" data-pos-projects-refusal={refusal.reason} className={POS_REFUSAL_BANNER}>
        <p className="m-0 flex-1">{mode.refusal[refusal.reason]}</p>
        <button type="button" onClick={() => { setRefusal(null); router.refresh(); }} className={`${POS_SECONDARY_ACTION} h-9 shrink-0 px-3 text-xs`}>
          {mode.refusal.reload}
        </button>
      </div>
    )
  ) : null;

  const rows = props.list.ok ? findProjects(props.list.rows, query) : [];

  const contactFields = (
    <div className="flex flex-col gap-2 rounded-[14px] border-[1.5px] border-admin-border bg-admin-card p-4">
      <p className="m-0 text-[13px] text-admin-ink-muted">{mode.contact.hint}</p>
      <label className="text-[14px] font-semibold text-admin-ink" htmlFor="pos-projects-email">{mode.contact.email}</label>
      <input id="pos-projects-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={POS_INPUT} />
      <label className="text-[14px] font-semibold text-admin-ink" htmlFor="pos-projects-phone">{mode.contact.phone}</label>
      <input id="pos-projects-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className={POS_INPUT} />
    </div>
  );

  /** The collect sheet over the open project: amount, then the counter's tender screen. */
  const collectPanel =
    project && verdict?.ok ? (
      <div className="flex flex-col gap-3.5" data-pos-projects-collect>
        <div className="flex flex-wrap items-center gap-3">
          <div className={POS_SEGMENT_TRACK} role="group" aria-label={mode.collect.title}>
            <button type="button" aria-pressed={amountMode === "balance"} className={cn(POS_SEGMENT, "h-11 px-4 text-[15px]", amountMode === "balance" ? POS_SEGMENT_ACTIVE : POS_SEGMENT_IDLE)} onClick={() => setAmountMode("balance")}>
              {mode.collect.whole}
            </button>
            <button type="button" aria-pressed={amountMode === "deposit"} className={cn(POS_SEGMENT, "h-11 px-4 text-[15px]", amountMode === "deposit" ? POS_SEGMENT_ACTIVE : POS_SEGMENT_IDLE)} onClick={() => setAmountMode("deposit")}>
              {mode.collect.deposit}
            </button>
          </div>
          {amountMode === "deposit" && (
            <div className="flex min-w-[260px] flex-1 flex-col gap-1">
              <label htmlFor="pos-projects-deposit" className="text-[14px] font-semibold text-admin-ink">{mode.collect.depositLabel}</label>
              <input
                id="pos-projects-deposit"
                inputMode="decimal"
                value={depositText}
                onChange={(event) => { setDepositText(event.target.value); setTenderTouched(false); }}
                className={POS_INPUT}
              />
              <p className="m-0 text-[13px] text-admin-ink-muted">{mode.collect.depositHint}</p>
              {amountVerdict && !amountVerdict.ok && (
                <p role="alert" className="m-0 text-[14px] text-admin-red" data-pos-projects-amount-refusal={amountVerdict.reason}>
                  {mode.collect.amountRefusal[amountVerdict.reason]}
                </p>
              )}
            </div>
          )}
          <p className="m-0 text-[13px] text-admin-ink-muted">{interpolate(mode.money.collectingAgainst, { id: verdict.orderId.slice(0, 8) })}</p>
        </div>
        {amountVerdict?.ok && (
          <CollectSheet
            amountDueCents={amountDueCents}
            currency={currency}
            methods={props.methods}
            activeMethod={method}
            onSelectMethod={setMethod}
            tenderedCents={tenderTouched ? tenderedCents : amountDueCents}
            onKeypadPress={(key) => { setTenderedCents((current) => tenderAfterKey(current, tenderTouched, key)); setTenderTouched(true); }}
            onTender={(cents) => { setTenderedCents(cents); setTenderTouched(true); }}
            onConfirmCash={() => void collect("cash")}
            offlineCash={{
              orderId: verdict.orderId,
              operationKey: posCollectionKey({
                orderId: verdict.orderId,
                version: orderFacts.find((o) => o.orderId === verdict.orderId)?.version ?? 0,
                method: "cash",
                amountCents: amountDueCents,
              }),
            }}
            linkPanel={
              <ProjectsLinkPanel
                orderId={verdict.orderId}
                orderVersion={orderFacts.find((o) => o.orderId === verdict.orderId)?.version ?? 0}
                amountCents={amountDueCents}
                currency={currency}
                workspaceName={props.workspaceName}
                provider={props.linkProvider}
                links={props.links.filter((l) => l.orderId === verdict.orderId)}
                copy={copy.paymentLink}
                engineRefusal={copy.engineRefusal}
                onWritten={() => router.refresh()}
              />
            }
            confirmLoading={busy}
            onBack={() => setCollectOpen(false)}
            backLabel={mode.collect.back}
            copy={copy.collectSheet}
          />
        )}
        {contactFields}
      </div>
    ) : null;

  const collectedPanel = collected ? (
    <CollectedPanel collected={collected} mode={mode} receiptHrefFor={receiptHrefFor} onBack={() => setCollected(null)} />
  ) : null;

  const detailError =
    detail && !detail.ok ? (
      <div className="flex min-w-0 flex-1 flex-col gap-3 px-6 py-[18px]">
        <p role="alert" className={POS_REFUSAL_BANNER}>{detail.reason === "unavailable" ? mode.search.unavailable : mode.refusal.project_gone}</p>
        <button type="button" className={`${POS_SECONDARY_ACTION} self-start`} onClick={closeProject}>{mode.detail.back}</button>
      </div>
    ) : null;

  const cashierLine = `${props.cashierName} · ${props.drawerOpen ? b.drawerOpen : b.drawerNone}`;

  // The tender screen takes the whole surface, as the counter's does: the
  // list and the detail come back when it closes.
  const collectView = project && verdict?.ok && (collectOpen || collected) ? (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-[18px]" data-pos-projects-detail={project.id}>
      <p className="m-0 mb-3 text-[14px] text-admin-ink-muted">
        {project.clientName ? `${project.clientName} · ${project.title}` : project.title} · {cashierLine}
      </p>
      {collectedPanel ?? collectPanel}
    </div>
  ) : (
    <div className="flex min-h-0 flex-1">
      <CollectList
        copy={mode}
        list={props.list}
        rows={rows}
        query={query}
        onQuery={setQuery}
        segment={segment}
        onSegment={setSegment}
        activeId={project?.id ?? null}
        onOpen={(id) => openProject(id, "collect")}
      />
      {detailError ??
        (project && verdict ? (
          <CollectDetail
            copy={mode}
            project={project}
            verdict={verdict}
            orders={orderFacts}
            contact={detail?.ok ? detail.contact : null}
            receiptHrefFor={receiptHrefFor}
            workspacePath={props.workspacePath}
            cashierLine={cashierLine}
            onClose={closeProject}
            busy={busy}
            onCollect={() => {
              if (!verdict.ok) return;
              setAmountMode("balance");
              setDepositText("");
              setTenderedCents(verdict.outstandingCents);
              setTenderTouched(false);
              setRefusal(null);
              setCollectOpen(true);
            }}
          />
        ) : (
          <EmptyDetail copy={mode} />
        ))}
    </div>
  );

  const projectsView = (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-[520px] shrink-0 flex-col gap-3.5 overflow-y-auto border-r border-admin-border px-5 py-[18px] max-[1100px]:w-[420px]">
        <ProjectsList copy={mode} rows={rows} listOk={props.list.ok} activeId={project?.id ?? null} onOpen={(id) => openProject(id, "projects")} />
      </div>
      {detailError ?? (project && verdict ? (
        <ProjectDetail copy={mode} project={project} verdict={verdict} workspacePath={props.workspacePath} onClose={closeProject} onCollect={() => openProject(project.id, "collect")} />
      ) : (
        <EmptyDetail copy={mode} />
      ))}
    </div>
  );

  const header: { title: string; subtitle: string } =
    view === "collect"
      ? { title: b.collectTitle, subtitle: b.collectSubtitle }
      : view === "projects"
        ? { title: b.projectsTitle, subtitle: b.projectsSubtitle }
        : view === "links"
          ? { title: b.linksTitle, subtitle: b.linksSubtitle }
          : view === "issues"
            ? { title: copy.issues.title, subtitle: copy.issues.subtitle }
            : { title: mode.receipts.title, subtitle: b.receiptsSubtitle };

  const body =
    view === "receipts" ? (
      <ReceiptsScreen mode={mode} busy={busy} receiptCode={receiptCode} onReceiptCodeChange={setReceiptCode} receipt={receipt} onFind={() => void findReceipt()} receiptHrefFor={receiptHrefFor} />
    ) : view === "links" ? (
      <LinksScreen copy={mode} rows={props.links} saleHref={(orderId) => `${props.posPath}?mode=counter&order=${encodeURIComponent(orderId)}`} />
    ) : view === "issues" ? (
      <IssuesScreen copy={copy.issues} />
    ) : view === "projects" ? (
      projectsView
    ) : (
      collectView
    );

  return (
    <div className="relative flex h-[calc(100vh-var(--proto-cbar,50px))] min-h-[560px] w-full flex-col overflow-hidden">
      <PosFrame
        mode="projects"
        navLabel={mode.rail.label}
        activeDestination={view}
        onSelectDestination={(id) => {
          if (id === POS_MESSAGES_DESTINATION) {
            router.push(posMessagesHref("projects"));
            return;
          }
          const next = isProjectsModeView(id) ? id : "collect";
          setView(next);
          setRefusal(null);
          setCollectOpen(false);
          if ((next === "receipts" || next === "links" || next === "issues") && detail) router.push(href({ view: next }));
        }}
        destinationLabels={mode.rail.destinations}
        counts={{ messages: props.messagesUnread ?? 0 }}
        modeLabel={mode.title}
        modeEyebrow={copy.chrome.modeEyebrow}
        lock={{ label: copy.chrome.lock, disabledReason: copy.chrome.lockUnavailable }}
        workspace={{ label: copy.chrome.workspace, href: props.workspacePath }}
        className="flex-1 rounded-none border-0"
      >
        <PosHeader
          title={header.title}
          subtitle={header.subtitle}
          location={props.locationName ?? props.workspaceName}
          cashier={{ initials: initialsOf(props.cashierName), label: cashierLine }}
          cashierMenuLabel={copy.chrome.cashierMenu}
        />
        {refusalBanner && <div className="px-6 pt-4">{refusalBanner}</div>}
        <div className="relative flex min-h-0 flex-1 flex-col">{body}</div>
      </PosFrame>
    </div>
  );
}
