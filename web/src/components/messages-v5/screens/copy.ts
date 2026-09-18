/**
 * Copy the shell and the thread screens read on top of the kit copy: every
 * string lives under `dashboard.messagesV5.shell.*` (EN/ES/FR). Keys are
 * literals so `message-key-usage.static.test.ts` can see every reader.
 * No em dashes, "client" never "customer", USD.
 */

import type { Translator } from "@/i18n/interpolate";

import { buildKitCopy, type KitCopy } from "../kit/copy";
import type { ShellActionId } from "./contracts";

export type ShellCopy = ReturnType<typeof buildShellCopy>;
export type ScreenCopy = { readonly kit: KitCopy; readonly shell: ShellCopy };

export function buildScreenCopy(t: Translator): ScreenCopy {
  return { kit: buildKitCopy(t), shell: buildShellCopy(t) };
}

export function buildShellCopy(t: Translator) {
  return {
    comingTitle: t("dashboard.messagesV5.shell.comingTitle"),
    comingBody: t("dashboard.messagesV5.shell.comingBody"),
    comingOk: t("dashboard.messagesV5.shell.comingOk"),
    noThreadTitle: t("dashboard.messagesV5.shell.noThreadTitle"),
    noThreadBody: t("dashboard.messagesV5.shell.noThreadBody"),
    loadingThread: t("dashboard.messagesV5.shell.loadingThread"),
    threadFailed: t("dashboard.messagesV5.shell.threadFailed"),
    tryAgain: t("dashboard.messagesV5.shell.tryAgain"),
    today: t("dashboard.messagesV5.shell.today"),
    yesterday: t("dashboard.messagesV5.shell.yesterday"),
    you: t("dashboard.messagesV5.shell.you"),
    client: t("dashboard.messagesV5.shell.client"),
    staff: t("dashboard.messagesV5.shell.staff"),
    systemPrefix: t("dashboard.messagesV5.shell.systemPrefix"),
    assignTitle: t("dashboard.messagesV5.shell.assignTitle"),
    assignHint: t("dashboard.messagesV5.shell.assignHint"),
    assignLoading: t("dashboard.messagesV5.shell.assignLoading"),
    assignEmpty: t("dashboard.messagesV5.shell.assignEmpty"),
    assignUnassign: t("dashboard.messagesV5.shell.assignUnassign"),
    assignSave: t("dashboard.messagesV5.shell.assignSave"),
    handoverTitle: t("dashboard.messagesV5.shell.handoverTitle"),
    handoverSave: t("dashboard.messagesV5.shell.handoverSave"),
    menuRename: t("dashboard.messagesV5.shell.menuRename"),
    menuHandover: t("dashboard.messagesV5.shell.menuHandover"),
    menuCopyLink: t("dashboard.messagesV5.shell.menuCopyLink"),
    menuHistory: t("dashboard.messagesV5.shell.menuHistory"),
    menuCloseLost: t("dashboard.messagesV5.shell.menuCloseLost"),
    moreTitle: t("dashboard.messagesV5.shell.moreTitle"),
    linkCopied: t("dashboard.messagesV5.shell.linkCopied"),
    linkTitle: t("dashboard.messagesV5.shell.linkTitle"),
    linkBody: t("dashboard.messagesV5.shell.linkBody"),
    copy: t("dashboard.messagesV5.shell.copy"),
    lostTitle: t("dashboard.messagesV5.shell.lostTitle"),
    lostReason: t("dashboard.messagesV5.shell.lostReason"),
    lostReasonPlaceholder: t("dashboard.messagesV5.shell.lostReasonPlaceholder"),
    lostConfirm: t("dashboard.messagesV5.shell.lostConfirm"),
    lostHint: t("dashboard.messagesV5.shell.lostHint"),
    viaTitle: t("dashboard.messagesV5.shell.viaTitle"),
    viaAlwaysOn: t("dashboard.messagesV5.shell.viaAlwaysOn"),
    viaNotConnected: t("dashboard.messagesV5.shell.viaNotConnected"),
    viaComing: t("dashboard.messagesV5.shell.viaComing"),
    viaEmail: t("dashboard.messagesV5.shell.viaEmail"),
    viaCounter: t("dashboard.messagesV5.shell.viaCounter"),
    attachTitle: t("dashboard.messagesV5.shell.attachTitle"),
    attachInternal: t("dashboard.messagesV5.shell.attachInternal"),
    attachInternalSub: t("dashboard.messagesV5.shell.attachInternalSub"),
    attachShared: t("dashboard.messagesV5.shell.attachShared"),
    attachSharedSub: t("dashboard.messagesV5.shell.attachSharedSub"),
    attachPick: t("dashboard.messagesV5.shell.attachPick"),
    attachDone: t("dashboard.messagesV5.shell.attachDone"),
    attachFailed: t("dashboard.messagesV5.shell.attachFailed"),
    voiceTitle: t("dashboard.messagesV5.shell.voiceTitle"),
    voiceBody: t("dashboard.messagesV5.shell.voiceBody"),
    voiceUnsupported: t("dashboard.messagesV5.shell.voiceUnsupported"),
    conflictReloaded: t("dashboard.messagesV5.shell.conflictReloaded"),
    sentOk: t("dashboard.messagesV5.shell.sentOk"),
    sentNotDelivered: t("dashboard.messagesV5.shell.sentNotDelivered"),
    noteOk: t("dashboard.messagesV5.shell.noteOk"),
    next: {
      reply: t("dashboard.messagesV5.shell.next.reply"),
      add_items: t("dashboard.messagesV5.shell.next.add_items"),
      create_offer: t("dashboard.messagesV5.shell.next.create_offer"),
      revise_offer: t("dashboard.messagesV5.shell.next.revise_offer"),
      request_payment: t("dashboard.messagesV5.shell.next.request_payment"),
      confirm: t("dashboard.messagesV5.shell.next.confirm"),
      capture_identity: t("dashboard.messagesV5.shell.next.capture_identity"),
      remind: t("dashboard.messagesV5.shell.next.remind"),
      reopen: t("dashboard.messagesV5.shell.next.reopen"),
      send_times: t("dashboard.messagesV5.shell.next.send_times"),
      follow_up: t("dashboard.messagesV5.shell.next.follow_up"),
    } satisfies Partial<Record<ShellActionId | "follow_up", string>>,
    newTitle: t("dashboard.messagesV5.shell.newTitle"),
    newName: t("dashboard.messagesV5.shell.newName"),
    newPhone: t("dashboard.messagesV5.shell.newPhone"),
    newEmail: t("dashboard.messagesV5.shell.newEmail"),
    newChannel: t("dashboard.messagesV5.shell.newChannel"),
    newFirst: t("dashboard.messagesV5.shell.newFirst"),
    newFirstPlaceholder: t("dashboard.messagesV5.shell.newFirstPlaceholder"),
    newStart: t("dashboard.messagesV5.shell.newStart"),
    newHint: t("dashboard.messagesV5.shell.newHint"),
    itemsTalent: t("dashboard.messagesV5.shell.itemsTalent"),
    itemsGeneric: t("dashboard.messagesV5.shell.itemsGeneric"),
    toastOpen: t("dashboard.messagesV5.shell.toastOpen"),
    toastNew: t("dashboard.messagesV5.shell.toastNew"),
  };
}
