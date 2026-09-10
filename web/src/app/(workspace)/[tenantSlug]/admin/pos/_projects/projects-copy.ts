/**
 * projects-copy.ts — every sentence the Projects mode shows, read from the
 * message catalogue in the request's own language and handed to the client
 * as a plain object. Literal keys only, so `message-key-usage.static.test`
 * can see each one.
 *
 * Action, status and milestone labels are BORROWED from the workspace
 * project page's keys (`dashboard.projects.*`) and the orders desk's
 * (`dashboard.orders.status*`), so the till and the workspace never call the
 * same state two different things.
 */

import type { Translator } from "@/components/admin/pos/translator";
import type { MilestoneStatus, ProjectActionId, ProjectStatus } from "@/lib/projects/project-record";
import type { OrderStatus } from "@/lib/orders/order-status";

import type { AmountRefusal, CollectRefusal } from "./projects-mode-model";

export type ProjectsModeRefusal = CollectRefusal | "project_gone" | "order_changed";

export type ProjectsReceiptRefusal = "invalid_code" | "not_found" | "unavailable" | "not_allowed";

export type ProjectsModeCopy = {
  readonly rail: { readonly label: string; readonly destinations: Readonly<Record<string, string>> };
  readonly title: string;
  readonly intro: string;
  readonly search: {
    readonly label: string;
    readonly placeholder: string;
    readonly empty: string;
    readonly none: string;
    readonly unavailable: string;
    readonly count: string;
  };
  readonly list: {
    readonly colProject: string;
    readonly colClient: string;
    readonly colOwed: string;
    readonly colNext: string;
    readonly open: string;
    readonly caption: string;
  };
  readonly detail: {
    readonly back: string;
    readonly client: string;
    readonly noClient: string;
    readonly noDate: string;
    readonly starts: string;
    readonly openWorkspace: string;
    readonly nextTitle: string;
    readonly timezoneNote: string;
  };
  readonly money: {
    readonly due: string;
    readonly collected: string;
    readonly agreed: string;
    readonly agreedNone: string;
    readonly rowsTitle: string;
    readonly colRecord: string;
    readonly colStatus: string;
    readonly colTotal: string;
    readonly colCollected: string;
    readonly colOutstanding: string;
    readonly colReceipt: string;
    readonly noReceipt: string;
    readonly noOrders: string;
    readonly collectingAgainst: string;
    readonly notCounted: string;
  };
  readonly milestones: {
    readonly title: string;
    readonly none: string;
    readonly colItem: string;
    readonly colStatus: string;
    readonly colDue: string;
    readonly colRevisions: string;
    readonly revisionsUsed: string;
    readonly noDue: string;
  };
  readonly collect: {
    readonly title: string;
    readonly whole: string;
    readonly deposit: string;
    readonly depositLabel: string;
    readonly depositHint: string;
    readonly open: string;
    readonly back: string;
    readonly amountRefusal: Readonly<Record<AmountRefusal, string>>;
  };
  readonly refusal: Readonly<Record<ProjectsModeRefusal, string>> & { readonly reload: string };
  readonly paid: {
    readonly title: string;
    readonly amount: string;
    readonly change: string;
    readonly remaining: string;
    readonly settled: string;
    readonly receipt: string;
    readonly noReceipt: string;
    readonly back: string;
    readonly copyReceipt: string;
    readonly receiptCopied: string;
  };
  readonly receipts: {
    readonly title: string;
    readonly intro: string;
    readonly codeLabel: string;
    readonly placeholder: string;
    readonly find: string;
    readonly open: string;
    readonly record: string;
    readonly status: string;
    readonly total: string;
    readonly collected: string;
    readonly issued: string;
    readonly onProject: string;
    readonly refusal: Readonly<Record<ProjectsReceiptRefusal, string>>;
  };
  readonly action: Readonly<Record<ProjectActionId, string>>;
  readonly status: Readonly<Record<ProjectStatus, string>>;
  readonly milestoneStatus: Readonly<Record<MilestoneStatus, string>>;
  readonly orderStatus: Readonly<Record<OrderStatus, string>>;
  readonly contact: { readonly hint: string; readonly email: string; readonly phone: string };
};

