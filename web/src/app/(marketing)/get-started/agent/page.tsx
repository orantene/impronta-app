/**
 * /get-started/agent — the Tulala Agent conversation.
 *
 * A full route rather than a modal over the pricing page. A 10-to-20 turn
 * conversation needs the whole viewport on a phone, needs the back button to
 * mean something, and needs the "What I know" rail to have somewhere to live.
 * A dialog gets all three wrong, and gets them wrong worst on mobile, which is
 * where most of this traffic is.
 *
 * When the flag is off this redirects to the classic form rather than showing an
 * error. The form still works; a visitor should never learn that a feature
 * exists by being told it is unavailable.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { isResolvedAiChatConfigured } from "@/lib/ai/resolve-provider";
import { getRequestLocale } from "@/i18n/request-locale";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { TulalaAgentChat, type AgentChatCopy } from "@/components/tulala/agent-chat";
import { TulalaAgentChrome } from "@/components/tulala/agent-chrome";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, {
      en: "Talk to the Tulala Agent",
      es: "Habla con el Agente Tulala",
    }),
    description: pickLocale(locale, {
      en: "Tell us what you do. We work out what you need and set it up.",
      es: "Cuéntanos a qué te dedicas. Nosotros vemos qué necesitas y lo preparamos.",
    }),
    // Not indexed: it is an application surface, and the marketing page at
    // /get-started is the one that should rank.
    robots: { index: false, follow: true },
  };
}

const COPY: Record<"en" | "es", AgentChatCopy> = {
  en: {
    opening:
      "I set people up on Tulala. Tell me what you do today, and what you would like to build. You can also paste your website or Instagram.",
    placeholder: "Type, dictate, or paste a link",
    send: "Send",
    thinking: "Thinking",
    learnedTitle: "Noted",
    emailOfferTitle: "Save this",
    emailOfferBody:
      "Leave your email and everything we have worked out stays with you, whether you finish now or come back later.",
    emailPlaceholder: "you@example.com",
    emailSave: "Save my brief",
    reviewCta: "See what I would suggest",
    errorGeneric: "That did not go through. Try again?",
    restart: "Start over",
    importReading: "Reading {host}.",
    importFailed: "I could not open that page. Is it public?",
    importCard: {
      title: "From {host}",
      body: "I pulled these from your page. Keep what is still true, discard what is not.",
      keep: "Keep",
      discard: "Discard",
      save: "Looks right",
      saving: "Saving",
      saved: "Saved",
      allDiscarded: "Nothing kept. That is fine.",
    },
  },
  es: {
    opening:
      "Ayudo a la gente a empezar en Tulala. Cuéntame a qué te dedicas hoy y qué te gustaría construir. También puedes pegar tu sitio o Instagram.",
    placeholder: "Escribe, dicta o pega un enlace",
    send: "Enviar",
    thinking: "Pensando",
    learnedTitle: "Anotado",
    emailOfferTitle: "Guarda esto",
    emailOfferBody:
      "Déjanos tu correo y todo lo que hemos entendido se queda contigo, termines ahora o vuelvas más tarde.",
    emailPlaceholder: "tu@ejemplo.com",
    emailSave: "Guardar mi brief",
    reviewCta: "Ver qué recomiendo",
    errorGeneric: "Eso no se envió. ¿Lo intentamos otra vez?",
    restart: "Empezar de nuevo",
    importReading: "Leyendo {host}.",
    importFailed: "No pude abrir esa página. ¿Es pública?",
    importCard: {
      title: "De {host}",
      body: "Saqué esto de tu página. Quédate con lo que sigue siendo cierto, descarta lo que no.",
      keep: "Quedar",
      discard: "Descartar",
      save: "Está bien",
      saving: "Guardando",
      saved: "Guardado",
      allDiscarded: "No se guardó nada. Está bien.",
    },
  },
};

export default async function TulalaAgentPage() {
  const flags = await getAiFeatureFlags();
  if (!flags.ai_master_enabled || !flags.ai_tulala_agent_enabled) {
    redirect("/get-started");
  }
  if (!(await isResolvedAiChatConfigured())) {
    redirect("/get-started");
  }

  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  const session = await getCachedActorSession();
  const copy = COPY[locale];

  return (
    <TulalaAgentChrome locale={locale}>
      <TulalaAgentChat locale={locale} copy={copy} isAuthenticated={Boolean(session.user)} />
    </TulalaAgentChrome>
  );
}
