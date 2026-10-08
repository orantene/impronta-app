import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { ACCOUNT_TABS, formatZonedWhen, type AccountTab, type AccountView } from "@/lib/client-account/area-pure";
import type { ReceiptDetail, ReceiptRow, ThreadMessage, ThreadRow, VisitDetail } from "@/lib/client-account/area-data.server";
import type { MeItem } from "@/lib/me/shape-me";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type { AccountSummary } from "@/lib/client-account/pure";

import { ClientAccountButton } from "./ClientAccountButton";
import { LogOutButton, SettingsForm, VisitActions, btnPrimary, btnSecondary, type VisitActionsCopy } from "./AccountClientIslands";

const INK = "var(--token-color-ink, #111)";
const BG = "var(--token-color-background, #fff)";
const LINE = "var(--token-color-line, rgba(0,0,0,.14))";
const MUTED = "var(--token-color-muted, #737373)";
const RADIUS = "var(--site-radius-base, 8px)";

export type AreaData = {
  visits?: { upcoming: MeItem[]; waiting: MeItem[]; past: MeItem[] };
  visit?: VisitDetail | null;
  threads?: ThreadRow[];
  thread?: { title: string; messages: ThreadMessage[] } | null;
  summary?: AccountSummary;
  payLinks?: Array<{ title: string; code: string }>;
  receipts?: ReceiptRow[];
  receipt?: ReceiptDetail | null;
  profile?: { name: string; phone: string; locale: string; marketingOptIn: boolean };
};

type Props = {
  locale: string;
  audience: "signed_out" | "not_client" | "client";
  view: AccountView;
  talentName: string;
  profileCode: string | null;
  email: string | null;
  timeZone: string;
  data: AreaData;
};

const wrap: CSSProperties = {
  minHeight: "100vh", background: BG, color: INK,
  fontFamily: "var(--site-body-font, inherit)",
};
const card: CSSProperties = { border: `1px solid ${LINE}`, borderRadius: RADIUS, padding: 16 };

