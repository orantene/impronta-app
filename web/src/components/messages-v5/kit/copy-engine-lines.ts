import type { Translator } from "@/i18n/interpolate";

/** TUL-379: engine system lines (stored English) mapped to dashboard copy. */
export function buildEngineLinesCopy(t: Translator) {
  return {
    allApprovals: t("dashboard.messagesV5.engineLines.allApprovals"),
    offerReopened: t("dashboard.messagesV5.engineLines.offerReopened"),
    offerRejected: t("dashboard.messagesV5.engineLines.offerRejected"),
    converted: t("dashboard.messagesV5.engineLines.converted"),
    cancelled: t("dashboard.messagesV5.engineLines.cancelled"),
    expired: t("dashboard.messagesV5.engineLines.expired"),
    paused: t("dashboard.messagesV5.engineLines.paused"),
    talentDeclined: t("dashboard.messagesV5.engineLines.talentDeclined"),
    talentSwapped: t("dashboard.messagesV5.engineLines.talentSwapped"),
    coordAccepted: t("dashboard.messagesV5.engineLines.coordAccepted"),
    coordDeclined: t("dashboard.messagesV5.engineLines.coordDeclined"),
    counterStarted: t("dashboard.messagesV5.engineLines.counterStarted"),
    coordinating: t("dashboard.messagesV5.engineLines.coordinating"),
    notCoordinating: t("dashboard.messagesV5.engineLines.notCoordinating"),
    approved: t("dashboard.messagesV5.engineLines.approved"),
  };
}
