/**
 * Self-contained HTML for the staging gate (TUL-827). No app CSS, no scripts,
 * no external assets: it must render before any host is resolved.
 */
import { STAGING_GATE_PATH } from "./staging-gate-core";

export type GateLang = "en" | "es";

const COPY: Record<GateLang, Record<"title" | "lead" | "label" | "button" | "wrong" | "limited", string>> = {
  en: {
    title: "Tulala staging",
    lead: "This is a private test site. Enter the staging password to continue.",
    label: "Password",
    button: "Continue",
    wrong: "That password is not right. Try again.",
    limited: "Too many attempts. Wait a few minutes and try again.",
  },
  es: {
    title: "Tulala staging",
    lead: "Este es un sitio de pruebas privado. Escribe la contraseña de staging para continuar.",
    label: "Contraseña",
    button: "Continuar",
    wrong: "Esa contraseña no es correcta. Inténtalo de nuevo.",
    limited: "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.",
  },
};

export function stagingGateLang(acceptLanguage: string | null | undefined): GateLang {
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("es") ? "es" : "en";
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export function renderStagingGatePage(opts: { lang: GateLang; next: string; error?: "wrong" | "limited" }): string {
  const t = COPY[opts.lang];
  const err = opts.error ? `<p class="err" role="alert">${escapeHtml(t[opts.error])}</p>` : "";
  return `<!doctype html>
<html lang="${opts.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(t.title)}</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;background:#f6f6f4;color:#1a1a1a;padding:16px;box-sizing:border-box}
main{width:100%;max-width:360px;background:#fff;border:1px solid #e4e4e0;border-radius:12px;padding:28px}
h1{font-size:20px;margin:0 0 8px}p{font-size:14px;line-height:1.5;margin:0 0 16px;color:#555}
label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}
input{width:100%;box-sizing:border-box;font-size:16px;padding:10px 12px;border:1px solid #ccc;border-radius:8px}
button{margin-top:14px;width:100%;font-size:15px;font-weight:600;padding:11px;border:0;border-radius:8px;background:#1a1a1a;color:#fff;cursor:pointer}
.err{color:#b42318}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(t.title)}</h1>
<p>${escapeHtml(t.lead)}</p>
${err}<form method="post" action="${STAGING_GATE_PATH}">
<input type="hidden" name="next" value="${escapeHtml(opts.next)}">
<label for="pw">${escapeHtml(t.label)}</label>
<input id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
<button type="submit">${escapeHtml(t.button)}</button>
</form>
</main>
</body>
</html>`;
}
