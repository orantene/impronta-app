/**
 * Bilingual copy for the talent registration modal (platform + tenant-branded
 * variants). Split out of `talent-register-modal.tsx` to keep that file under
 * the max-lines cap; also makes the ES strings reviewable on their own.
 */
import { pickLocale } from "@/lib/i18n/pick-locale";

export type TalentModalCopy = {
  close: string;
  trustFree: string;
  trustNoCard: string;
  trustSetup: string;
  haveAccount: string;
  haveTenantAccount: (brand: string) => string;
  signIn: string;
  signInToApply: string;
  joinRoster: string;
  applyTo: string;
  join: string;
  applySignedIn: (brand: string) => string;
  joinSub: (brand: string) => string;
  platformEyebrow: string;
  platformTitle: string;
  platformAccent: string;
  platformSub: string;
  joined: (name: string) => string;
  requestSent: string;
  joinedSub: (brand: string) => string;
  requestSentSub: (name: string) => string;
  gotIt: string;
  sendingRequest: string;
  applyCta: (name: string) => string;
  applyingAs: (brand: string) => string;
  orEmail: string;
  email: string;
  emailPlaceholder: string;
  password: string;
  passwordHint: string;
  creating: string;
  createCta: string;
  google: string;
  googleOpening: string;
  googleFailed: string;
  popupBlocked: string;
  checkInbox: string;
};

export function getTalentModalCopy(locale: string): TalentModalCopy {
  return pickLocale(locale, {
    en: {
      close: "Close",
      trustFree: "Free forever",
      trustNoCard: "No credit card",
      trustSetup: "2-min setup",
      haveAccount: "Already have an account? ",
      haveTenantAccount: (brand) => `Already have a ${brand} account? `,
      signIn: "Sign in",
      signInToApply: "Sign in to apply",
      joinRoster: "Join the roster",
      applyTo: "Apply to",
      join: "Join",
      applySignedIn: (brand) =>
        `You're signed in to ${brand}. Send your request in one tap.`,
      joinSub: (brand) =>
        `Create your free ${brand} talent profile and request to join the roster.`,
      platformEyebrow: "Join as talent · free",
      platformTitle: "Your talent page,",
      platformAccent: "live in minutes.",
      platformSub:
        "Show your work, share one link, and let bookings come to you.",
      joined: (name) => `You've joined ${name}`,
      requestSent: "Request sent",
      joinedSub: (brand) =>
        `You're on the roster. Manage your work from your ${brand} dashboard.`,
      requestSentSub: (name) =>
        `${name} will review your application and be in touch.`,
      gotIt: "Got it",
      sendingRequest: "Sending your request…",
      applyCta: (name) => `Apply to ${name}`,
      applyingAs: (brand) => `Applying as your signed-in ${brand} account.`,
      orEmail: "or with email",
      email: "Email",
      emailPlaceholder: "you@studio.com",
      password: "Password",
      passwordHint: "At least 8 characters",
      creating: "Creating your account…",
      createCta: "Create my talent page",
      google: "Continue with Google",
      googleOpening: "Opening Google…",
      googleFailed: "Google sign-in failed.",
      popupBlocked: "Popup blocked. Allow popups and try again.",
      checkInbox: "Check your inbox",
    },
    es: {
      close: "Cerrar",
      trustFree: "Gratis para siempre",
      trustNoCard: "Sin tarjeta",
      trustSetup: "Listo en 2 minutos",
      haveAccount: "¿Ya tienes una cuenta? ",
      haveTenantAccount: (brand) => `¿Ya tienes una cuenta de ${brand}? `,
      signIn: "Inicia sesión",
      signInToApply: "Inicia sesión para postularte",
      joinRoster: "Únete al roster",
      applyTo: "Postúlate a",
      join: "Únete a",
      applySignedIn: (brand) =>
        `Tienes sesión iniciada en ${brand}. Envía tu solicitud en un toque.`,
      joinSub: (brand) =>
        `Crea tu perfil de talento gratis en ${brand} y solicita unirte al roster.`,
      platformEyebrow: "Únete como talento · gratis",
      platformTitle: "Tu página de talento,",
      platformAccent: "lista en minutos.",
      platformSub:
        "Muestra tu trabajo, comparte un solo enlace y deja que las reservas lleguen a ti.",
      joined: (name) => `Te uniste a ${name}`,
      requestSent: "Solicitud enviada",
      joinedSub: (brand) =>
        `Ya estás en el roster. Gestiona tu trabajo desde tu panel de ${brand}.`,
      requestSentSub: (name) =>
        `${name} revisará tu solicitud y se pondrá en contacto contigo.`,
      gotIt: "Entendido",
      sendingRequest: "Enviando tu solicitud…",
      applyCta: (name) => `Postularme a ${name}`,
      applyingAs: (brand) => `Te postulas con tu cuenta de ${brand}.`,
      orEmail: "o con correo",
      email: "Correo",
      emailPlaceholder: "tu@estudio.com",
      password: "Contraseña",
      passwordHint: "Mínimo 8 caracteres",
      creating: "Creando tu cuenta…",
      createCta: "Crear mi página de talento",
      google: "Continuar con Google",
      googleOpening: "Abriendo Google…",
      googleFailed: "Error al iniciar sesión con Google.",
      popupBlocked: "Popup bloqueado. Permite popups e inténtalo de nuevo.",
      checkInbox: "Revisa tu correo",
    },
  });
}
