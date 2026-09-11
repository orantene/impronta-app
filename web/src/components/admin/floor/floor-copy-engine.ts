/**
 * floor-copy-engine.ts — the sentences of the Tables mode's Package 1
 * screens: merge checks (T16), change server (T17), split check (T18), the
 * popover's multi-check rows, and the engine's own refusal codes for a
 * table operation (`docs/plans/program/engine/pos-money.md` §6). Read
 * through the same translator as `floor-copy.ts`, in its own file so that
 * one stays under the size cap.
 */

import type { Translator } from "../pos/translator";

const K = "dashboard.pos.floor.board";
const E = "dashboard.pos.engine.refusal";

export type FloorEngineCopy = {
  readonly merge: {
    /** `{code} › Merge` */
    readonly crumb: string;
    /** `Merge another check into {code}` */
    readonly title: string;
    readonly subtitle: string;
    readonly none: string;
    /** `{code} · {party} · {amount}` */
    readonly row: string;
    readonly rowHint: string;
    readonly responsible: string;
    /** `{party} ({code})` */
    readonly responsibleValue: string;
    /** `{code} check` */
    readonly thisCheck: string;
    /** `+ {code} check` */
    readonly otherCheck: string;
    readonly oneCheck: string;
    readonly payments: string;
    readonly paymentsValue: string;
    readonly back: string;
    /** `Merge · one check for {party} · {amount}` */
    readonly confirm: string;
    /** `{code}'s check is now on {into}.` */
    readonly done: string;
  };
  readonly server: {
    /** `Change server · {code}` */
    readonly title: string;
    /** `{party} · currently {name}` */
    readonly subtitle: string;
    readonly nobody: string;
    /** `{n} tables` */
    readonly tables: string;
    readonly current: string;
    readonly none: string;
    readonly fromNow: string;
    /** `{name} serves {code}` */
    readonly fromNowValue: string;
    readonly tips: string;
    readonly tipsValue: string;
    readonly drawer: string;
    readonly drawerValue: string;
    readonly back: string;
    /** `Give {code} to {name}` */
    readonly confirm: string;
    /** `{code} is now {name}'s.` */
    readonly done: string;
  };
  readonly split: {
    /** `Checks · {code} · {party}` */
    readonly title: string;
    /** `{amount} in items · tap items, then move them` */
    readonly subtitle: string;
    readonly loading: string;
    readonly unreadable: string;
    readonly empty: string;
    /** `Check {letter}` */
    readonly check: string;
    readonly unpaid: string;
    readonly items: string;
    readonly remaining: string;
    /** `{n} items selected · {amount}` */
    readonly selected: string;
    readonly moveToNew: string;
    readonly moving: string;
    readonly note: string;
    readonly back: string;
    /** `Collect check {letter} · {amount}` */
    readonly collect: string;
    /** `{n} items moved to a new check.` */
    readonly done: string;
  };
  readonly popover: {
    /** `{n} checks · {amount}` */
    readonly checks: string;
    /** `Open check {letter} · {amount}` */
    readonly openCheck: string;
    /** `Served by {name}` */
    readonly servedBy: string;
    readonly serverNone: string;
  };
  readonly changeJoinReason: string;
};

export function floorEngineCopy(t: Translator): FloorEngineCopy {
  return {
    merge: {
      crumb: t(`${K}.merge.crumb`),
      title: t(`${K}.merge.title`),
      subtitle: t(`${K}.merge.subtitle`),
      none: t(`${K}.merge.none`),
      row: t(`${K}.merge.row`),
      rowHint: t(`${K}.merge.rowHint`),
      responsible: t(`${K}.merge.responsible`),
      responsibleValue: t(`${K}.merge.responsibleValue`),
      thisCheck: t(`${K}.merge.thisCheck`),
      otherCheck: t(`${K}.merge.otherCheck`),
      oneCheck: t(`${K}.merge.oneCheck`),
      payments: t(`${K}.merge.payments`),
      paymentsValue: t(`${K}.merge.paymentsValue`),
      back: t(`${K}.move.back`),
      confirm: t(`${K}.merge.confirm`),
      done: t(`${K}.merge.done`),
    },
    server: {
      title: t(`${K}.server.title`),
      subtitle: t(`${K}.server.subtitle`),
      nobody: t(`${K}.server.nobody`),
      tables: t(`${K}.server.tables`),
      current: t(`${K}.server.current`),
      none: t(`${K}.server.none`),
      fromNow: t(`${K}.server.fromNow`),
      fromNowValue: t(`${K}.server.fromNowValue`),
      tips: t(`${K}.server.tips`),
      tipsValue: t(`${K}.server.tipsValue`),
      drawer: t(`${K}.server.drawer`),
      drawerValue: t(`${K}.server.drawerValue`),
      back: t(`${K}.move.back`),
      confirm: t(`${K}.server.confirm`),
      done: t(`${K}.server.done`),
    },
    split: {
      title: t(`${K}.split.title`),
      subtitle: t(`${K}.split.subtitle`),
      loading: t(`${K}.split.loading`),
      unreadable: t(`${K}.split.unreadable`),
      empty: t(`${K}.split.empty`),
      check: t(`${K}.split.check`),
      unpaid: t(`${K}.split.unpaid`),
      items: t(`${K}.split.items`),
      remaining: t(`${K}.split.remaining`),
      selected: t(`${K}.split.selected`),
      moveToNew: t(`${K}.split.moveToNew`),
      moving: t(`${K}.split.moving`),
      note: t(`${K}.split.note`),
      back: t(`${K}.move.back`),
      collect: t(`${K}.split.collect`),
      done: t(`${K}.split.done`),
    },
    popover: {
      checks: t(`${K}.popover.checks`),
      openCheck: t(`${K}.popover.openCheck`),
      servedBy: t(`${K}.popover.servedBy`),
      serverNone: t(`${K}.list.serverNone`),
    },
    changeJoinReason: t(`${K}.change.joinReason`),
  };
}

/** The engine's table-operation codes as sentences, merged into the board's refusal table. */
export function floorEngineRefusals(t: Translator): Readonly<Record<"space_occupied" | "lines_paid" | "conflict", string>> {
  return {
    space_occupied: t(`${E}.space_occupied`),
    lines_paid: t(`${E}.lines_paid`),
    conflict: t(`${E}.conflict`),
  };
}
