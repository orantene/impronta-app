/** The "limit reached" helper line under the guest chat, in the visitor's language (QA F-12). */
export function guestChatLimitMessage(tier: string, locale: string | null | undefined): string {
  const es = locale === "es";
  if (tier === "account") {
    return es
      ? "Llegaste al límite de conversaciones abiertas. Cierra una para iniciar otra."
      : "You've reached your open-conversation limit. Wrap up or close one to start another.";
  }
  if (tier === "email_verified") {
    return es
      ? "Tienes varias conversaciones abiertas. Crea una cuenta gratis para iniciar más."
      : "You have a few conversations going. Create a free account to start more.";
  }
  return es
    ? "Ya tienes una conversación abierta. Verifica tu email para iniciar más."
    : "You have a conversation going. Verify your email to start more.";
}
