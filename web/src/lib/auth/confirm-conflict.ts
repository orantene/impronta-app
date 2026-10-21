/**
 * TUL-774: the page /auth/confirm shows when its link is opened while someone is already
 * signed in. PURE (no request, no env): the route passes the translator and the two hrefs.
 * Every dynamic value is HTML-escaped; the page is a plain document so it renders on any
 * host without the auth layout.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function confirmConflictHtml(input: {
  t: (key: string) => string;
  signedInEmail: string;
  continueHref: string;
  stayHref: string;
}): string {
  const { t } = input;
  const body = t("public.auth.confirmConflict.body").replace("{email}", escapeHtml(input.signedInEmail));
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${escapeHtml(t("public.auth.confirmConflict.title"))}</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f6f5f1;color:#1a1a1a;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
main{max-width:420px;width:100%;background:#fff;border:1px solid #e5e5e5;border-radius:24px;padding:28px}
h1{font-size:1.375rem;margin:0 0 8px}
p{font-size:.9375rem;line-height:1.55;color:#444;margin:0 0 20px}
a{display:flex;align-items:center;justify-content:center;min-height:48px;border-radius:999px;text-decoration:none;font-weight:600;font-size:.9375rem;margin-top:10px}
a.primary{background:#1f4d3a;color:#fff}
a.secondary{border:1px solid #c9c9c4;color:#1a1a1a}
</style></head>
<body><main role="main">
<h1>${escapeHtml(t("public.auth.confirmConflict.title"))}</h1>
<p>${body}</p>
<a class="primary" href="${escapeHtml(input.continueHref)}">${escapeHtml(t("public.auth.confirmConflict.continue"))}</a>
<a class="secondary" href="${escapeHtml(input.stayHref)}">${escapeHtml(t("public.auth.confirmConflict.stay"))}</a>
</main></body></html>`;
}
