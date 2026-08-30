import { pickLocale } from "@/lib/i18n/pick-locale";

const en = {
  launcherAria: "Ask a question",
  panelTitle: "Ask Tulala",
  panelSubtitle: "Product questions. A person if you need one.",
  composerPlaceholder: "Ask about plans, features, or how to start",
  send: "Send",
  newChat: "New question",
  emptyHome: "Ask anything about Tulala. We answer first.",
  emailPrompt:
    "Want this answer by email, to keep the thread, or to talk to Oran? Leave an email.",
  emailLabel: "Email",
  nameLabel: "Name (optional)",
  saveEmail: "Save email",
  emailConsent: "We'll use this only to continue this conversation. You can unsubscribe from any email.",
  askHuman: "Talk to Oran",
  contactTitle: "Contact us",
  contactBody: "Write to the team. This goes to a person, not the chat bot.",
  topicLabel: "Topic",
  topicProduct: "Product question",
  topicPricing: "Pricing",
  topicDemo: "Demo or walkthrough",
  topicOther: "Something else",
  messageLabel: "Message",
  phoneLabel: "Phone (optional)",
  submit: "Send message",
  submitting: "Sending…",
  successTitle: "Got it",
  successBody: "We have your message. Oran will reply by email.",
  askAQuestion: "Ask a question",
  close: "Close",
};

export type MarketingSupportCopy = typeof en;

const es: MarketingSupportCopy = {
  launcherAria: "Haz una pregunta",
  panelTitle: "Pregunta a Tulala",
  panelSubtitle: "Preguntas de producto. Una persona si la necesitas.",
  composerPlaceholder: "Pregunta por planes, funciones o como empezar",
  send: "Enviar",
  newChat: "Nueva pregunta",
  emptyHome: "Pregunta lo que quieras sobre Tulala. Primero respondemos.",
  emailPrompt:
    "Quieres esta respuesta por email, guardar el hilo, o hablar con Oran? Deja un email.",
  emailLabel: "Email",
  nameLabel: "Nombre (opcional)",
  saveEmail: "Guardar email",
  emailConsent: "Solo usamos esto para seguir esta conversacion. Puedes cancelar el email cuando quieras.",
  askHuman: "Hablar con Oran",
  contactTitle: "Contacto",
  contactBody: "Escribe al equipo. Esto llega a una persona, no al chat.",
  topicLabel: "Tema",
  topicProduct: "Pregunta de producto",
  topicPricing: "Precios",
  topicDemo: "Demo o recorrido",
  topicOther: "Otra cosa",
  messageLabel: "Mensaje",
  phoneLabel: "Telefono (opcional)",
  submit: "Enviar mensaje",
  submitting: "Enviando…",
  successTitle: "Listo",
  successBody: "Tenemos tu mensaje. Oran responde por email.",
  askAQuestion: "Haz una pregunta",
  close: "Cerrar",
};

export function getMarketingSupportCopy(locale: string): MarketingSupportCopy {
  return pickLocale(locale, { en, es });
}

export const TULALA_SUPPORT_OPEN_EVENT = "tulala:support:open";

export function openMarketingSupport(ticketId?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TULALA_SUPPORT_OPEN_EVENT, { detail: { ticketId } }));
}
