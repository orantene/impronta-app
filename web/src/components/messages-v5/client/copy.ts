/**
 * L9: copy for the client link thread (boards C01/C02), under
 * `dashboard.messagesV5.client.link.*` (the `client.*` root is the staff
 * "Edit client" sheet, D15; `link` is the client's own surface). Keys are
 * literals so `message-key-usage.static.test.ts` sees every reader.
 *
 * House rules: no em dashes, "client" never "customer", USD. Refusals are
 * the catalogue sentences the kit already exposes (`KitCopy.refusal`).
 */

import type { Translator } from "@/i18n/interpolate";

export type ClientCopy = ReturnType<typeof buildClientCopy>;

export function buildClientCopy(t: Translator) {
  return {
    header: {
      handling: t("dashboard.messagesV5.client.link.header.handling"),
      handlingTeam: t("dashboard.messagesV5.client.link.header.handlingTeam"),
    },
    stream: {
      you: t("dashboard.messagesV5.client.link.stream.you"),
      today: t("dashboard.messagesV5.client.link.stream.today"),
      yesterday: t("dashboard.messagesV5.client.link.stream.yesterday"),
      emptyTitle: t("dashboard.messagesV5.client.link.stream.emptyTitle"),
      emptyBody: t("dashboard.messagesV5.client.link.stream.emptyBody"),
      loading: t("dashboard.messagesV5.client.link.stream.loading"),
    },
    composer: {
      placeholder: t("dashboard.messagesV5.client.link.composer.placeholder"),
      send: t("dashboard.messagesV5.client.link.composer.send"),
      sending: t("dashboard.messagesV5.client.link.composer.sending"),
      failed: t("dashboard.messagesV5.client.link.composer.failed"),
      retry: t("dashboard.messagesV5.client.link.composer.retry"),
      sent: t("dashboard.messagesV5.client.link.composer.sent"),
    },
    footer: {
      secure: t("dashboard.messagesV5.client.link.footer.secure"),
      saveToEmail: t("dashboard.messagesV5.client.link.footer.saveToEmail"),
      saveToEmailSoon: t("dashboard.messagesV5.client.link.footer.saveToEmailSoon"),
      expires: t("dashboard.messagesV5.client.link.footer.expires"),
    },
    choices: {
      cat: t("dashboard.messagesV5.client.link.choices.cat"),
      title: t("dashboard.messagesV5.client.link.choices.title"),
      hint: t("dashboard.messagesV5.client.link.choices.hint"),
      chosenCount: t("dashboard.messagesV5.client.link.choices.chosenCount"),
      send: t("dashboard.messagesV5.client.link.choices.send"),
      sending: t("dashboard.messagesV5.client.link.choices.sending"),
      sentTitle: t("dashboard.messagesV5.client.link.choices.sentTitle"),
      sentBody: t("dashboard.messagesV5.client.link.choices.sentBody"),
      addMore: t("dashboard.messagesV5.client.link.choices.addMore"),
      noOptions: t("dashboard.messagesV5.client.link.choices.noOptions"),
      closed: t("dashboard.messagesV5.client.link.choices.closed"),
    },
    times: {
      cat: t("dashboard.messagesV5.client.link.times.cat"),
      title: t("dashboard.messagesV5.client.link.times.title"),
      titleWith: t("dashboard.messagesV5.client.link.times.titleWith"),
      hint: t("dashboard.messagesV5.client.link.times.hint"),
      pick: t("dashboard.messagesV5.client.link.times.pick"),
      holding: t("dashboard.messagesV5.client.link.times.holding"),
      held: t("dashboard.messagesV5.client.link.times.held"),
      heldNoClock: t("dashboard.messagesV5.client.link.times.heldNoClock"),
      holdEnded: t("dashboard.messagesV5.client.link.times.holdEnded"),
      pickAnother: t("public.guestChat.timesPickAnother"),
      ask: t("public.guestChat.catalogAsk"),
      askPrefill: t("public.guestChat.timesAskPrefill"),
      taken: t("dashboard.messagesV5.client.link.times.taken"),
      noSlots: t("dashboard.messagesV5.client.link.times.noSlots"),
    },
    offer: {
      cat: t("dashboard.messagesV5.client.link.offer.cat"),
      title: t("dashboard.messagesV5.client.link.offer.title"),
      version: t("dashboard.messagesV5.client.link.offer.version"),
      total: t("dashboard.messagesV5.client.link.offer.total"),
      depositLine: t("dashboard.messagesV5.client.link.offer.depositLine"),
      depositPct: t("dashboard.messagesV5.client.link.offer.depositPct"),
      refund: {
        tiered: t("dashboard.messagesV5.client.link.offer.refund.tiered"),
        flexible: t("dashboard.messagesV5.client.link.offer.refund.flexible"),
        strict: t("dashboard.messagesV5.client.link.offer.refund.strict"),
        manual: t("dashboard.messagesV5.client.link.offer.refund.manual"),
      },
      validUntil: t("dashboard.messagesV5.client.link.offer.validUntil"),
      acceptPay: t("dashboard.messagesV5.client.link.offer.acceptPay"),
      accept: t("dashboard.messagesV5.client.link.offer.accept"),
      accepting: t("dashboard.messagesV5.client.link.offer.accepting"),
      askChange: t("dashboard.messagesV5.client.link.offer.askChange"),
      decline: t("dashboard.messagesV5.client.link.offer.decline"),
      accepted: t("dashboard.messagesV5.client.link.offer.accepted"),
      acceptedPayNext: t("dashboard.messagesV5.client.link.offer.acceptedPayNext"),
      acceptedPayLater: t("dashboard.messagesV5.client.link.offer.acceptedPayLater"),
      declined: t("dashboard.messagesV5.client.link.offer.declined"),
      expired: t("dashboard.messagesV5.client.link.offer.expired"),
      superseded: t("dashboard.messagesV5.client.link.offer.superseded"),
      unitsSuffix: t("dashboard.messagesV5.client.link.offer.unitsSuffix"),
      note: t("dashboard.messagesV5.client.link.offer.note"),
    },
    change: {
      cat: t("dashboard.messagesV5.client.link.change.cat"),
      title: t("dashboard.messagesV5.client.link.change.title"),
      prompt: t("dashboard.messagesV5.client.link.change.prompt"),
      placeholder: t("dashboard.messagesV5.client.link.change.placeholder"),
      send: t("dashboard.messagesV5.client.link.change.send"),
      sending: t("dashboard.messagesV5.client.link.change.sending"),
      cancel: t("dashboard.messagesV5.client.link.change.cancel"),
      sent: t("dashboard.messagesV5.client.link.change.sent"),
      sentBody: t("dashboard.messagesV5.client.link.change.sentBody"),
      applied: t("dashboard.messagesV5.client.link.change.applied"),
      appliedBody: t("dashboard.messagesV5.client.link.change.appliedBody"),
      declined: t("dashboard.messagesV5.client.link.change.declined"),
      declinedBody: t("dashboard.messagesV5.client.link.change.declinedBody"),
    },
    decline: {
      prompt: t("dashboard.messagesV5.client.link.decline.prompt"),
      placeholder: t("dashboard.messagesV5.client.link.decline.placeholder"),
      confirm: t("dashboard.messagesV5.client.link.decline.confirm"),
      declining: t("dashboard.messagesV5.client.link.decline.declining"),
      cancel: t("dashboard.messagesV5.client.link.decline.cancel"),
    },
    pay: {
      cat: t("dashboard.messagesV5.client.link.pay.cat"),
      title: t("dashboard.messagesV5.client.link.pay.title"),
      deposit: t("dashboard.messagesV5.client.link.pay.deposit"),
      full: t("dashboard.messagesV5.client.link.pay.full"),
      pay: t("dashboard.messagesV5.client.link.pay.pay"),
      paid: t("dashboard.messagesV5.client.link.pay.paid"),
      expired: t("dashboard.messagesV5.client.link.pay.expired"),
      expiresAt: t("dashboard.messagesV5.client.link.pay.expiresAt"),
      keepSlot: t("dashboard.messagesV5.client.link.pay.keepSlot"),
      cancelled: t("dashboard.messagesV5.client.link.pay.cancelled"),
      cancelledPill: t("dashboard.messagesV5.client.link.pay.cancelledPill"),
    },
    tickets: {
      cat: t("dashboard.messagesV5.client.link.tickets.cat"),
      title: t("dashboard.messagesV5.client.link.tickets.title"),
      issued: t("dashboard.messagesV5.client.link.tickets.issued"),
      open: t("dashboard.messagesV5.client.link.tickets.open"),
      openHint: t("dashboard.messagesV5.client.link.tickets.openHint"),
      waitingCode: t("dashboard.messagesV5.client.link.tickets.waitingCode"),
      cancelled: t("dashboard.messagesV5.client.link.tickets.cancelled"),
      cancelledPill: t("dashboard.messagesV5.client.link.tickets.cancelledPill"),
    },
    cancel: {
      cat: t("dashboard.messagesV5.client.link.cancel.cat"),
      title: t("dashboard.messagesV5.client.link.cancel.title"),
      pill: t("dashboard.messagesV5.client.link.cancel.pill"),
      refunded: t("dashboard.messagesV5.client.link.cancel.refunded"),
      noRefund: t("dashboard.messagesV5.client.link.cancel.noRefund"),
      refundOnly: t("dashboard.messagesV5.client.link.cancel.refundOnly"),
    },
    confirmed: {
      catBooking: t("dashboard.messagesV5.client.link.confirmed.catBooking"),
      catOrder: t("dashboard.messagesV5.client.link.confirmed.catOrder"),
      pill: t("dashboard.messagesV5.client.link.confirmed.pill"),
      when: t("dashboard.messagesV5.client.link.confirmed.when"),
      askChange: t("dashboard.messagesV5.client.link.confirmed.askChange"),
      receipt: t("dashboard.messagesV5.client.link.confirmed.receipt"),
      receiptSoon: t("dashboard.messagesV5.client.link.confirmed.receiptSoon"),
    },
    draft: {
      cat: t("dashboard.messagesV5.client.link.draft.cat"),
      title: t("dashboard.messagesV5.client.link.draft.title"),
      hint: t("dashboard.messagesV5.client.link.draft.hint"),
    },
    generic: {
      message: t("dashboard.messagesV5.client.link.generic.message"),
    },
  };
}