export function projectsModeCopy(t: Translator): ProjectsModeCopy {
  return {
    rail: {
      label: t("dashboard.pos.projects.rail.label"),
      destinations: {
        collect: t("dashboard.pos.projects.rail.collect"),
        projects: t("dashboard.pos.projects.rail.projects"),
        receipts: t("dashboard.pos.projects.rail.receipts"),
      },
    },
    title: t("dashboard.pos.projects.title"),
    intro: t("dashboard.pos.projects.intro"),
    search: {
      label: t("dashboard.pos.projects.search.label"),
      placeholder: t("dashboard.pos.projects.search.placeholder"),
      empty: t("dashboard.pos.projects.search.empty"),
      none: t("dashboard.pos.projects.search.none"),
      unavailable: t("dashboard.pos.projects.search.unavailable"),
      count: t("dashboard.pos.projects.search.count"),
    },
    list: {
      colProject: t("dashboard.pos.projects.list.colProject"),
      colClient: t("dashboard.pos.projects.list.colClient"),
      colOwed: t("dashboard.pos.projects.list.colOwed"),
      colNext: t("dashboard.pos.projects.list.colNext"),
      open: t("dashboard.pos.projects.list.open"),
      caption: t("dashboard.pos.projects.list.caption"),
    },
    detail: {
      back: t("dashboard.pos.projects.detail.back"),
      client: t("dashboard.pos.projects.detail.client"),
      noClient: t("dashboard.pos.projects.detail.noClient"),
      noDate: t("dashboard.pos.projects.detail.noDate"),
      starts: t("dashboard.pos.projects.detail.starts"),
      openWorkspace: t("dashboard.pos.projects.detail.openWorkspace"),
      nextTitle: t("dashboard.pos.projects.detail.nextTitle"),
      timezoneNote: t("dashboard.projects.timezoneNote"),
    },
    money: {
      due: t("dashboard.pos.projects.money.due"),
      collected: t("dashboard.pos.projects.money.collected"),
      agreed: t("dashboard.pos.projects.money.agreed"),
      agreedNone: t("dashboard.pos.projects.money.agreedNone"),
      rowsTitle: t("dashboard.pos.projects.money.rowsTitle"),
      colRecord: t("dashboard.pos.projects.money.colRecord"),
      colStatus: t("dashboard.pos.projects.money.colStatus"),
      colTotal: t("dashboard.pos.projects.money.colTotal"),
      colCollected: t("dashboard.pos.projects.money.colCollected"),
      colOutstanding: t("dashboard.pos.projects.money.colOutstanding"),
      colReceipt: t("dashboard.pos.projects.money.colReceipt"),
      noReceipt: t("dashboard.pos.projects.money.noReceipt"),
      noOrders: t("dashboard.pos.projects.money.noOrders"),
      collectingAgainst: t("dashboard.pos.projects.money.collectingAgainst"),
      notCounted: t("dashboard.pos.projects.money.notCounted"),
    },
    milestones: {
      title: t("dashboard.projects.milestones.title"),
      none: t("dashboard.projects.milestones.none"),
      colItem: t("dashboard.projects.milestones.colItem"),
      colStatus: t("dashboard.projects.milestones.colStatus"),
      colDue: t("dashboard.projects.milestones.colDue"),
      colRevisions: t("dashboard.projects.milestones.colRevisions"),
      revisionsUsed: t("dashboard.projects.milestones.revisionsUsed"),
      noDue: t("dashboard.projects.milestones.noDue"),
    },
    collect: {
      title: t("dashboard.pos.projects.collect.title"),
      whole: t("dashboard.pos.projects.collect.whole"),
      deposit: t("dashboard.pos.projects.collect.deposit"),
      depositLabel: t("dashboard.pos.projects.collect.depositLabel"),
      depositHint: t("dashboard.pos.projects.collect.depositHint"),
      open: t("dashboard.pos.projects.collect.open"),
      back: t("dashboard.pos.projects.collect.back"),
      amountRefusal: {
        not_a_number: t("dashboard.pos.projects.collect.amount.not_a_number"),
        zero: t("dashboard.pos.projects.collect.amount.zero"),
        over_balance: t("dashboard.pos.projects.collect.amount.over_balance"),
      },
    },
    refusal: {
      project_closed: t("dashboard.pos.projects.refusal.project_closed"),
      agreement_awaiting: t("dashboard.pos.projects.refusal.agreement_awaiting"),
      milestone_awaiting: t("dashboard.pos.projects.refusal.milestone_awaiting"),
      nothing_owed: t("dashboard.pos.projects.refusal.nothing_owed"),
      mixed_currency: t("dashboard.pos.projects.refusal.mixed_currency"),
      project_gone: t("dashboard.pos.projects.refusal.project_gone"),
      order_changed: t("dashboard.pos.projects.refusal.order_changed"),
      reload: t("dashboard.pos.counter.refusal.reload"),
    },
    paid: {
      title: t("dashboard.pos.projects.paid.title"),
      amount: t("dashboard.pos.counter.paid.amount"),
      change: t("dashboard.pos.counter.paid.change"),
      remaining: t("dashboard.pos.projects.paid.remaining"),
      settled: t("dashboard.pos.projects.paid.settled"),
      receipt: t("dashboard.pos.counter.receiptLink"),
      noReceipt: t("dashboard.pos.projects.paid.noReceipt"),
      back: t("dashboard.pos.projects.paid.back"),
      copyReceipt: t("dashboard.pos.counter.copyReceipt"),
      receiptCopied: t("dashboard.pos.counter.receiptCopied"),
    },
    receipts: {
      title: t("dashboard.pos.projects.receipts.title"),
      intro: t("dashboard.pos.projects.receipts.intro"),
      codeLabel: t("dashboard.pos.projects.receipts.codeLabel"),
      placeholder: t("dashboard.pos.projects.receipts.placeholder"),
      find: t("dashboard.pos.projects.receipts.find"),
      open: t("dashboard.pos.projects.receipts.open"),
      record: t("dashboard.pos.projects.receipts.record"),
      status: t("dashboard.pos.projects.receipts.status"),
      total: t("dashboard.pos.projects.receipts.total"),
      collected: t("dashboard.pos.projects.receipts.collected"),
      issued: t("dashboard.pos.projects.receipts.issued"),
      onProject: t("dashboard.pos.projects.receipts.onProject"),
      refusal: {
        invalid_code: t("dashboard.pos.projects.receipts.refusal.invalid_code"),
        not_found: t("dashboard.pos.projects.receipts.refusal.not_found"),
        unavailable: t("dashboard.pos.projects.receipts.refusal.unavailable"),
        not_allowed: t("dashboard.pos.projects.receipts.refusal.not_allowed"),
      },
    },
    action: {
      draft_agreement: t("dashboard.projects.action.draft_agreement"),
      send_agreement: t("dashboard.projects.action.send_agreement"),
      await_client: t("dashboard.projects.action.await_client"),
      assign_team: t("dashboard.projects.action.assign_team"),
      review_milestone: t("dashboard.projects.action.review_milestone"),
      chase_milestone: t("dashboard.projects.action.chase_milestone"),
      collect_balance: t("dashboard.projects.action.collect_balance"),
      close_project: t("dashboard.projects.action.close_project"),
      nothing: t("dashboard.projects.action.nothing"),
    },
    status: {
      draft: t("dashboard.projects.status.draft"),
      tentative: t("dashboard.projects.status.tentative"),
      confirmed: t("dashboard.projects.status.confirmed"),
      in_progress: t("dashboard.projects.status.in_progress"),
      completed: t("dashboard.projects.status.completed"),
      cancelled: t("dashboard.projects.status.cancelled"),
      archived: t("dashboard.projects.status.archived"),
    },
    milestoneStatus: {
      draft: t("dashboard.projects.milestones.statusDraft"),
      submitted: t("dashboard.projects.milestones.statusSubmitted"),
      approved: t("dashboard.projects.milestones.statusApproved"),
      revision_requested: t("dashboard.projects.milestones.statusRevisionRequested"),
      cancelled: t("dashboard.projects.milestones.statusCancelled"),
    },
    orderStatus: {
      draft: t("dashboard.orders.statusDraft"),
      quoted: t("dashboard.orders.statusQuoted"),
      pending_payment: t("dashboard.orders.statusPendingPayment"),
      paid: t("dashboard.orders.statusPaid"),
      fulfilled: t("dashboard.orders.statusFulfilled"),
      cancelled: t("dashboard.orders.statusCancelled"),
      refunded: t("dashboard.orders.statusRefunded"),
      partially_refunded: t("dashboard.orders.statusPartiallyRefunded"),
    },
    contact: {
      hint: t("dashboard.pos.contactHint"),
      email: t("dashboard.pos.email"),
      phone: t("dashboard.pos.phone"),
    },
  };
}
