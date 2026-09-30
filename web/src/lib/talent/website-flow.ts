/**
 * ONE free-website state for every surface (top pill, Today, My presence).
 * Mockup: `REWARD` (pill), `REWARD_CARD`, SCREENS.tc_new_ready / mz_unlocked.
 *
 * States come from data the talent actually produced, never from a
 * provisioned row: the /talent/site loader creates a draft `talent_sites`
 * row just by being opened, so "a draft row exists" says nothing (F23).
 *   notReady  profile under 100%
 *   ready     100%, no design applied (theme_design_slug null)
 *   preview   a design is applied and the site is not published
 *   published site_published_at set
 */

export type WebsiteFlowState = "notReady" | "ready" | "preview" | "published";

/** Where the next action lands in the setup flow. */
export type WebsiteSetupStep = "gallery" | "review";

export function websiteFlowState(input: {
  percent: number | null;
  isPublished: boolean;
  themeDesignSlug: string | null;
}): WebsiteFlowState {
  if (input.isPublished) return "published";
  if (input.percent == null || input.percent < 100) return "notReady";
  if (input.themeDesignSlug) return "preview";
  return "ready";
}

/** A chosen design resumes at review; otherwise choose a design (step 1). */
export function websiteSetupStep(state: WebsiteFlowState): WebsiteSetupStep {
  return state === "preview" ? "review" : "gallery";
}

export type WebsiteFlowCopy = {
  /** Pill lead ("✓ Profile complete" or "{pct}%"). */
  pillLead: string;
  /** Pill action. */
  pillAction: string;
  tone: "idle" | "brand" | "ok";
  /** Today hero card (tc_new_ready). */
  todayTitle: string;
  todaySub: string;
  /** Today button: mockup tc_new_ready says "Create my website" (same action as cta). */
  todayCta: string | null;
  /** My presence card (mz_unlocked). */
  cardTitle: string;
  cardSub: string;
  /** The ONE next action; same label on Today and My presence. */
  cta: string | null;
};

export function websiteFlowCopy(
  state: WebsiteFlowState,
  percent: number,
  es: boolean,
  /** Applied design line from appliedThemeLine(); preview state only. */
  designLine = "",
): WebsiteFlowCopy {
  const T = (en: string, sp: string) => (es ? sp : en);
  const complete = T("✓ Profile complete", "✓ Perfil completo");
  switch (state) {
    case "notReady":
      return {
        pillLead: `${percent}%`,
        pillAction: T("Unlock your free website", "Desbloquea tu sitio gratis"),
        tone: "idle",
        todayTitle: T("Unlock your free website", "Desbloquea tu sitio gratis"),
        todaySub: T(`Your profile is ${percent}% complete`, `Tu perfil está ${percent}% completo`),
        todayCta: null,
        cardTitle: T("Unlock your free website", "Desbloquea tu sitio gratis"),
        cardSub: T(`Your profile is ${percent}% complete`, `Tu perfil está ${percent}% completo`),
        cta: null,
      };
    case "ready":
      return {
        pillLead: complete,
        pillAction: T("Activate your website", "Activa tu sitio"),
        tone: "brand",
        todayTitle: T("Your free website is ready", "Tu sitio gratis está listo"),
        todaySub: T(
          "Pick a design, check it with your real services and photos, then choose your address.",
          "Elige un diseño, revísalo con tus servicios y fotos reales, y elige tu dirección.",
        ),
        todayCta: T("Create my website", "Crear mi sitio"),
        cardTitle: T("Free website unlocked", "Sitio gratis desbloqueado"),
        cardSub: T("Activate it and we build it from your profile", "Actívalo y lo armamos con tu perfil"),
        cta: T("Activate your free website", "Activa tu sitio gratis"),
      };
    case "preview": {
      const sub = T("Have a look, then publish it", "Échale un ojo y publícalo");
      const withDesign = designLine ? `${designLine} · ${sub}` : sub;
      return {
        pillLead: complete,
        pillAction: T("Preview & publish", "Ver y publicar"),
        tone: "brand",
        todayTitle: T("Your website is ready", "Tu sitio está listo"),
        todaySub: withDesign,
        todayCta: T("Preview & publish", "Ver y publicar"),
        cardTitle: T("Your website is ready", "Tu sitio está listo"),
        cardSub: withDesign,
        cta: T("Preview & publish", "Ver y publicar"),
      };
    }
    case "published":
      return {
        pillLead: "",
        pillAction: T("Website live", "Sitio en línea"),
        tone: "ok",
        todayTitle: T("Your website is live", "Tu sitio está en línea"),
        todaySub: "",
        todayCta: null,
        cardTitle: T("Website live", "Sitio en línea"),
        cardSub: "",
        cta: null,
      };
  }
}
