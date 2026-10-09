/** Words on the signed-out landing of the workspace host (app.tulala.digital). */
export type AppLandingCopy = {
  nav: { discover: string; talent: string; pricing: string };
  back: string;
  workspace: string;
  welcome: string;
  lead: string;
  signIn: string;
  createAccount: string;
  publicSite: string;
  goTo: string;
  terms: string;
  privacy: string;
  homeAria: string;
  languageGroup: string;
};

export function appLandingCopy(locale: string, brand: string): AppLandingCopy {
  const es = locale.trim().toLowerCase().startsWith("es");
  return es
    ? {
        nav: { discover: "Descubrir", talent: "Talento", pricing: "Precios" },
        back: `← Volver a ${brand}`,
        workspace: `Espacio de trabajo de ${brand}`,
        welcome: `Te damos la bienvenida a ${brand}`,
        lead: "Inicia sesión para entrar a tu panel. Todo lo que hay detrás es privado de tu cuenta.",
        signIn: "Iniciar sesión",
        createAccount: "Crear una cuenta",
        publicSite: "¿Buscas el sitio público?",
        goTo: `Ir a ${brand}`,
        terms: "Términos",
        privacy: "Privacidad",
        homeAria: `Inicio de ${brand}`,
        languageGroup: "Idioma",
      }
    : {
        nav: { discover: "Discover", talent: "Talent", pricing: "Pricing" },
        back: `← Back to ${brand}`,
        workspace: `${brand} workspace`,
        welcome: `Welcome to ${brand}`,
        lead: "Sign in to get to your dashboard. Everything behind it is private to your account.",
        signIn: "Sign in",
        createAccount: "Create an account",
        publicSite: "Looking for the public site?",
        goTo: `Go to ${brand}`,
        terms: "Terms",
        privacy: "Privacy",
        homeAria: `${brand} home`,
        languageGroup: "Language",
      };
}
