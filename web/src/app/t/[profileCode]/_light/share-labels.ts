/** The share row's labels, read from the message catalog (TUL-707, TUL-736). */
export function buildShareLabels(t: (key: string) => string) {
  return {
    heading: t("public.profile.share.heading"),
    copyLink: t("public.profile.share.copyLink"),
    copyLinkDone: t("public.profile.share.copyLinkDone"),
    whatsappTemplate: t("public.profile.share.whatsappTemplate"),
    shareWhatsapp: t("public.profile.share.shareWhatsapp"),
    shareX: t("public.profile.share.shareX"),
    shareFacebook: t("public.profile.share.shareFacebook"),
    shareLinkedin: t("public.profile.share.shareLinkedin"),
    copyForInstagram: t("public.profile.share.copyForInstagram"),
    copiedForInstagram: t("public.profile.share.copiedForInstagram"),
    print: t("public.profile.share.print"),
    shareSystem: t("public.profile.share.shareSystem"),
  };
}
