"use client";

/**
 * ProjectsModeClient — the Projects point of sale mode, wired.
 *
 * A sibling of `PosClient` (the counter): same `PosFrame`, same rail contract
 * (`POS_MODE_META.projects.destinations`), same collection engine behind the
 * one primary action. It draws three screens:
 *
 *   collect  — find a client or project by name, see what is owed and the
 *              rows it comes from, collect the balance or a deposit through
 *              the counter's `CollectSheet`.
 *   projects — every project with its one next action; opening one shows its
 *              milestones and deliverables.
 *   receipts — a receipt by its public code.
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

import {
  CollectSheet,
  PosFrame,
  PosRefusalBanner,
  type CollectSheetCopy,
  type PosCollectionMethodId,
  type PosCollectionMethodState,
  type PosRefusalCopy,
  type PosRefusalReason,
} from "@/components/admin/pos";
import {
  POS_INPUT,
  POS_PRIMARY_ACTION,
  POS_REFUSAL_BANNER,
  POS_SECONDARY_ACTION,
  POS_SURFACE,
} from "@/components/admin/pos/pos-classes";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { isOrderStatus } from "@/lib/orders/order-status";
import { refusalFromResult } from "@/lib/pos/refusal-reason";
import {
  balanceOwedCents,
  nextProjectAction,
  projectMoney,
  zonedDate,
  type ProjectRecord,
} from "@/lib/projects/project-record";

import { posCollectionKey, tenderAfterKey } from "../counter-model";
import { projectsCollect, projectsFindReceipt, type ProjectsReceiptResult } from "./projects-actions";
import type { ProjectsModeCopy, ProjectsModeRefusal } from "./projects-copy";
import { CollectedPanel, ReceiptsScreen, type Collected } from "./projects-mode-screens";
import type { ProjectClientContact, ProjectOrderFacts } from "./projects-mode-loader";
import {
  collectAmount,
  collectVerdict,
  findProjects,
  type ProjectsModeRow,
} from "./projects-mode-model";

export type ProjectsModeDetail =
  | {
      readonly ok: true;
      readonly project: ProjectRecord;
      readonly orders: ProjectOrderFacts[];
      readonly contact: ProjectClientContact | null;
    }
  | { readonly ok: false; readonly reason: "unavailable" | "not_found" | "invalid" };

export type ProjectsModeView = "collect" | "projects" | "receipts";

export type ProjectsModeClientProps = {
  readonly workspaceName: string;
  readonly posPath: string;
  readonly workspacePath: string;
  readonly receiptOrigin: string;
  readonly initialView: ProjectsModeView;
  readonly list: { readonly ok: true; readonly rows: ProjectsModeRow[] } | { readonly ok: false };
  readonly detail: ProjectsModeDetail | null;
  readonly minorUnitDivisor: number;
  readonly methods: PosCollectionMethodState[];
  readonly copy: {
    readonly mode: ProjectsModeCopy;
    readonly collectSheet: CollectSheetCopy;
    readonly refusal: PosRefusalCopy;
  };
};

type Refusal =
  | { kind: "engine"; reason: PosRefusalReason }
  | { kind: "mode"; reason: ProjectsModeRefusal };

const VIEWS: readonly ProjectsModeView[] = ["collect", "projects", "receipts"];

function isProjectsModeView(id: string): id is ProjectsModeView {
  return (VIEWS as readonly string[]).includes(id);
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

export function ProjectsModeClient(props: ProjectsModeClientProps) {
  const router = useRouter();
  const { copy } = props;
  const mode = copy.mode;

  const [view, setView] = useState<ProjectsModeView>(props.initialView);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  const [collectOpen, setCollectOpen] = useState(false);
  const [amountMode, setAmountMode] = useState<"balance" | "deposit">("balance");
  const [depositText, setDepositText] = useState("");
  const [method, setMethod] = useState<PosCollectionMethodId>("cash");
  const [tenderedCents, setTenderedCents] = useState(0);
  const [tenderTouched, setTenderTouched] = useState(false);
  const [email, setEmail] = useState(
    props.detail?.ok ? props.detail.contact?.email ?? "" : "",
  );
  const [phone, setPhone] = useState(
    props.detail?.ok ? props.detail.contact?.phone ?? "" : "",
  );
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
  const money = project ? projectMoney(project) : null;
  const currency = project?.currency ?? "USD";
  const orderFacts = useMemo(() => (detail?.ok ? detail.orders : []), [detail]);
  const factsFor = (orderId: string) => orderFacts.find((o) => o.orderId === orderId) ?? null;

  const amountVerdict =
    verdict?.ok
      ? collectAmount({
          outstandingCents: verdict.outstandingCents,
          mode: amountMode,
          depositText,
          minorUnitDivisor: props.minorUnitDivisor,
        })
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
      // Untouched keypad means exact tender for THIS amount, whatever the
      // keypad was seeded with when the sheet opened for a different one.
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
          idempotencyKey: posCollectionKey({
            orderId: verdict.orderId,
            version: facts.version,
            method: tender,
            amountCents,
          }),
          expectedVersion: facts.version,
        });
        if (!result.ok) {
          if (result.kind === "mode") {
            setRefusal({ kind: "mode", reason: result.reason });
          } else if (result.kind === "engine") {
            setRefusal({
              kind: "engine",
              reason: refusalFromResult({ ok: false, reason: result.reason }, "sale") ?? "paymentUnknown",
            });
          } else {
            setRefusal({
              kind: "engine",
              reason: refusalFromResult({ ok: false, error: result.error }, "action") ?? "paymentUnknown",
            });
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

  // ── Pieces ─────────────────────────────────────────────────────────

  const refusalBanner = refusal ? (
    refusal.kind === "engine" ? (
      <PosRefusalBanner
        reason={refusal.reason}
        copy={copy.refusal}
        onRetry={() => {
          setRefusal(null);
          router.refresh();
        }}
      />
    ) : (
      <div role="alert" data-pos-projects-refusal={refusal.reason} className={POS_REFUSAL_BANNER}>
        <p className="m-0 flex-1">{mode.refusal[refusal.reason]}</p>
        <button
          type="button"
          onClick={() => {
            setRefusal(null);
            router.refresh();
          }}
          className={`${POS_SECONDARY_ACTION} h-9 shrink-0 px-3 text-xs`}
        >
          {mode.refusal.reload}
        </button>
      </div>
    )
  ) : null;

  const rows = props.list.ok ? findProjects(props.list.rows, query) : [];

  const projectList = (opts: { search: boolean; openTo: ProjectsModeView }) => (
    <div className="flex flex-col gap-3">
      {opts.search && (
        <div className={`${POS_SURFACE} flex flex-col gap-2 p-4`}>
          <label htmlFor="pos-projects-search" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {mode.search.label}
          </label>
          <input
            id="pos-projects-search"
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={mode.search.placeholder}
            className={`${POS_INPUT} h-14 text-base`}
          />
        </div>
      )}
      {!props.list.ok ? (
        <p role="alert" className={POS_REFUSAL_BANNER}>{mode.search.unavailable}</p>
      ) : props.list.rows.length === 0 ? (
        <p className="m-0 px-1 text-sm text-muted-foreground">{mode.search.none}</p>
      ) : rows.length === 0 ? (
        <p className="m-0 px-1 text-sm text-muted-foreground">{mode.search.empty}</p>
      ) : (
        <div className={`${POS_SURFACE} overflow-x-auto`}>
          <table className="w-full text-sm" data-pos-projects-list>
            <caption className="sr-only">{mode.list.caption}</caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">{mode.list.colProject}</th>
                <th className="px-4 py-3 font-medium">{mode.list.colClient}</th>
                <th className="px-4 py-3 text-right font-medium">{mode.list.colOwed}</th>
                <th className="px-4 py-3 font-medium">{mode.list.colNext}</th>
                <th className="px-4 py-3"><span className="sr-only">{mode.list.open}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border" data-pos-project-row={row.id}>
                  <td className="px-4 py-3 font-medium text-foreground">{row.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.clientName ?? mode.detail.noClient}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground" data-pos-project-owed>
                    {formatOrderMoney(row.dueCents, row.currency)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.collect.ok ? mode.action.collect_balance : mode.action[row.action.id]}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className={`${POS_SECONDARY_ACTION} h-14 min-w-[6rem]`}
                      onClick={() => openProject(row.id, opts.openTo)}
                    >
                      {mode.list.open}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="m-0 border-t border-border px-4 py-2 text-xs text-muted-foreground">
            {interpolate(mode.search.count, { count: rows.length })}
          </p>
        </div>
      )}
    </div>
  );

  const contactFields = (
    <div className={`${POS_SURFACE} flex flex-col gap-2 p-4`}>
      <p className="m-0 text-xs text-muted-foreground">{mode.contact.hint}</p>
      <label className="text-xs font-medium text-muted-foreground" htmlFor="pos-projects-email">
        {mode.contact.email}
      </label>
      <input
        id="pos-projects-email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className={POS_INPUT}
      />
      <label className="text-xs font-medium text-muted-foreground" htmlFor="pos-projects-phone">
        {mode.contact.phone}
      </label>
      <input
        id="pos-projects-phone"
        type="tel"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        className={POS_INPUT}
      />
    </div>
  );

  const collectPanel =
    project && verdict?.ok ? (
      <div className="flex flex-col gap-3" data-pos-projects-collect>
        <div className={`${POS_SURFACE} flex flex-col gap-3 p-4`}>
          <h2 className="m-0 text-base font-semibold text-foreground">{mode.collect.title}</h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={amountMode === "balance"}
              className={`${amountMode === "balance" ? POS_PRIMARY_ACTION : POS_SECONDARY_ACTION} w-full`}
              onClick={() => setAmountMode("balance")}
            >
              {mode.collect.whole}
            </button>
            <button
              type="button"
              aria-pressed={amountMode === "deposit"}
              className={`${amountMode === "deposit" ? POS_PRIMARY_ACTION : POS_SECONDARY_ACTION} w-full`}
              onClick={() => setAmountMode("deposit")}
            >
              {mode.collect.deposit}
            </button>
          </div>
          {amountMode === "deposit" && (
            <div className="flex flex-col gap-1">
              <label htmlFor="pos-projects-deposit" className="text-xs font-medium text-muted-foreground">
                {mode.collect.depositLabel}
              </label>
              <input
                id="pos-projects-deposit"
                inputMode="decimal"
                value={depositText}
                onChange={(event) => {
                  setDepositText(event.target.value);
                  setTenderTouched(false);
                }}
                className={`${POS_INPUT} h-14 text-base`}
              />
              <p className="m-0 text-xs text-muted-foreground">{mode.collect.depositHint}</p>
              {amountVerdict && !amountVerdict.ok && (
                <p role="alert" className="m-0 text-sm text-destructive" data-pos-projects-amount-refusal={amountVerdict.reason}>
                  {mode.collect.amountRefusal[amountVerdict.reason]}
                </p>
              )}
            </div>
          )}
          <p className="m-0 text-xs text-muted-foreground">
            {interpolate(mode.money.collectingAgainst, { id: shortId(verdict.orderId) })}
          </p>
        </div>
        {amountVerdict?.ok && (
          <CollectSheet
            amountDueCents={amountDueCents}
            currency={currency}
            methods={props.methods}
            activeMethod={method}
            onSelectMethod={setMethod}
            tenderedCents={tenderTouched ? tenderedCents : amountDueCents}
            onKeypadPress={(key) => {
              setTenderedCents((current) => tenderAfterKey(current, tenderTouched, key));
              setTenderTouched(true);
            }}
            onConfirmCash={() => void collect("cash")}
            onConfirmLink={() => void collect("online_card")}
            confirmLoading={busy}
            copy={copy.collectSheet}
          />
        )}
        {contactFields}
        <button
          type="button"
          className={`${POS_SECONDARY_ACTION} w-full`}
          onClick={() => setCollectOpen(false)}
        >
          {mode.collect.back}
        </button>
      </div>
    ) : null;

  const receiptHrefFor = (code: string | null) =>
    code && props.receiptOrigin ? `${props.receiptOrigin}/r/${code}` : null;

  const collectedPanel = collected ? (
    <CollectedPanel
      collected={collected}
      mode={mode}
      receiptHrefFor={receiptHrefFor}
      onBack={() => setCollected(null)}
    />
  ) : null;

  const projectPanel = (opts: { focus: "money" | "work" }) => {
    if (!detail) return null;
    if (!detail.ok) {
      return (
        <div className="flex flex-col gap-3">
          <p role="alert" className={POS_REFUSAL_BANNER}>
            {detail.reason === "unavailable" ? mode.search.unavailable : mode.refusal.project_gone}
          </p>
          <button type="button" className={`${POS_SECONDARY_ACTION} self-start`} onClick={closeProject}>
            {mode.detail.back}
          </button>
        </div>
      );
    }
    if (!project || !money || !verdict) return null;
    const startsOn = zonedDate(project.startsAt, project.timeZone, mode.detail.noDate);
    // The one next action: the page's own verdict, except that Collect is
    // named only when the mode's stricter gate allows it.
    const action = mode.action[verdict.ok ? "collect_balance" : nextProjectAction(project).id];

    return (
      <div className="flex flex-col gap-4" data-pos-projects-detail={project.id}>
        <button type="button" className={`${POS_SECONDARY_ACTION} self-start`} onClick={closeProject}>
          {mode.detail.back}
        </button>

        <header className={`${POS_SURFACE} flex flex-col gap-2 p-4`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="m-0 text-xl font-semibold text-foreground">{project.title}</h2>
            <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
              {mode.status[project.status]}
            </span>
          </div>
          <p className="m-0 text-sm text-muted-foreground">
            {mode.detail.client}: <span className="text-foreground">{project.clientName ?? mode.detail.noClient}</span>
            {" · "}
            {mode.detail.starts}: <span className="text-foreground">{startsOn}</span>
          </p>
          <p className="m-0 text-xs text-muted-foreground">
            {interpolate(mode.detail.timezoneNote, { zone: project.timeZone })}
          </p>
          <a
            href={`${props.workspacePath}/projects/${project.id}`}
            className="text-sm text-foreground underline"
          >
            {mode.detail.openWorkspace}
          </a>
        </header>

        {collectedPanel}

        {!collected && (
          <section className={`${POS_SURFACE} flex flex-col gap-3 p-4`} data-pos-projects-next>
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {mode.detail.nextTitle}
            </p>
            <p className="m-0 text-base font-medium text-foreground" data-pos-projects-next-action>{action}</p>
            {verdict.ok ? (
              !collectOpen && (
                <button
                  type="button"
                  className={`${POS_PRIMARY_ACTION} w-full`}
                  disabled={busy}
                  data-pos-projects-open-collect
                  onClick={() => {
                    setAmountMode("balance");
                    setDepositText("");
                    setTenderedCents(verdict.outstandingCents);
                    setTenderTouched(false);
                    setRefusal(null);
                    setCollectOpen(true);
                  }}
                >
                  {interpolate(mode.collect.open, {
                    amount: formatOrderMoney(verdict.outstandingCents, verdict.currency),
                  })}
                </button>
              )
            ) : money.dueCents > 0 || verdict.reason === "agreement_awaiting" || verdict.reason === "milestone_awaiting" ? (
              <p className="m-0 text-sm text-muted-foreground" data-pos-projects-collect-refused={verdict.reason}>
                {mode.refusal[verdict.reason]}
              </p>
            ) : null}
          </section>
        )}

        {collectOpen && !collected && collectPanel}

        {opts.focus === "money" || !collectOpen ? (
          <section className={`${POS_SURFACE} flex flex-col gap-3 p-4`} data-pos-projects-money>
            <dl className="grid grid-cols-3 gap-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{mode.money.due}</dt>
                <dd className="m-0 text-xl font-semibold tabular-nums text-foreground" data-pos-projects-due>
                  {formatOrderMoney(money.dueCents, money.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{mode.money.collected}</dt>
                <dd className="m-0 text-xl font-semibold tabular-nums text-foreground" data-pos-projects-collected-total>
                  {formatOrderMoney(money.collectedCents, money.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{mode.money.agreed}</dt>
                <dd className="m-0 text-xl font-semibold tabular-nums text-foreground">
                  {money.quoted.known
                    ? formatOrderMoney(money.quoted.cents, money.currency)
                    : mode.money.agreedNone}
                </dd>
              </div>
            </dl>
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {mode.money.rowsTitle}
            </p>
            {project.balances.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">{mode.money.noOrders}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-pos-projects-rows>
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">{mode.money.colRecord}</th>
                      <th className="py-2 pr-3 font-medium">{mode.money.colStatus}</th>
                      <th className="py-2 pr-3 text-right font-medium">{mode.money.colTotal}</th>
                      <th className="py-2 pr-3 text-right font-medium">{mode.money.colCollected}</th>
                      <th className="py-2 pr-3 text-right font-medium">{mode.money.colOutstanding}</th>
                      <th className="py-2 font-medium">{mode.money.colReceipt}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.balances.map((b) => {
                      const owed = balanceOwedCents(b);
                      const facts = factsFor(b.orderId);
                      const link = receiptHrefFor(facts?.receiptCode ?? null);
                      return (
                        <tr key={b.orderId} className="border-t border-border" data-pos-projects-row={b.orderId}>
                          <td className="py-2 pr-3 font-mono text-xs text-foreground">{shortId(b.orderId)}</td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {isOrderStatus(b.status) ? mode.orderStatus[b.status] : b.status}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatOrderMoney(b.totalCents, b.currency)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatOrderMoney(b.collectedCents, b.currency)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums" data-pos-projects-row-outstanding>
                            {formatOrderMoney(owed, b.currency)}
                            {owed === 0 && b.totalCents > 0 && b.status !== "paid" && (
                              <span className="block text-xs text-muted-foreground">{mode.money.notCounted}</span>
                            )}
                          </td>
                          <td className="py-2">
                            {link ? (
                              <a href={link} target="_blank" rel="noopener noreferrer" className="text-foreground underline">
                                {facts?.receiptCode}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">{mode.money.noReceipt}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {(opts.focus === "work" || !collectOpen) && (
          <section className={`${POS_SURFACE} flex flex-col gap-3 p-4`} data-pos-projects-milestones>
            <h3 className="m-0 text-base font-semibold text-foreground">{mode.milestones.title}</h3>
            {project.milestones.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">{mode.milestones.none}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">{mode.milestones.colItem}</th>
                      <th className="py-2 pr-3 font-medium">{mode.milestones.colStatus}</th>
                      <th className="py-2 pr-3 font-medium">{mode.milestones.colDue}</th>
                      <th className="py-2 font-medium">{mode.milestones.colRevisions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.milestones.map((m) => (
                      <tr key={m.id} className="border-t border-border">
                        <td className="py-2 pr-3 text-foreground">{m.title}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{mode.milestoneStatus[m.status]}</td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {zonedDate(m.dueAt, project.timeZone, mode.milestones.noDue)}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {interpolate(mode.milestones.revisionsUsed, { used: m.revision, limit: m.revisionLimit })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    );
  };

  const receiptsScreen = (
    <ReceiptsScreen
      mode={mode}
      busy={busy}
      receiptCode={receiptCode}
      onReceiptCodeChange={setReceiptCode}
      receipt={receipt}
      onFind={() => void findReceipt()}
      receiptHrefFor={receiptHrefFor}
    />
  );

  const body =
    view === "receipts"
      ? receiptsScreen
      : detail
        ? projectPanel({ focus: view === "collect" ? "money" : "work" })
        : projectList({ search: true, openTo: view });

  return (
    <div className="flex min-h-[calc(100vh-56px)] w-full flex-col">
      <PosFrame
        mode="projects"
        navLabel={mode.rail.label}
        activeDestination={view}
        onSelectDestination={(id) => {
          const next = isProjectsModeView(id) ? id : "collect";
          setView(next);
          setRefusal(null);
          setCollectOpen(false);
          if (next === "receipts" && detail) router.push(href({ view: next }));
        }}
        destinationLabels={mode.rail.destinations}
        className="flex-1 rounded-none border-0"
      >
        <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="m-0 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {props.workspaceName}
            </p>
            <h1 className="m-0 text-base font-semibold text-foreground">{mode.title}</h1>
          </div>
          {!detail && <p className="m-0 hidden text-sm text-muted-foreground md:block">{mode.intro}</p>}
        </header>
        {refusalBanner && <div className="px-4 pt-4">{refusalBanner}</div>}
        <div className="p-4">{body}</div>
      </PosFrame>
    </div>
  );
}
