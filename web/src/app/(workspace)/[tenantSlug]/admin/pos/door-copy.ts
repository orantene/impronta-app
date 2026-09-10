/**
 * door-copy.ts — the Door mode's copy, built from a translator once per
 * render, the same way `pos-copy.ts` builds the counter's.
 *
 * Every key is a literal string so `message-key-usage.static.test.ts` can see
 * each call site; a key built from a template would be invisible to that
 * guard rather than checked by it. The verdict sentences are keyed by
 * `DoorVerdictKey` so an outcome the engine gains without a sentence here is
 * a compile error at this map, not an English literal on a tablet.
 */

import type { Translator } from "@/components/admin/pos";
import type { DoorVerdictKey } from "@/lib/pos/door-model";

export type DoorCopy = {
  readonly rail: Readonly<Record<string, string>>;
  readonly railLabel: string;
  readonly title: string;
  readonly clock: string;
  readonly tonight: string;
  readonly comingUp: string;
  readonly noSessions: string;
  readonly loading: string;
  readonly loadFailed: string;
  readonly counts: { admitted: string; expected: string; capacity: string; noPool: string };
  readonly pickSession: string;
  readonly changeSession: string;
  readonly scan: { label: string; placeholder: string; submit: string; ready: string };
  readonly verdict: Readonly<Record<DoorVerdictKey, string>>;
  readonly list: {
    title: string;
    search: string;
    searchPlaceholder: string;
    empty: string;
    noMatch: string;
    walkUp: string;
    party: string;
    ticket: string;
    in: string;
    partial: string;
    notYet: string;
    noShow: string;
    admit: string;
    admitMany: string;
    statusVoid: string;
    statusRefunded: string;
  };
  readonly sell: {
    gateTitle: string;
    boxTitle: string;
    boxIntro: string;
    session: string;
    tier: string;
    tierNoPool: string;
    noTiers: string;
    holderName: string;
    holderNamePlaceholder: string;
    email: string;
    phone: string;
    contactHint: string;
    open: string;
    cancel: string;
    collectGate: string;
    collectBox: string;
    openedFor: string;
    issued: string;
    issuedMany: string;
    code: string;
    codeUnavailable: string;
    receipt: string;
    next: string;
    admittedNow: string;
    cashOnly: string;
  };
  readonly noScanOut: string;
};

export function doorCopy(t: Translator): DoorCopy {
  return {
    rail: {
      checkin: t("dashboard.pos.door.rail.checkin"),
      tickets: t("dashboard.pos.door.rail.tickets"),
    },
    railLabel: t("dashboard.pos.door.rail.label"),
    title: t("dashboard.pos.door.title"),
    clock: t("dashboard.pos.door.clock"),
    tonight: t("dashboard.pos.door.tonight"),
    comingUp: t("dashboard.pos.door.comingUp"),
    noSessions: t("dashboard.pos.door.noSessions"),
    loading: t("dashboard.pos.door.loading"),
    loadFailed: t("dashboard.pos.door.loadFailed"),
    counts: {
      admitted: t("dashboard.pos.door.counts.admitted"),
      expected: t("dashboard.pos.door.counts.expected"),
      capacity: t("dashboard.pos.door.counts.capacity"),
      noPool: t("dashboard.pos.door.counts.noPool"),
    },
    pickSession: t("dashboard.pos.door.pickSession"),
    changeSession: t("dashboard.pos.door.changeSession"),
    scan: {
      label: t("dashboard.pos.door.scan.label"),
      placeholder: t("dashboard.pos.door.scan.placeholder"),
      submit: t("dashboard.pos.door.scan.submit"),
      ready: t("dashboard.pos.door.scan.ready"),
    },
    verdict: {
      admitted: t("dashboard.pos.door.verdict.admitted"),
      admittedParty: t("dashboard.pos.door.verdict.admittedParty"),
      admittedWasNoShow: t("dashboard.pos.door.verdict.admittedWasNoShow"),
      alreadyIn: t("dashboard.pos.door.verdict.alreadyIn"),
      superseded: t("dashboard.pos.door.verdict.superseded"),
      wrongNightDated: t("dashboard.pos.door.verdict.wrongNightDated"),
      wrongNight: t("dashboard.pos.door.verdict.wrongNight"),
      refunded: t("dashboard.pos.door.verdict.refunded"),
      cancelled: t("dashboard.pos.door.verdict.cancelled"),
      forged: t("dashboard.pos.door.verdict.forged"),
      unknown: t("dashboard.pos.door.verdict.unknown"),
      tooMany: t("dashboard.pos.door.verdict.tooMany"),
      misconfigured: t("dashboard.pos.door.verdict.misconfigured"),
      engineError: t("dashboard.pos.door.verdict.engineError"),
    },
    list: {
      title: t("dashboard.pos.door.list.title"),
      search: t("dashboard.pos.door.list.search"),
      searchPlaceholder: t("dashboard.pos.door.list.searchPlaceholder"),
      empty: t("dashboard.pos.door.list.empty"),
      noMatch: t("dashboard.pos.door.list.noMatch"),
      walkUp: t("dashboard.pos.door.list.walkUp"),
      party: t("dashboard.pos.door.list.party"),
      ticket: t("dashboard.pos.door.list.ticket"),
      in: t("dashboard.pos.door.list.in"),
      partial: t("dashboard.pos.door.list.partial"),
      notYet: t("dashboard.pos.door.list.notYet"),
      noShow: t("dashboard.pos.door.list.noShow"),
      admit: t("dashboard.pos.door.list.admit"),
      admitMany: t("dashboard.pos.door.list.admitMany"),
      statusVoid: t("dashboard.pos.door.list.status.void"),
      statusRefunded: t("dashboard.pos.door.list.status.refunded"),
    },
    sell: {
      gateTitle: t("dashboard.pos.door.sell.gateTitle"),
      boxTitle: t("dashboard.pos.door.sell.boxTitle"),
      boxIntro: t("dashboard.pos.door.sell.boxIntro"),
      session: t("dashboard.pos.door.sell.session"),
      tier: t("dashboard.pos.door.sell.tier"),
      tierNoPool: t("dashboard.pos.door.sell.tierNoPool"),
      noTiers: t("dashboard.pos.door.sell.noTiers"),
      holderName: t("dashboard.pos.door.sell.holderName"),
      holderNamePlaceholder: t("dashboard.pos.door.sell.holderNamePlaceholder"),
      email: t("dashboard.pos.door.sell.email"),
      phone: t("dashboard.pos.door.sell.phone"),
      contactHint: t("dashboard.pos.door.sell.contactHint"),
      open: t("dashboard.pos.door.sell.open"),
      cancel: t("dashboard.pos.door.sell.cancel"),
      collectGate: t("dashboard.pos.door.sell.collectGate"),
      collectBox: t("dashboard.pos.door.sell.collectBox"),
      openedFor: t("dashboard.pos.door.sell.openedFor"),
      issued: t("dashboard.pos.door.sell.issued"),
      issuedMany: t("dashboard.pos.door.sell.issuedMany"),
      code: t("dashboard.pos.door.sell.code"),
      codeUnavailable: t("dashboard.pos.door.sell.codeUnavailable"),
      receipt: t("dashboard.pos.door.sell.receipt"),
      next: t("dashboard.pos.door.sell.next"),
      admittedNow: t("dashboard.pos.door.sell.admittedNow"),
      cashOnly: t("dashboard.pos.door.sell.cashOnly"),
    },
    noScanOut: t("dashboard.pos.door.noScanOut"),
  };
}