export function ClientAccountArea(props: Props) {
  const loc = props.locale === "es" ? "es" : "en";
  const t = createTranslator(loc);
  const a = (k: string) => t(`public.clientAccountArea.${k}`);
  const heading: CSSProperties = { fontFamily: "var(--site-heading-font, inherit)", margin: 0 };

  const shell = (children: ReactNode) => (
    <main style={wrap} data-client-account-area="">
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 64px" }}>
        <p style={{ margin: 0, fontSize: 14, color: MUTED }}>{props.talentName}</p>
        <h1 style={{ ...heading, fontSize: 28, marginTop: 4 }}>{a("title")}</h1>
        {children}
      </div>
    </main>
  );

  if (props.audience === "signed_out") {
    return shell(
      <section style={{ ...card, marginTop: 24 }}>
        <h2 style={{ ...heading, fontSize: 20 }}>{a("signedOutTitle")}</h2>
        <p style={{ color: MUTED }}>{a("signedOutBody")}</p>
        <ClientAccountButton variant="header" locale={loc} />
      </section>,
    );
  }
  if (props.audience === "not_client") {
    return shell(
      <section style={{ ...card, marginTop: 24 }}>
        <h2 style={{ ...heading, fontSize: 20 }}>{a("notClientTitle")}</h2>
        <p style={{ color: MUTED, marginBottom: 0 }}>{a("notClientBody")}</p>
      </section>,
    );
  }

  const money = (cents: number, cur: string) => formatOrderMoney(cents, cur);
  const back = (href: string) => (
    <p style={{ margin: "20px 0 8px" }}><Link href={href} style={{ color: INK }}>{`← ${a("back")}`}</Link></p>
  );
  const statusLabel = (s: string | null) => {
    const x = (s ?? "").toLowerCase();
    if (x === "cancelled" || x === "declined" || x === "expired") return a("statusCancelled");
    if (x === "completed") return a("statusCompleted");
    if (x === "confirmed" || x === "booked") return a("statusConfirmed");
    if (x === "pending" || x === "inquiry" || x === "new") return a("statusPending");
    return a("statusOther");
  };

  // ── Visit detail ────────────────────────────────────────────────────────
  if (props.view.kind === "visit") {
    const v = props.data.visit;
    if (!v) return shell(<>{back("/account")}<p>{a("noVisits")}</p></>);
    const when = formatZonedWhen(v.startsAt ?? v.eventDate, props.timeZone, loc);
    const p = v.policy;
    const dl = formatZonedWhen(p.deadlineIso, props.timeZone, loc);
    const deadlineLabel = dl ? `${dl.date}, ${dl.time} ${dl.tzLabel}` : "";
    const policyLine = p.enforceable
      ? p.insideWindow
        ? a("policyLate")
        : interpolate(a("policyFree"), { when: deadlineLabel })
      : a("policyNone");
    const refundLine = v.paidCents === 0
      ? a("nothingPaid")
      : p.refundIfCancelled > 0
        ? interpolate(a("refundIfCancelled"), { amount: money(p.refundIfCancelled, v.currency) })
        : a("refundNothing");
    const errors: VisitActionsCopy["errors"] = {
      invalid: a("errGeneric"), unavailable: a("errGeneric"), not_signed_in: a("errNotAllowed"), not_allowed: a("errNotAllowed"),
      not_found: a("errNotAllowed"), not_cancellable: a("errNotCancellable"), not_reschedulable: a("errNotCancellable"),
      slot_taken: a("errSlotTaken"), conflict: a("errGeneric"),
    };
    return shell(
      <>
        {back("/account")}
        <section style={{ ...card, background: "transparent" }} data-account-policy="">
          <h2 style={{ ...heading, fontSize: 16 }}>{a("cancellationPolicy")}</h2>
          <p style={{ margin: "6px 0 0" }}>{policyLine}</p>
          <p style={{ margin: "4px 0 0", color: MUTED }}>{refundLine}</p>
        </section>
        <dl style={{ display: "grid", gridTemplateColumns: "minmax(0,120px) 1fr", gap: "10px 16px", margin: "20px 0" }}>
          <dt style={{ color: MUTED }}>{a("service")}</dt><dd style={{ margin: 0 }}>{v.service}</dd>
          <dt style={{ color: MUTED }}>{a("when")}</dt>
          <dd style={{ margin: 0 }}>
            {when ? <>{when.date}<br />{when.time} <span style={{ color: MUTED }}>{when.tzLabel}</span></> : a("noDate")}
          </dd>
          {v.place ? (<><dt style={{ color: MUTED }}>{a("where")}</dt><dd style={{ margin: 0 }}>{v.place}</dd></>) : null}
          {v.amountCents !== null ? (<><dt style={{ color: MUTED }}>{a("price")}</dt><dd style={{ margin: 0 }}>{money(v.amountCents, v.currency)}</dd></>) : null}
          <dt style={{ color: MUTED }}>{a("status")}</dt><dd style={{ margin: 0 }}>{statusLabel(v.status)}</dd>
        </dl>
        <p style={{ fontSize: 13, color: MUTED }}>{interpolate(a("timeZoneNote"), { zone: when?.tzLabel ?? props.timeZone })}</p>
        {v.canManage && v.bookingId ? (
          <VisitActions
            bookingId={v.bookingId}
            offeringId={v.offeringId}
            timeZone={props.timeZone}
            locale={loc}
            refundCents={p.refundIfCancelled}
            refundLabel={money(p.refundIfCancelled, v.currency)}
            copy={{
              reschedule: a("reschedule"), cancelVisit: a("cancelVisit"), cancelConfirm: a("cancelConfirm"), keepVisit: a("keepVisit"),
              reasonLabel: a("reasonLabel"), pickNewTime: a("pickNewTime"), noSlots: a("noSlots"), loadingSlots: a("loadingSlots"),
              confirmNewTime: a("confirmNewTime"), cancelled: a("cancelled"), cancelledRefund: a("cancelledRefund"), rescheduled: a("rescheduled"),
              refundLine: `${policyLine} ${refundLine}`, errors,
            }}
          />
        ) : null}
        {v.payCode ? <p style={{ marginTop: 16 }}><a href={`/pay/${encodeURIComponent(v.payCode)}`} style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>{a("payNow")}</a></p> : null}
      </>,
    );
  }

  // ── Thread ──────────────────────────────────────────────────────────────
  if (props.view.kind === "thread") {
    const th = props.data.thread;
    if (!th) return shell(<>{back("/account?tab=messages")}<p>{a("noMessages")}</p></>);
    return shell(
      <>
        {back("/account?tab=messages")}
        <h2 style={{ ...heading, fontSize: 18 }}>{th.title}</h2>
        <div style={{ display: "grid", gap: 10, margin: "16px 0" }}>
          {th.messages.length === 0 ? <p>{a("noMessages")}</p> : null}
          {th.messages.map((m) => (
            <div key={m.id} style={{ ...card, padding: 12, justifySelf: m.mine ? "end" : "start", maxWidth: "88%" }}>
              <div style={{ fontSize: 12, color: MUTED }}>{m.mine ? a("you") : props.talentName}</div>
              <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.body}</div>
            </div>
          ))}
        </div>
        <a href={`/c/${encodeURIComponent(props.view.id)}`} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>{a("openChat")}</a>
      </>,
    );
  }

  // ── Receipt ─────────────────────────────────────────────────────────────
  if (props.view.kind === "receipt") {
    const r = props.data.receipt;
    if (!r) return shell(<>{back("/account?tab=payments")}<p>{a("noReceipts")}</p></>);
    const label: Record<string, string> = {
      service: a("lineService"), reservation: a("lineReservation"), tulala_fee: a("lineTulala"),
      processing: a("lineProcessing"), total: a("lineTotal"),
    };
    const paid = r.paidAt ? formatZonedWhen(r.paidAt, props.timeZone, loc) : null;
    return shell(
      <>
        {back("/account?tab=payments")}
        <section style={card}>
          <h2 style={{ ...heading, fontSize: 20 }}>{a("receiptTitle")}</h2>
          {r.seller ? <p style={{ margin: "8px 0 0" }}><span style={{ color: MUTED }}>{a("seller")}</span> {r.seller}</p> : null}
          {r.title ? <p style={{ margin: "4px 0 0" }}>{r.title}</p> : null}
          {paid ? <p style={{ margin: "4px 0 0", color: MUTED }}>{interpolate(a("paidOn"), { date: paid.date })}</p> : null}
          <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
            {r.lines.map((l) => (
              <div key={l.kind} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontWeight: l.kind === "total" ? 700 : 400, borderTop: l.kind === "total" ? `1px solid ${LINE}` : undefined, paddingTop: l.kind === "total" ? 8 : 0 }}>
                <span>{label[l.kind]}</span><span>{money(l.cents, r.currency)}</span>
              </div>
            ))}
          </div>
        </section>
      </>,
    );
  }

  // ── Home: tabs ──────────────────────────────────────────────────────────
  const tab: AccountTab = props.view.kind === "home" ? props.view.tab : "visits";
  const tabLabel: Record<AccountTab, string> = {
    visits: a("tabVisits"), messages: a("tabMessages"), payments: a("tabPayments"), settings: a("tabSettings"),
  };
  const nav = (
    <nav aria-label={a("title")} style={{ display: "flex", gap: 6, overflowX: "auto", margin: "20px 0", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
      {ACCOUNT_TABS.map((k) => (
        <Link
          key={k}
          href={k === "visits" ? "/account" : `/account?tab=${k}`}
          aria-current={k === tab ? "page" : undefined}
          style={{
            flex: "0 0 auto", minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 16px", whiteSpace: "nowrap",
            borderRadius: RADIUS, textDecoration: "none", fontWeight: 600,
            border: `1px solid ${k === tab ? "var(--token-color-primary, #111)" : LINE}`,
            background: k === tab ? "var(--token-color-primary, #111)" : "transparent",
            color: k === tab ? "var(--token-color-on-primary, #fff)" : INK,
          }}
        >
          {tabLabel[k]}
        </Link>
      ))}
    </nav>
  );

  const visitRow = (v: MeItem) => {
    const when = formatZonedWhen(v.eventDate, props.timeZone, loc);
    return (
      <li key={v.id} style={{ listStyle: "none" }}>
        <Link href={`/account/visits/${v.id}`} style={{ ...card, display: "block", textDecoration: "none", color: INK }}>
          <strong>{v.title || a("service")}</strong>
          <span style={{ display: "block", color: MUTED, fontSize: 14 }}>
            {when ? `${when.date}, ${when.time}` : a("noDate")} · {statusLabel(v.status)}
          </span>
        </Link>
      </li>
    );
  };
  const group = (title: string, items: MeItem[], again = false) =>
    items.length === 0 ? null : (
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ ...heading, fontSize: 16, marginBottom: 10 }}>{title}</h2>
        <ul style={{ margin: 0, padding: 0, display: "grid", gap: 10 }}>{items.map(visitRow)}</ul>
        {again ? <p style={{ marginTop: 12 }}><a href="/" style={{ color: INK }}>{a("bookAgain")}</a></p> : null}
      </section>
    );

  let body: ReactNode = null;
  if (tab === "visits") {
    const g = props.data.visits;
    const empty = !g || g.upcoming.length + g.waiting.length + g.past.length === 0;
    body = empty ? (
      <p>{a("noVisits")} <a href="/" style={{ color: INK }}>{a("bookAgain")}</a></p>
    ) : (
      <>
        {group(a("waiting"), g.waiting)}
        {group(a("upcoming"), g.upcoming)}
        {group(a("past"), g.past, true)}
      </>
    );
  } else if (tab === "messages") {
    const list = props.data.threads ?? [];
    body = list.length === 0 ? <p>{a("noMessages")}</p> : (
      <ul style={{ margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {list.map((th) => (
          <li key={th.id} style={{ listStyle: "none" }}>
            <Link href={`/account/messages/${th.id}`} style={{ ...card, display: "block", textDecoration: "none", color: INK }}>
              <strong>{th.title || props.talentName}</strong>
              {th.lastBody ? <span style={{ display: "block", color: MUTED, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{th.lastBody}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    );
  } else if (tab === "payments") {
    const due = props.data.summary?.balanceDue ?? null;
    body = (
      <>
        <section style={{ ...card, marginBottom: 24 }}>
          <h2 style={{ ...heading, fontSize: 16 }}>{a("balanceDue")}</h2>
          {due ? <p style={{ fontSize: 24, fontWeight: 700, margin: "6px 0 12px" }}>{money(due.amountCents, due.currencyCode)}</p> : <p style={{ color: MUTED }}>{a("noBalance")}</p>}
          {(props.data.payLinks ?? []).map((p) => (
            <p key={p.code} style={{ margin: "0 0 8px" }}>
              <a href={`/pay/${encodeURIComponent(p.code)}`} style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                {a("payNow")}{p.title ? ` · ${p.title}` : ""}
              </a>
            </p>
          ))}
        </section>
        <h2 style={{ ...heading, fontSize: 16, marginBottom: 10 }}>{a("receipts")}</h2>
        {(props.data.receipts ?? []).length === 0 ? <p style={{ color: MUTED }}>{a("noReceipts")}</p> : (
          <ul style={{ margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {(props.data.receipts ?? []).map((r) => (
              <li key={r.code} style={{ listStyle: "none" }}>
                <Link href={`/account/receipts/${encodeURIComponent(r.code)}`} style={{ ...card, display: "flex", justifyContent: "space-between", gap: 12, textDecoration: "none", color: INK }}>
                  <span>{r.title || a("viewReceipt")}</span><strong>{money(r.paidCents, r.currency)}</strong>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  } else if (props.data.profile) {
    body = (
      <>
        {props.email ? <p style={{ color: MUTED, marginTop: 0 }}>{a("fieldEmail")}: {props.email}</p> : null}
        <SettingsForm
          initial={props.data.profile}
          copy={{
            name: a("fieldName"), phone: a("fieldPhone"), language: a("fieldLanguage"), marketing: a("fieldMarketing"),
            save: a("save"), saved: a("saved"), invalid: a("phoneInvalid"), generic: a("errGeneric"), langEn: a("langEn"), langEs: a("langEs"),
          }}
        />
        <div style={{ marginTop: 32 }}><LogOutButton label={a("logOut")} /></div>
      </>
    );
  }

  return shell(<>{nav}{body}</>);
}
