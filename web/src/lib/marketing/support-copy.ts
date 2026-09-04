import { SUPPORT_AGENT } from "@/lib/support/support-persona";

import { pickLocale } from "@/lib/i18n/pick-locale";

const en = {
  launcherAria: "Ask a question",
  panelTitle: "Ask Tulala",
  panelSubtitle: "Product questions. A person if you need one.",
  composerPlaceholder: "Ask about plans, features, or how to start",
  send: "Send",
  newChat: "New question",
  emptyHome: "Ask anything about Tulala. We answer first.",
  // The first screen used to be one sentence, a text box, and the visitor's own
  // past tickets rendered as unlabelled chips — so "I need help" (their own old
  // message) looked like a suggested question. On a phone that is most of the
  // screen doing nothing. These give the panel something to say.
  agentLine: `${SUPPORT_AGENT.name} answers here. Ask for a person any time.`,
  thinking: `${SUPPORT_AGENT.name} is looking this up`,
  startersHeading: "Common questions",
  threadsHeading: "Your conversations",
  starterPricing: "What does it cost?",
  starterDomain: "Can I use my own domain?",
  starterPayments: "How do bookings and payments work?",
  starterHuman: `Talk to ${SUPPORT_AGENT.name}`,
  // A signed-in customer with a broken booking does not need "what does it
  // cost". Same panel, different first screen.
  starterBroken: "Something is not working",
  starterBilling: "A question about my bill",
  starterAccount: "Change something on my account",
  composerPlaceholderSignedIn: "Describe what is happening",
  statusWaitingUs: "Waiting on us",
  statusWaitingYou: "Waiting on you",
  statusClosed: "Closed",
  emailPrompt:
    `Want this answer by email, to keep the thread, or to talk to ${SUPPORT_AGENT.name}? Leave an email.`,
  emailLabel: "Email",
  nameLabel: "Name (optional)",
  saveEmail: "Save email",
  emailConsent:
    "By leaving your email you agree we can send replies about this conversation. You can unsubscribe from any message. We delete unconverted chats after 90 days.",
  askHuman: `Talk to ${SUPPORT_AGENT.name}`,
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
  successBody: `We have your message. ${SUPPORT_AGENT.name} will reply by email.`,
  askAQuestion: "Ask a question",
  close: "Close",
  answerUnavailable: `We could not answer just now. Try again, or talk to ${SUPPORT_AGENT.name}.`,
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
  agentLine: `${SUPPORT_AGENT.name} responde aquí. Pide una persona cuando quieras.`,
  thinking: `${SUPPORT_AGENT.name} está buscando esto`,
  startersHeading: "Preguntas frecuentes",
  threadsHeading: "Tus conversaciones",
  starterPricing: "¿Cuánto cuesta?",
  starterDomain: "¿Puedo usar mi propio dominio?",
  starterPayments: "¿Cómo funcionan las reservas y los pagos?",
  starterHuman: `Hablar con ${SUPPORT_AGENT.name}`,
  starterBroken: "Algo no está funcionando",
  starterBilling: "Una pregunta sobre mi factura",
  starterAccount: "Cambiar algo de mi cuenta",
  composerPlaceholderSignedIn: "Cuéntanos qué está pasando",
  statusWaitingUs: "Pendiente de nosotros",
  statusWaitingYou: "Pendiente de ti",
  statusClosed: "Cerrada",
  emailPrompt:
    `Quieres esta respuesta por email, guardar el hilo, o hablar con ${SUPPORT_AGENT.name}? Deja un email.`,
  emailLabel: "Email",
  nameLabel: "Nombre (opcional)",
  saveEmail: "Guardar email",
  emailConsent:
    "Al dejar tu email aceptas que te enviemos respuestas sobre esta conversacion. Puedes cancelar el email cuando quieras. Borramos los chats no convertidos a los 90 dias.",
  askHuman: `Hablar con ${SUPPORT_AGENT.name}`,
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
  successBody: `Tenemos tu mensaje. ${SUPPORT_AGENT.name} responde por email.`,
  askAQuestion: "Haz una pregunta",
  close: "Cerrar",
  answerUnavailable: `No pudimos responder ahora. Intenta de nuevo, o habla con ${SUPPORT_AGENT.name}.`,
};

export function getMarketingSupportCopy(locale: string): MarketingSupportCopy {
  return pickLocale(locale, { en, es });
}

export const TULALA_SUPPORT_OPEN_EVENT = "tulala:support:open";

export function openMarketingSupport(ticketId?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TULALA_SUPPORT_OPEN_EVENT, { detail: { ticketId } }));
}
