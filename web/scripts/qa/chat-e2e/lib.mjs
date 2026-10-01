import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export class Blocked extends Error {}

export function makeRecorder(outDir) {
  mkdirSync(outDir, { recursive: true });
  const rows = [];
  let n = 0;
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  /** Run one step. fn(note) may call note("...") to add reasons; throw Blocked for BLOCKED, any other throw is FAIL. */
  async function step(width, name, page, fn, opts = {}) {
    const reasons = [];
    let status = "PASS";
    const note = (m) => reasons.push(m);
    const warn = (m) => reasons.push("WARN: " + m);
    try {
      await fn({ note, warn });
    } catch (e) {
      status = e instanceof Blocked ? "BLOCKED" : "FAIL";
      reasons.push(String(e.message || e).split("\n").slice(0, 3).join(" | "));
    }
    let shot = null;
    if (page && !page.isClosed()) {
      shot = `${String(++n).padStart(2, "0")}-${width}-${slug(name)}.png`;
      await page.screenshot({ path: join(outDir, shot), fullPage: false }).catch(() => { shot = null; });
    }
    rows.push({ width, name, status, reasons, shot, group: opts.group || "" });
    console.log(`[${width}] ${status.padEnd(7)} ${name}${reasons.length ? "  -- " + reasons.join("; ") : ""}`);
    return status;
  }
  function writeReport(meta) {
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const c = { PASS: 0, FAIL: 0, BLOCKED: 0 };
    rows.forEach((r) => c[r.status]++);
    const html = `<!doctype html><meta charset=utf-8><title>chat e2e</title><style>
body{font:14px system-ui;margin:24px;background:#fafafa;color:#111}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px 8px;vertical-align:top;background:#fff}
.PASS{color:#0a7a2f;font-weight:700}.FAIL{color:#c00;font-weight:700}.BLOCKED{color:#b86e00;font-weight:700}img{width:180px;border:1px solid #ccc}</style>
<h1>Guest chat e2e</h1><p>${esc(JSON.stringify(meta))}</p><p><b>${c.PASS} PASS / ${c.FAIL} FAIL / ${c.BLOCKED} BLOCKED</b></p>
<table><tr><th>Width</th><th>Step</th><th>Status</th><th>Reasons</th><th>Screenshot</th></tr>
${rows.map((r) => `<tr><td>${r.width}</td><td>${esc(r.name)}</td><td class=${r.status}>${r.status}</td><td>${r.reasons.map(esc).join("<br>")}</td><td>${r.shot ? `<a href="${r.shot}"><img src="${r.shot}" loading=lazy></a>` : ""}</td></tr>`).join("\n")}</table>`;
    writeFileSync(join(outDir, "report.html"), html);
    writeFileSync(join(outDir, "summary.json"), JSON.stringify({ meta, counts: c, rows }, null, 2));
    return c;
  }
  return { step, writeReport, rows };
}

/**
 * Production builds set the guest cookie with `Secure`, which Chromium drops on plain http://<slug>.tulala.digital.
 * Real users are on https. To exercise the resume path locally we proxy requests to the public host ourselves and
 * remove `Secure` from Set-Cookie (test-env shim only; nothing else is changed).
 */
export async function stripSecure(ctx, APEX, PORT) {
  await ctx.route((u) => u.hostname.endsWith("." + APEX), async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    try {
      const resp = await route.fetch({ url: `http://127.0.0.1:${PORT}${u.pathname}${u.search}`, headers: { ...req.headers(), host: u.host }, maxRedirects: 0 });
      const headers = {};
      for (const { name, value } of resp.headersArray()) {
        const k = name.toLowerCase();
        const v = k === "set-cookie" ? value.replace(/;\s*secure/gi, "") : value;
        headers[k] = headers[k] ? headers[k] + (k === "set-cookie" ? "\n" : ", ") + v : v;
      }
      await route.fulfill({ response: resp, headers });
    } catch (e) { await route.abort(); }
  });
}

