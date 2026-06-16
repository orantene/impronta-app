import { pickLocale } from "@/lib/i18n/pick-locale";

export type TalentSiteLocale = "en" | "es";

const COPY = {
  en: {
    pageTitle: "My site",
    pageSubtitle:
      "Manage your own Tulala profile/site and see the agency rosters where clients can find you.",
    personalSiteTitle: "My personal site",
    personalSiteSubtitle: "Your owned Tulala page — controlled by your Talent plan.",
    freeCardTitle: "My Tulala Digital profile",
    freeCardSubtitle:
      "Included with Free. Publish your basic Tulala profile using the locked Tulala Digital template.",
    proCardTitle: "My premium profile",
    proCardSubtitle: "Choose a premium template for your public Tulala profile.",
    maxCardTitle: "My service website",
    maxCardSubtitle:
      "Build and publish your own personal service website from your profile, media, and services.",
    templateIncluded: "Included",
    templateChange: "Change template",
    upgradeProTemplates: "Upgrade to Pro to choose premium templates.",
    upgradeMaxBuilder:
      "Upgrade to Max to customize sections and build a full personal service website.",
    upgradeMaxService:
      "Upgrade to Max to build a custom service website with editable sections.",
    modeTemplate: "Use a template",
    modeCustom: "Custom builder",
    customBuilderBlurb:
      "Add, reorder, and customize sections for your personal service website.",
    welcomeReady:
      "Your Tulala Digital profile is ready — review and publish to go live.",
    profileCodeRequired: "Set a profile code first to claim your URL.",
    hiddenWarning:
      "Your profile is hidden from public listings. Your site will not be visible until you make your profile public.",
    createSite: "Create your personal site",
    createSiteBlurb:
      "We'll generate a starter layout from your public profile — hero, services, gallery, and contact CTA.",
    appearancesTitle: "Where you appear",
    appearancesSubtitle: "Every public place where clients can find this profile.",
    labelPersonalSite: "Your personal site",
    labelAgencyRoster: "Agency roster",
    labelWorkspaceRoster: "Workspace roster",
    descPersonalSite: "Owned by you · Controlled by your Talent plan",
    whereManage: "Manage",
    whereViewSite: "View site",
    whereViewRoster: "View roster profile",
    pageBuilderCtaTitle: "Page Builder",
    pageBuilderCtaSubtitle:
      "Design a fully custom, freeform page — drag-and-drop sections, your own media, and a layout that is entirely yours.",
    pageBuilderCtaAction: "Open builder",
  },
  es: {
    pageTitle: "Mi sitio",
    pageSubtitle:
      "Administra tu perfil/sitio Tulala y consulta las listas de agencias donde los clientes pueden encontrarte.",
    personalSiteTitle: "Mi sitio personal",
    personalSiteSubtitle: "Tu página Tulala — controlada por tu plan Talent.",
    freeCardTitle: "Mi perfil Tulala Digital",
    freeCardSubtitle:
      "Incluido con Free. Publica tu perfil básico con la plantilla Tulala Digital.",
    proCardTitle: "Mi perfil premium",
    proCardSubtitle: "Elige una plantilla premium para tu perfil público en Tulala.",
    maxCardTitle: "Mi sitio de servicios",
    maxCardSubtitle:
      "Crea y publica tu sitio personal de servicios con tu perfil, medios y servicios.",
    templateIncluded: "Incluido",
    templateChange: "Cambiar plantilla",
    upgradeProTemplates: "Mejora a Pro para elegir plantillas premium.",
    upgradeMaxBuilder:
      "Mejora a Max para personalizar secciones y crear un sitio de servicios completo.",
    upgradeMaxService:
      "Mejora a Max para crear un sitio de servicios con secciones editables.",
    modeTemplate: "Usar plantilla",
    modeCustom: "Editor personalizado",
    customBuilderBlurb:
      "Añade, reordena y personaliza secciones para tu sitio de servicios.",
    welcomeReady:
      "Tu perfil Tulala Digital está listo — revísalo y publícalo para estar en línea.",
    profileCodeRequired: "Primero define tu código de perfil para obtener tu URL.",
    hiddenWarning:
      "Tu perfil está oculto. Tu sitio no será visible hasta que hagas tu perfil público.",
    createSite: "Crear tu sitio personal",
    createSiteBlurb:
      "Generaremos un diseño inicial con tu perfil público: héroe, servicios, galería y contacto.",
    appearancesTitle: "Dónde apareces",
    appearancesSubtitle: "Cada lugar público donde los clientes pueden encontrarte.",
    labelPersonalSite: "Tu sitio personal",
    labelAgencyRoster: "Lista de agencia",
    labelWorkspaceRoster: "Lista del workspace",
    descPersonalSite: "Tuyo · Controlado por tu plan Talent",
    whereManage: "Administrar",
    whereViewSite: "Ver sitio",
    whereViewRoster: "Ver perfil en lista",
    pageBuilderCtaTitle: "Editor de página",
    pageBuilderCtaSubtitle:
      "Diseña una página totalmente personalizada y libre — secciones de arrastrar y soltar, tus propios medios y un diseño completamente tuyo.",
    pageBuilderCtaAction: "Abrir editor",
  },
} as const;

export type TalentSiteCopyKey = keyof (typeof COPY)["en"];

export function talentSiteCopy(
  locale: TalentSiteLocale | string | undefined,
  key: TalentSiteCopyKey,
): string {
  const loc = pickLocale(locale, { en: "en", es: "es" } as const);
  return COPY[loc][key];
}
