import type { Translator } from "@/components/admin/pos/translator";

import type { ConversationState, InboxFilter, OpportunityState } from "@/lib/messaging/types";

export function messagesCopy(t: Translator) {
  return {
    title: t("dashboard.pos.messages.title"),
    inbox: t("dashboard.pos.messages.inbox"),
    thread: t("dashboard.pos.messages.thread"),
    search: t("dashboard.pos.messages.search"),
    reply: t("dashboard.pos.messages.reply"),
    note: t("dashboard.pos.messages.note"),
    assign: t("dashboard.pos.messages.assign"),
    resolve: t("dashboard.pos.messages.resolve"),
    reopen: t("dashboard.pos.messages.reopen"),
    handOver: t("dashboard.pos.messages.handOver"),
    sendOptions: t("dashboard.pos.messages.sendOptions"),
    addToDraft: t("dashboard.pos.messages.addToDraft"),
    requestPayment: t("dashboard.pos.messages.requestPayment"),
    collectHere: t("dashboard.pos.messages.collectHere"),
    closeLost: t("dashboard.pos.messages.closeLost"),
    remind: t("dashboard.pos.messages.remind"),
    newConversation: t("dashboard.pos.messages.newConversation"),
    customerTab: t("dashboard.pos.messages.tabCustomer"),
    linkedTab: t("dashboard.pos.messages.tabLinked"),
    notesTab: t("dashboard.pos.messages.tabNotes"),
    empty: t("dashboard.pos.messages.empty"),
    noResults: t("dashboard.pos.messages.noResults"),
    failedLoad: t("dashboard.pos.messages.failedLoad"),
    toastIncoming: t("dashboard.pos.messages.toastIncoming"),
    backToSale: t("dashboard.pos.messages.backToSale"),
    deposit: t("dashboard.pos.messages.deposit"),
    full: t("dashboard.pos.messages.full"),
    none: t("dashboard.pos.messages.none"),
    webChatOnlyCustomer: t("dashboard.pos.messages.webChatOnlyCustomer"),
    whatsappNeedsTemplate: t("dashboard.pos.messages.whatsappNeedsTemplate"),
    draftKept: t("dashboard.pos.messages.draftKept"),
    filter: {
      all: t("dashboard.pos.messages.filter.all"),
      unread: t("dashboard.pos.messages.filter.unread"),
      unassigned: t("dashboard.pos.messages.filter.unassigned"),
      mine: t("dashboard.pos.messages.filter.mine"),
      needs_reply: t("dashboard.pos.messages.filter.needsReply"),
      awaiting_customer: t("dashboard.pos.messages.filter.awaitingCustomer"),
      resolved: t("dashboard.pos.messages.filter.resolved"),
    } satisfies Record<InboxFilter, string>,
    conversation: {
      needs_reply: t("dashboard.pos.messages.state.needsReply"),
      awaiting_customer: t("dashboard.pos.messages.state.awaitingCustomer"),
      resolved: t("dashboard.pos.messages.state.resolved"),
    } satisfies Record<ConversationState, string>,
    opportunity: {
      gathering: t("dashboard.pos.messages.state.gathering"),
      offer_sent: t("dashboard.pos.messages.state.offerSent"),
      awaiting_acceptance: t("dashboard.pos.messages.state.awaitingAcceptance"),
      accepted_awaiting_deposit: t("dashboard.pos.messages.state.acceptedAwaitingDeposit"),
      won: t("dashboard.pos.messages.state.won"),
      lost: t("dashboard.pos.messages.state.lost"),
    } satisfies Record<OpportunityState, string>,
    refusal: (code: string) => t(`dashboard.pos.messages.refusal.${code}`),
  };
}

export function pinMessagingKeys(t: Translator): void {
  t("dashboard.pos.messages.title");
  t("dashboard.pos.messages.inbox");
  t("dashboard.pos.messages.thread");
  t("dashboard.pos.messages.search");
  t("dashboard.pos.messages.reply");
  t("dashboard.pos.messages.note");
  t("dashboard.pos.messages.assign");
  t("dashboard.pos.messages.resolve");
  t("dashboard.pos.messages.reopen");
  t("dashboard.pos.messages.handOver");
  t("dashboard.pos.messages.sendOptions");
  t("dashboard.pos.messages.addToDraft");
  t("dashboard.pos.messages.requestPayment");
  t("dashboard.pos.messages.collectHere");
  t("dashboard.pos.messages.closeLost");
  t("dashboard.pos.messages.remind");
  t("dashboard.pos.messages.newConversation");
  t("dashboard.pos.messages.tabCustomer");
  t("dashboard.pos.messages.tabLinked");
  t("dashboard.pos.messages.tabNotes");
  t("dashboard.pos.messages.empty");
  t("dashboard.pos.messages.noResults");
  t("dashboard.pos.messages.failedLoad");
  t("dashboard.pos.messages.toastIncoming");
  t("dashboard.pos.messages.backToSale");
  t("dashboard.pos.messages.deposit");
  t("dashboard.pos.messages.full");
  t("dashboard.pos.messages.none");
  t("dashboard.pos.messages.webChatOnlyCustomer");
  t("dashboard.pos.messages.whatsappNeedsTemplate");
  t("dashboard.pos.messages.draftKept");
  t("dashboard.pos.messages.filter.all");
  t("dashboard.pos.messages.filter.unread");
  t("dashboard.pos.messages.filter.unassigned");
  t("dashboard.pos.messages.filter.mine");
  t("dashboard.pos.messages.filter.needsReply");
  t("dashboard.pos.messages.filter.awaitingCustomer");
  t("dashboard.pos.messages.filter.resolved");
  t("dashboard.pos.messages.state.needsReply");
  t("dashboard.pos.messages.state.awaitingCustomer");
  t("dashboard.pos.messages.state.resolved");
  t("dashboard.pos.messages.state.gathering");
  t("dashboard.pos.messages.state.offerSent");
  t("dashboard.pos.messages.state.awaitingAcceptance");
  t("dashboard.pos.messages.state.acceptedAwaitingDeposit");
  t("dashboard.pos.messages.state.won");
  t("dashboard.pos.messages.state.lost");
  t("dashboard.pos.messages.refusal.conflict");
  t("dashboard.pos.messages.refusal.not_found");
  t("dashboard.pos.messages.refusal.wrong_tenant");
  t("dashboard.pos.messages.refusal.invalid");
  t("dashboard.pos.messages.refusal.unavailable");
  t("dashboard.pos.messages.refusal.channel_unavailable");
  t("dashboard.pos.messages.refusal.template_required");
  t("dashboard.pos.messages.refusal.rate_limited");
  t("dashboard.pos.messages.refusal.checkout_locked");
  t("dashboard.pos.messages.refusal.already_resolved");
  t("dashboard.pos.messages.refusal.no_owner");
  t("dashboard.pos.messages.refusal.identity_unconfirmed");
  t("dashboard.pos.messages.refusal.already_linked");
  t("dashboard.pos.messages.refusal.version_stale");
  t("dashboard.pos.messages.refusal.payment_unknown");
  t("dashboard.pos.messages.refusal.already_paid");
  t("dashboard.pos.messages.refusal.hold_ended");
  t("dashboard.pos.messages.refusal.basket_changed");
  t("dashboard.pos.messages.refusal.not_allowed");
  t("dashboard.pos.messages.refusal.expired");
  t("dashboard.pos.messages.refusal.already");
  t("public.thread.title");
  t("public.thread.continue");
  t("public.thread.pay");
  t("public.thread.empty");
  t("public.thread.codeSent");
}
