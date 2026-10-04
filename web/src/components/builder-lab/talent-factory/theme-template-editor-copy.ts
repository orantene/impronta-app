/** EN + ES copy for the Talent design editor (theme_template surface). No em dashes. */
export type EditorLang = "en" | "es";

export const EDITOR_COPY: Record<
  EditorLang,
  {
    pageTitle: string;
    previewing: (label: string) => string;
    tabHome: string;
    tabShell: string;
    tabsAria: string;
    publish: string;
    exit: string;
    releaseManager: string;
    more: string;
    draftUnavailable: (reason: string) => string;
    disabled: string;
    back: string;
  }
> = {
  en: {
    pageTitle: "Talent design editor",
    previewing: (label) => `Talent design editor, previewing ${label}`,
    tabHome: "Home",
    tabShell: "Shell",
    tabsAria: "Design tree",
    publish: "Publish as new version",
    exit: "Exit editor",
    releaseManager: "Open release manager",
    more: "More actions",
    draftUnavailable: (reason) => `This design draft could not be opened: ${reason}`,
    disabled: "The talent design editor is turned off.",
    back: "Back to the Talent Template Factory",
  },
  es: {
    pageTitle: "Editor de diseños de talento",
    previewing: (label) => `Editor de diseños de talento, vista previa de ${label}`,
    tabHome: "Inicio",
    tabShell: "Estructura",
    tabsAria: "Árbol del diseño",
    publish: "Publicar como nueva versión",
    exit: "Salir del editor",
    releaseManager: "Abrir gestor de versiones",
    more: "Más acciones",
    draftUnavailable: (reason) => `No se pudo abrir el borrador de este diseño: ${reason}`,
    disabled: "El editor de diseños de talento está desactivado.",
    back: "Volver a la Fábrica de plantillas de talento",
  },
};
