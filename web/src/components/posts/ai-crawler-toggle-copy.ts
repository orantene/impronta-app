export type AiCrawlerToggleCopy = {
  label: string;
  info: string;
  saveFailed: string;
};

export const AI_CRAWLER_TOGGLE_COPY: Record<"es" | "en", AiCrawlerToggleCopy> = {
  es: {
    label: "IA puede leer mi sitio",
    info: "Permite que los asistentes de IA y los buscadores lean y citen tus posts. Apágalo para pedirles que no lo hagan.",
    saveFailed: "No se pudo guardar. Inténtalo de nuevo.",
  },
  en: {
    label: "AI can read my site",
    info: "Lets AI assistants and search engines read and cite your posts. Turn it off to ask them not to.",
    saveFailed: "Could not save. Try again.",
  },
};
